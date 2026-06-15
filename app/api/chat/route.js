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
    const message = body?.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "请输入内容" }, { status: 400 });
    }

    const encoder = new TextEncoder();

    function send(controller, event, data) {
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await runEatAgentStream(message, {
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
