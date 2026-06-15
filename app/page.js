"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useState } from "react";

const examples = [
  "我想吃素食，推荐菜谱和饮品",
  "给我推荐一份晚餐",
  "看看第一个菜谱详情"
];

function ThinkingIndicator({ text = "思考中" }) {
  return (
    <span className="thinking">
      {text}
      <span className="thinkingDots" aria-hidden="true" />
    </span>
  );
}

function getPendingText(message) {
  return message.statusText || "思考中";
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
          <div className="resultInfo">
            <div className="resultMeta">
              <span>{card.source}</span>
              {(card.area || card.category || card.glass) && (
                <span>{[card.area, card.category || card.glass].filter(Boolean).join(" / ")}</span>
              )}
            </div>
            <strong>{card.title}</strong>
            {card.ingredients?.length > 0 && (
              <p>
                {card.ingredients
                  .slice(0, 5)
                  .map((ingredient) => ingredient.name)
                  .join("、")}
              </p>
            )}
          </div>
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

function sortCardsForDisplay(items) {
  const order = { meal: 0, cocktail: 1 };
  return [...items].sort((left, right) => (order[left.type] ?? 2) - (order[right.type] ?? 2));
}

function getTraceView(trace) {
  const names = {
    search_meals: "搜索菜谱",
    get_meal_detail: "获取菜谱详情",
    search_cocktails: "搜索饮品"
  };
  const args = trace.arguments || {};
  const parts = [
    args.mode ? `模式：${args.mode}` : "",
    args.query ? `关键词：${args.query}` : "",
    args.id ? `ID：${args.id}` : ""
  ].filter(Boolean);

  return {
    title: names[trace.tool] || trace.tool,
    detail: parts.join("，"),
    summary: trace.result?.summary || "工具调用完成"
  };
}

function ToolTrace({ traces, pending }) {
  if (!traces?.length) return null;

  const views = traces.map(getTraceView);
  const titles = [...new Set(views.map((view) => view.title))];
  const activeSummary = titles.length > 3
    ? `调用 ${traces.length} 个工具：${titles.slice(0, 3).join(" → ")}…`
    : `调用工具：${titles.join(" → ")}`;
  const summary = pending ? activeSummary : "工具调用详情";

  return (
    <details className="toolTrace">
      <summary>{summary}</summary>
      <div className="toolTraceBody">
        {views.map((view, index) => (
          <div className="toolStep" key={`${view.title}-${index}`}>
            <span>{index + 1}</span>
            <div>
              <strong>{view.title}</strong>
              {view.detail && <p>{view.detail}</p>}
              <small>{view.summary}</small>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
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
      content: "告诉我想吃什么，我会搜索菜谱和饮品搭配。"
    }
  ]);
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

      try {
        onEvent(event, JSON.parse(dataLine.slice(6)));
      } catch {
        onEvent("error", { error: "响应解析失败，请稍后重试" });
      }
    }

    return rest;
  }

  async function sendMessage(text) {
    const message = text.trim();
    if (!message || loading) return;

    setInput("");
    setError("");
    setLoading(true);
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
          messages: requestMessages.map(({ role, content }) => ({ role, content })),
          cardContext
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "请求失败");
      }

      if (!response.body) {
        throw new Error("响应为空，请稍后重试");
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
            setMessages((current) =>
              current.map((item, index) =>
                index === assistantIndex
                  ? {
                      ...item,
                      traces: [...(item.traces || []), data]
                    }
                  : item
              )
            );
          }

          if (event === "cards") {
            const seen = new Set(pendingCards.map((card) => `${card.type}-${card.id}`));
            const incoming = data.cards.filter((card) => !seen.has(`${card.type}-${card.id}`));
            pendingCards = [...pendingCards, ...incoming];
            setMessages((current) =>
              current.map((item, index) =>
                index === assistantIndex && item.pending
                  ? { ...item, statusText: "整理结果中" }
                  : item
              )
            );
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
        const visibleCards = sortCardsForDisplay(getCardsMentionedInAnswer(pendingCards, assistantText));
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
          <div className="titleMark">
            <span aria-hidden="true" />
            <h1>智能食谱助手</h1>
          </div>
        </div>

        <section className="chatPanel">
          <div className="messages" ref={messagesRef} onScroll={handleMessagesScroll}>
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                <ToolTrace traces={message.traces} pending={message.pending} />
                {message.pending ? <ThinkingIndicator text={getPendingText(message)} /> : <MarkdownMessage content={message.content} />}
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
              placeholder="我今晚想吃鸡"
            />
            <button type="submit" disabled={loading || !input.trim()} aria-label="发送">
              ↑
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
