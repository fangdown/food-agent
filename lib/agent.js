import { toolDefinitions, toolHandlers } from "./tools";

import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

const SYSTEM_PROMPT = `
你是一个智能食谱助手 Agent。
用户会用中文描述想吃什么，你需要自主决定调用工具搜索菜谱、查看菜谱详情、搜索饮品。
必须优先使用工具获取真实公开 API 数据，不要凭空编造菜谱或饮品。
TheMealDB 和 TheCocktailDB 的搜索关键词通常需要英文；如果用户输入中文，请你转换成合适的英文关键词再调用工具。
如果用户说“第一个”“上一个”等，请结合对话历史和工具结果理解。
最终用简洁中文回答，包含推荐菜谱、主要食材、烹饪要点和配饮建议。
`;

function getTextFromResponse(response) {
  if (response.output_text) return response.output_text;

  return response.output
    ?.flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("\n") || "";
}

function getFunctionCalls(response) {
  return response.output?.filter((item) => item.type === "function_call") || [];
}

function parseArguments(rawArguments) {
  if (!rawArguments) return {};
  if (typeof rawArguments === "object") return rawArguments;
  return JSON.parse(rawArguments);
}

function stripQuotes(value) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function readEnvFileValue(name) {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(/* turbopackIgnore: true */ process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    const match = lines.find((line) => line.startsWith(`${name}=`));
    if (!match) continue;

    const value = stripQuotes(match.slice(name.length + 1));
    if (value) return value;
  }

  return undefined;
}

function getConfigValue(name) {
  return readEnvFileValue(name) || process.env[name]?.trim();
}

function normalizeMessages(messagesOrMessage) {
  if (Array.isArray(messagesOrMessage)) {
    return messagesOrMessage
      .filter((message) => ["user", "assistant"].includes(message.role) && message.content)
      .slice(-8)
      .map((message) => ({
        role: message.role,
        content: message.content
      }));
  }

  return [
    {
      role: "user",
      content: messagesOrMessage
    }
  ];
}

function getCardsFromToolResult(result) {
  return result?.data?.cards || [];
}

export async function runEatAgent(messagesOrMessage) {
  const apiKey = getConfigValue("OPENAI_API_KEY");
  const baseURL = getConfigValue("OPENAI_BASE_URL") || undefined;

  if (!apiKey) {
    throw new Error("缺少 OPENAI_API_KEY");
  }

  const client = new OpenAI({
    apiKey,
    baseURL
  });
  const model = getConfigValue("OPENAI_MODEL") || "gpt-5.5";
  const traces = [];
  const input = normalizeMessages(messagesOrMessage);
  let answer = "";

  for (let step = 0; step < 6; step += 1) {
    const response = await client.responses.create({
      model,
      instructions: SYSTEM_PROMPT,
      input,
      tools: toolDefinitions,
      tool_choice: "auto"
    });
    const calls = getFunctionCalls(response);

    input.push(...response.output);

    if (calls.length === 0) {
      answer = getTextFromResponse(response);
      break;
    }

    for (const call of calls) {
      const handler = toolHandlers[call.name];
      const args = parseArguments(call.arguments);
      const result = handler
        ? await handler(args)
        : {
            status: "error",
            summary: `未知工具：${call.name}`,
            next_actions: ["检查工具注册表"],
            artifacts: [],
            data: null
          };

      traces.push({
        tool: call.name,
        arguments: args,
        result
      });

      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      });
    }
  }

  return {
    answer: answer || "已完成搭配，但模型没有返回文本。",
    traces
  };
}

export async function runEatAgentStream(message, handlers = {}) {
  const apiKey = getConfigValue("OPENAI_API_KEY");
  const baseURL = getConfigValue("OPENAI_BASE_URL") || undefined;

  if (!apiKey) {
    throw new Error("缺少 OPENAI_API_KEY");
  }

  const client = new OpenAI({
    apiKey,
    baseURL
  });
  const model = getConfigValue("OPENAI_MODEL") || "gpt-5.5";
  const input = normalizeMessages(message);
  let answer = "";
  let shouldStreamFinalAnswer = false;

  for (let step = 0; step < 6; step += 1) {
    const response = await client.responses.create({
      model,
      instructions: SYSTEM_PROMPT,
      input,
      tools: toolDefinitions,
      tool_choice: "auto"
    });
    const calls = getFunctionCalls(response);

    input.push(...response.output);

    if (calls.length === 0) {
      break;
    }

    for (const call of calls) {
      const handler = toolHandlers[call.name];
      const args = parseArguments(call.arguments);
      const result = handler
        ? await handler(args)
        : {
            status: "error",
            summary: `未知工具：${call.name}`,
            next_actions: ["检查工具注册表"],
            artifacts: [],
            data: null
          };

      handlers.onTrace?.({
        tool: call.name,
        arguments: args,
        result
      });
      const cards = getCardsFromToolResult(result);
      if (cards.length > 0) {
        handlers.onCards?.(cards);
      }

      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      });

      shouldStreamFinalAnswer = true;
    }

    if (shouldStreamFinalAnswer) {
      break;
    }
  }

  const stream = client.responses.stream({
    model,
    instructions: SYSTEM_PROMPT,
    input
  });

  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      answer += event.delta;
      handlers.onDelta?.(event.delta);
    }
  }

  handlers.onDone?.();
}
