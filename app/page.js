"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useState } from "react";

const examples = [
  "给我推荐一顿晚餐",
  "看看第一个菜谱详情",
  "推荐一杯 margarita"
];

function ThinkingIndicator({ text = "思考中..." }) {
  return (
    <span className="thinking">
      {text}
      <span className="thinkingDots" aria-hidden="true" />
    </span>
  );
}

function MarkdownMessage({ content }) {
  return (
    <div className="markdown">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

function ResultCards({ cards, onImageLoad }) {
  if (!cards?.length) return null;

  return (
    <div className={`cards ${cards.length === 1 ? "cardsSingle" : ""}`}>
      {cards.map((card) => (
        <article className="resultCard" key={`${card.type}-${card.id}`}>
          {card.image && (
            <div className="resultImage">
              <Image
                src={card.image}
                alt={`${card.title} 的${card.type === "meal" ? "菜谱" : "饮品"}封面图`}
                width={420}
                height={264}
                unoptimized
                onLoad={onImageLoad}
              />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function getCardsMentionedInAnswer(items, answer) {
  const normalizedAnswer = normalizeText(answer);
  const matched = items.filter((card) => normalizedAnswer.includes(normalizeText(card.title)));

  return matched.length > 0 ? matched : items;
}

export default function Home() {
  const messagesRef = useRef(null);
  const bottomRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const autoFollowRef = useRef(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "告诉我想吃什么，我会搜索真实菜谱和饮品搭配。"
    }
  ]);
  const [traces, setTraces] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);

  function scrollToLatest(behavior = "smooth") {
    stickToBottomRef.current = true;
    autoFollowRef.current = true;
    setShowScrollButton(false);
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }

  function scheduleScrollToLatest(behavior = "auto") {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }

  function handleResultImageLoad() {
    if (autoFollowRef.current || stickToBottomRef.current) {
      scheduleScrollToLatest("auto");
    }
  }

  function handleMessagesScroll(event) {
    const element = event.currentTarget;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    const isNearBottom = distanceToBottom < 96;

    stickToBottomRef.current = isNearBottom;
    if (!isNearBottom) autoFollowRef.current = false;
    setShowScrollButton(!isNearBottom);
  }

  useEffect(() => {
    if (!stickToBottomRef.current && !autoFollowRef.current) return;

    const frame = requestAnimationFrame(() => scheduleScrollToLatest("smooth"));
    return () => cancelAnimationFrame(frame);
  }, [messages, loading]);

  function getCardContext(items) {
    if (items.length === 0) return "";

    return `当前结构化结果：${items
      .map((card, index) => `${index + 1}. ${card.title} (${card.type}, id: ${card.id})`)
      .join("；")}`;
  }

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
    setCards([]);
    stickToBottomRef.current = true;
    autoFollowRef.current = true;
    const cardContext = getCardContext(cards);
    const assistantIndex = messages.length + 1;
    const visibleMessages = [
      ...messages,
      { role: "user", content: message },
      { role: "assistant", content: "", pending: true }
    ];
    const requestMessages = [
      ...messages,
      ...(cardContext ? [{ role: "assistant", content: cardContext }] : []),
      { role: "user", content: message }
    ];
    setMessages(visibleMessages);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: requestMessages.map(({ role, content }) => ({ role, content }))
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "请求失败");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError = "";
      let pendingCards = [];
      let outputQueue = Promise.resolve();
      let assistantText = "";

      function appendDelta(assistantIndex, delta) {
        outputQueue = outputQueue.then(async () => {
          for (const char of Array.from(delta)) {
            assistantText += char;
            setMessages((current) =>
              current.map((item, index) =>
                index === assistantIndex
                  ? { ...item, content: `${item.content}${char}`, pending: false }
                  : item
              )
            );
            if (autoFollowRef.current) {
              scheduleScrollToLatest("auto");
            }
            await sleep(12);
          }
        });
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        buffer = readSseEvents(buffer, (event, data) => {
          if (event === "trace") {
            setTraces((current) => [...current, data]);
          }

          if (event === "cards") {
            const seen = new Set(pendingCards.map((card) => `${card.type}-${card.id}`));
            const incoming = data.cards.filter((card) => !seen.has(`${card.type}-${card.id}`));
            pendingCards = [...pendingCards, ...incoming];
          }

          if (event === "delta") {
            appendDelta(assistantIndex, data.delta);
          }

          if (event === "error") {
            streamError = data.error || "请求失败";
          }
        });

        if (streamError) {
          throw new Error(streamError);
        }
      }

      await outputQueue;

      if (!assistantText) {
        setMessages((current) =>
          current.map((item, index) =>
            index === assistantIndex ? { ...item, content: "没有生成有效内容。", pending: false } : item
          )
        );
      }

      if (pendingCards.length > 0) {
        const visibleCards = getCardsMentionedInAnswer(pendingCards, assistantText);
        setCards(visibleCards);
        setMessages((current) =>
          current.map((item, index) =>
            index === assistantIndex
              ? {
                  ...item,
                  cards: visibleCards
                }
              : item
          )
        );
        if (autoFollowRef.current) scheduleScrollToLatest("smooth");
      }
    } catch (err) {
      setError(err.message);
      setMessages((current) =>
        current.map((item, index) =>
          index === assistantIndex && item.pending
            ? { ...item, content: "请求失败，请稍后重试。", pending: false }
            : item
        )
      );
    } finally {
      autoFollowRef.current = false;
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
          </div>
        </div>

        <div className="workspace">
          <section className="chatPanel">
            <div className="panelTitle">
              <h2>菜品搭配</h2>
            </div>

            <div className="messages" ref={messagesRef} onScroll={handleMessagesScroll}>
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                  {message.pending ? <ThinkingIndicator /> : <MarkdownMessage content={message.content} />}
                  <ResultCards cards={message.cards} onImageLoad={handleResultImageLoad} />
                </div>
              ))}
              {showScrollButton && (
                <button
                  aria-label="回到最新消息"
                  className="scrollLatest"
                  type="button"
                  onClick={() => scrollToLatest()}
                >
                  ↓
                </button>
              )}
              <div ref={bottomRef} />
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
