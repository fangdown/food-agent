"use client";

import { useState } from "react";

const examples = [
  "我今晚吃红烧肉，配什么菜和饮料？",
  "我想吃火锅",
  "今天吃沙拉，怎么搭配？"
];

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "告诉我你想吃什么主菜，我会调用工具给你配菜和饮料。"
    }
  ]);
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function readSseEvents(buffer, onEvent) {
    const parts = buffer.split("\n\n");
    const rest = parts.pop() || "";

    for (const part of parts) {
      const lines = part.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
      const dataLine = lines.find((line) => line.startsWith("data: "));
      if (!event || !dataLine) continue;

      onEvent(event, JSON.parse(dataLine.slice(6)));
    }

    return rest;
  }

  async function sendMessage(text) {
    const message = text.trim();
    if (!message || loading) return;

    setInput("");
    setError("");
    setLoading(true);
    setTraces([]);
    setMessages((current) => [...current, { role: "user", content: message }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "请求失败");
      }

      const assistantIndex = messages.length + 1;
      setMessages((current) => [...current, { role: "assistant", content: "" }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        buffer = readSseEvents(buffer, (event, data) => {
          if (event === "trace") {
            setTraces((current) => [...current, data]);
          }

          if (event === "delta") {
            setMessages((current) =>
              current.map((item, index) =>
                index === assistantIndex
                  ? { ...item, content: `${item.content}${data.delta}` }
                  : item
              )
            );
          }

          if (event === "error") {
            streamError = data.error || "请求失败";
          }
        });

        if (streamError) {
          throw new Error(streamError);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage(input);
  }

  return (
    <main className="page">
      <section className="shell">
        <div className="header">
          <div>
            <h1>美食搭配小助手</h1>
            <p className="subtitle">真实模型驱动的菜品搭配 Agent，展示工具调用全过程。</p>
          </div>
          <div className="model">
            <span />
            OpenAI + Tools
          </div>
        </div>

        <div className="workspace">
          <section className="chatPanel">
            <div className="panelTitle">
              <h2>菜品搭配</h2>
            </div>

            <div className="messages">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                  <p>
                    {message.content}
                    {loading && index === messages.length - 1 && message.role === "assistant" && (
                      <span className="cursor" />
                    )}
                  </p>
                </div>
              ))}
              {loading && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="message assistant">
                  <p>正在分析菜品并调用工具...</p>
                </div>
              )}
            </div>

            {error && <div className="error">{error}</div>}

            <div className="examples">
              {examples.map((example) => (
                <button key={example} type="button" onClick={() => sendMessage(example)}>
                  {example}
                </button>
              ))}
            </div>

            <form className="composer" onSubmit={handleSubmit}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="例如：我今晚吃红烧肉，配什么菜和饮料？"
              />
              <button type="submit" disabled={loading}>
                发送
              </button>
            </form>
          </section>

          <aside className="tracePanel">
            <div className="traceHeader">
              <span className="label">Tool Trace</span>
              <h2>执行轨迹</h2>
            </div>

            {traces.length === 0 ? (
              <div className="emptyTrace">
                <strong>等待调用</strong>
                <p>发送消息后，这里会显示模型选择的工具、参数和执行结果。</p>
              </div>
            ) : (
              <div className="traceList">
                {traces.map((trace, index) => (
                  <div className="traceItem" key={`${trace.tool}-${index}`}>
                    <div className="traceTop">
                      <span>{index + 1}</span>
                      <strong>{trace.tool}</strong>
                    </div>
                    <pre>{JSON.stringify(trace.arguments, null, 2)}</pre>
                    <p>{trace.result?.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
