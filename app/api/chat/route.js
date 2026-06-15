import { NextResponse } from "next/server";
import { runFoodAgentStream } from "../../../lib/agent";

function getSafeErrorMessage(error) {
  const message = error.message || "请求失败";
  const status = error.status || error.code;

  if (
    status === 401 ||
    message.includes("401") ||
    message.includes("API key") ||
    message.includes("Incorrect API key")
  ) {
    return "模型鉴权失败，请检查 OPENROUTER_API_KEY / OPENAI_API_KEY 和 BASE_URL";
  }

  if (message.includes("公开 API 请求失败") || message.includes("公开 API 请求超时")) {
    return "公开菜谱数据暂时不可用，请稍后重试";
  }

  if (message.includes("工具参数解析失败")) {
    return "模型工具调用参数异常，请重试";
  }

  return "请求失败，请稍后重试";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const cardContext = typeof body?.cardContext === "string" ? body.cardContext.trim() : "";
    const fallbackMessage = body?.message?.trim();
    const inputMessages = messages.length > 0 ? messages : [{ role: "user", content: fallbackMessage }];
    const latestMessage = inputMessages.at(-1)?.content?.trim();

    if (!latestMessage) {
      return NextResponse.json({ error: "请输入内容" }, { status: 400 });
    }

    const encoder = new TextEncoder();

    function send(controller, event, data) {
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await runFoodAgentStream(
            inputMessages,
            {
              onCards: (cards) => send(controller, "cards", { cards }),
              onTrace: (trace) => send(controller, "trace", trace),
              onDelta: (delta) => send(controller, "delta", { delta }),
              onDone: () => send(controller, "done", {})
            },
            { cardContext }
          );
        } catch (error) {
          send(controller, "error", { error: getSafeErrorMessage(error) });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: getSafeErrorMessage(error)
      },
      { status: 500 }
    );
  }
}
