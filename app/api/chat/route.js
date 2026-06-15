import { NextResponse } from "next/server";
import { runEatAgentStream } from "../../../lib/agent";

function getSafeErrorMessage(error) {
  const message = error.message || "请求失败";
  const status = error.status || error.code;

  if (
    status === 401 ||
    message.includes("401") ||
    message.includes("API key") ||
    message.includes("Incorrect API key")
  ) {
    return "OpenAI 鉴权失败，请检查 OPENAI_API_KEY 和 OPENAI_BASE_URL";
  }

  return message;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
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
          await runEatAgentStream(inputMessages, {
            onCards: (cards) => send(controller, "cards", { cards }),
            onTrace: (trace) => send(controller, "trace", trace),
            onDelta: (delta) => send(controller, "delta", { delta }),
            onDone: () => send(controller, "done", {})
          });
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
