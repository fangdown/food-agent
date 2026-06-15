import { toolDefinitions, toolHandlers } from "./tools";

import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const SYSTEM_PROMPT = `
你是一个智能食谱助手 Agent。
用户会用中文描述想吃什么，你需要自主决定调用工具搜索菜谱、查看菜谱详情、搜索饮品。
只要用户在询问菜谱、晚餐推荐、食材搭配或饮品搭配，必须先调用工具获取真实公开 API 数据，再回答。
不要凭空编造菜谱或饮品。
如果用户要求推荐一顿饭，至少调用 search_meals；如果需要配饮，同时调用 search_cocktails。
如果用户查看某个菜谱详情，例如“第一个/第三个/这个菜谱”，先调用 get_meal_detail 获取详情，再调用 search_cocktails 按该菜谱食材或风味搜索配饮。
如果用户的指代不明确，或当前上下文里没有对应的菜谱/饮品卡片，不要猜测、不重新搜索；先用一句话追问用户要查看哪一个。
用户只说推荐晚餐时，只给一个主菜和配饮，不要主动推荐配菜；只有用户明确要求“配菜/更多菜/套餐”时，才额外推荐其他菜。
配饮必须根据菜谱的主要食材、菜系或风味选择英文关键词搜索，例如 chicken 可用 lemon、ginger、wine，seafood 可用 citrus、gin；配饮不要使用 random，除非用户明确要求随机饮品。
TheMealDB 和 TheCocktailDB 的搜索关键词通常需要英文；如果用户输入中文，请你转换成合适的英文关键词再调用工具。
如果用户说“第一个”“上一个”等，请结合对话历史和工具结果理解。
最终用简洁中文回答，包含主菜和配饮、主要食材、烹饪要点和配饮建议。
`;

function getInstructions(extraContext = "") {
  if (!extraContext) return SYSTEM_PROMPT;

  return `${SYSTEM_PROMPT}

内部上下文，仅用于理解“第一个”“上一个”等指代，禁止在最终回答中复述或提到：
${extraContext}`;
}

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

function getChatFunctionCalls(message) {
  return message.tool_calls?.filter((call) => call.type === "function") || [];
}

function getChatTools() {
  return toolDefinitions.map(({ type, name, description, parameters }) => ({
    type,
    function: {
      name,
      description,
      parameters
    }
  }));
}

function getChatMessages(input, instructions) {
  return [
    {
      role: "system",
      content: instructions
    },
    ...input.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];
}

function parseArguments(rawArguments) {
  if (!rawArguments) return {};
  if (typeof rawArguments === "object") return rawArguments;
  return JSON.parse(rawArguments);
}

function createToolError(summary) {
  return {
    status: "error",
    summary,
    next_actions: ["重新生成工具参数"],
    artifacts: [],
    data: null
  };
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

function getModelConfig() {
  const openrouterApiKey = getConfigValue("OPENROUTER_API_KEY");
  const openaiApiKey = getConfigValue("OPENAI_API_KEY");
  const baseURL = getConfigValue("OPENROUTER_BASE_URL") || getConfigValue("OPENAI_BASE_URL");
  const isOpenRouter = Boolean(openrouterApiKey || baseURL?.includes("openrouter.ai"));

  return {
    apiKey: openrouterApiKey || openaiApiKey,
    baseURL: baseURL || (isOpenRouter ? OPENROUTER_BASE_URL : undefined),
    model: getConfigValue("OPENROUTER_MODEL") || getConfigValue("OPENAI_MODEL") || (isOpenRouter ? "openai/gpt-4o-mini" : "gpt-5.5"),
    provider: isOpenRouter ? "openrouter" : "openai"
  };
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

function isFoodIntent(text = "") {
  return /吃|菜|饭|餐|食|谱|晚餐|午餐|早餐|夜宵|饮|喝|鸡|牛|猪|鱼|虾|肉|素|甜点|面|粥|汤|rice|meal|food|recipe|drink|chicken|beef|pork|fish|vegetarian/i.test(text);
}

async function runToolCall(call, traces, input) {
  const name = call.name || call.function?.name;
  const rawArguments = call.arguments ?? call.function?.arguments;
  const handler = toolHandlers[name];
  let args = {};
  let result;

  try {
    args = parseArguments(rawArguments);
  } catch {
    result = createToolError(`工具参数解析失败：${name}`);
  }

  if (!result) {
    result = handler
      ? await handler(args)
      : {
          status: "error",
          summary: `未知工具：${name}`,
          next_actions: ["检查工具注册表"],
          artifacts: [],
          data: null
        };
  }

  traces?.push({
    tool: name,
    arguments: args,
    result
  });

  if (input) {
    input.push({
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(result)
    });
  }

  return {
    name,
    args,
    result
  };
}

async function runChatToolCall(call, chatMessages, handlers) {
  const { name, args, result } = await runToolCall(call);

  handlers?.onTrace?.({
    tool: name,
    arguments: args,
    result
  });
  const cards = getCardsFromToolResult(result);
  if (cards.length > 0) {
    handlers?.onCards?.(cards);
  }

  chatMessages.push({
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify(result)
  });
}

async function runFoodAgentWithChatCompletions(client, model, input, instructions, handlers = {}, options = {}) {
  const chatMessages = getChatMessages(input, instructions);
  const traces = [];
  const shouldUseTools = options.shouldUseTools ?? true;
  let calledTool = false;

  for (let step = 0; step < 6; step += 1) {
    const response = await client.chat.completions.create({
      model,
      messages: chatMessages,
      tools: getChatTools(),
      tool_choice: "auto"
    });
    const message = response.choices?.[0]?.message || {};
    const calls = getChatFunctionCalls(message);

    chatMessages.push(message);

    if (calls.length === 0) {
      if (shouldUseTools && !calledTool && step === 0) {
        chatMessages.push({
          role: "user",
          content: "请先调用合适的工具查询真实菜谱或饮品数据，不要直接回答。"
        });
        continue;
      }

      return {
        answer: message.content || "",
        traces
      };
    }

    for (const call of calls) {
      calledTool = true;
      await runChatToolCall(call, chatMessages, {
        onTrace: (trace) => {
          traces.push(trace);
          handlers.onTrace?.(trace);
        },
        onCards: handlers.onCards
      });
    }
  }

  return {
    answer: "",
    traces
  };
}

export async function runFoodAgent(messagesOrMessage) {
  const { apiKey, baseURL, model, provider } = getModelConfig();

  if (!apiKey) {
    throw new Error("缺少 OPENROUTER_API_KEY 或 OPENAI_API_KEY");
  }

  const client = new OpenAI({
    apiKey,
    baseURL
  });
  const traces = [];
  const input = normalizeMessages(messagesOrMessage);
  let answer = "";

  if (provider === "openrouter") {
    const result = await runFoodAgentWithChatCompletions(client, model, input, SYSTEM_PROMPT);

    return {
      answer: result.answer || "已完成搭配，但模型没有返回文本。",
      traces: result.traces
    };
  }

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
      await runToolCall(call, traces, input);
    }
  }

  return {
    answer: answer || "已完成搭配，但模型没有返回文本。",
    traces
  };
}

export async function runFoodAgentStream(message, handlers = {}, options = {}) {
  const { apiKey, baseURL, model, provider } = getModelConfig();

  if (!apiKey) {
    throw new Error("缺少 OPENROUTER_API_KEY 或 OPENAI_API_KEY");
  }

  const client = new OpenAI({
    apiKey,
    baseURL
  });
  const input = normalizeMessages(message);
  const instructions = getInstructions(options.cardContext);
  const shouldUseTools = isFoodIntent(input.at(-1)?.content);
  let answer = "";
  let calledTool = false;
  let finalText = "";

  if (provider === "openrouter") {
    const result = await runFoodAgentWithChatCompletions(client, model, input, instructions, handlers, { shouldUseTools });
    finalText = result.answer;

    for (const char of Array.from(finalText)) {
      answer += char;
      handlers.onDelta?.(char);
    }

    handlers.onDone?.();
    return;
  }

  for (let step = 0; step < 6; step += 1) {
    const response = await client.responses.create({
      model,
      instructions,
      input,
      tools: toolDefinitions,
      tool_choice: "auto"
    });
    const calls = getFunctionCalls(response);

    input.push(...response.output);

    if (calls.length === 0) {
      if (!shouldUseTools) {
        finalText = getTextFromResponse(response);
        break;
      }
      if (!calledTool && step === 0) {
        input.push({
          role: "user",
          content: "请先调用合适的工具查询真实菜谱或饮品数据，不要直接回答。"
        });
        continue;
      }
      finalText = getTextFromResponse(response);
      break;
    }

    for (const call of calls) {
      calledTool = true;
      const { args, result } = await runToolCall(call);

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
    }
  }

  if (!finalText) {
    const stream = client.responses.stream({
      model,
      instructions,
      input
    });

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        answer += event.delta;
        handlers.onDelta?.(event.delta);
      }
    }

    handlers.onDone?.();
    return;
  }

  for (const char of Array.from(finalText)) {
    answer += char;
    handlers.onDelta?.(char);
  }

  handlers.onDone?.();
}
