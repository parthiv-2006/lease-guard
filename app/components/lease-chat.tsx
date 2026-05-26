"use client";

/**
 * app/components/lease-chat.tsx — "Ask Your Lease" conversational AI chat panel.
 *
 * A floating button in the bottom-right of the report page that opens a
 * warm-dark glassmorphism panel. Users type questions about their specific
 * lease and receive streaming, RAG-grounded answers with source citation pills.
 *
 * Design language: matches GroundingDrawer — #191715 bg, #22201d cards,
 * cubic-bezier slide transitions, Cormorant Garamond headers.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { Report } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatSource {
  type: "statute" | "decision";
  act_name?: string;
  section_number?: string;
  section_title?: string;
  case_number?: string;
  relevant_principle?: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  isStreaming?: boolean;
  isError?: boolean;
  errorCode?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Starter chips ─────────────────────────────────────────────────────────────

const STARTER_QUESTIONS = [
  "Can my landlord enter without notice?",
  "Is my deposit amount legal?",
  "What happens if I need to leave early?",
];

// ── Source pill ───────────────────────────────────────────────────────────────

function SourcePill({ source }: { source: ChatSource }) {
  const [showPopover, setShowPopover] = useState(false);
  const isStatute = source.type === "statute";

  const label = isStatute
    ? `RTA ${source.section_number ?? ""}`
    : `LTB Case`;

  const pillBg = isStatute ? "rgba(245,158,11,0.15)" : "rgba(59,130,246,0.15)";
  const pillBorder = isStatute ? "rgba(245,158,11,0.35)" : "rgba(59,130,246,0.35)";
  const pillColor = isStatute ? "#f59e0b" : "#60a5fa";

  const popoverContent = isStatute
    ? `${source.act_name} ${source.section_number} — ${source.section_title}`
    : `${source.case_number}: ${source.relevant_principle}`;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setShowPopover((s) => !s)}
        title={popoverContent}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 8px",
          borderRadius: "100px",
          background: pillBg,
          border: `1px solid ${pillBorder}`,
          color: pillColor,
          fontSize: "10px",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600,
          letterSpacing: "0.04em",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = isStatute
            ? "rgba(245,158,11,0.25)"
            : "rgba(59,130,246,0.25)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = pillBg)
        }
      >
        {label}
      </button>

      {showPopover && (
        <>
          {/* Backdrop to close */}
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 998,
            }}
            onClick={() => setShowPopover(false)}
          />
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#2a2723",
              border: `1px solid ${pillBorder}`,
              borderRadius: "8px",
              padding: "10px 12px",
              width: "240px",
              fontSize: "11px",
              color: "#ebe8e2",
              lineHeight: 1.5,
              fontFamily: "'DM Sans', sans-serif",
              zIndex: 999,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              animation: "fadeUpChat 0.12s ease",
            }}
          >
            <div style={{ color: pillColor, fontWeight: 600, marginBottom: "4px", fontSize: "10px" }}>
              {isStatute ? "RTA Statute" : "LTB Precedent"}
            </div>
            <div style={{ color: "#c5bfb5" }}>{popoverContent}</div>
            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  marginTop: "6px",
                  fontSize: "10px",
                  color: pillColor,
                  textDecoration: "underline",
                }}
              >
                View source →
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function ErrorBubble({ msg }: { msg: ChatMessage }) {
  // Icon: warning triangle
  const iconMap: Record<string, string> = {
    rate_limit_exceeded: "⏱",
    service_unavailable: "🔌",
    auth_error: "🔑",
  };
  const icon = iconMap[msg.errorCode ?? ""] ?? "⚠";

  const titleMap: Record<string, string> = {
    rate_limit_exceeded: "Usage limit reached",
    service_unavailable: "Temporarily unavailable",
    auth_error: "Configuration error",
  };
  const title = titleMap[msg.errorCode ?? ""] ?? "Something went wrong";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        animation: "fadeUpChat 0.18s ease",
      }}
    >
      <div
        style={{
          maxWidth: "92%",
          padding: "12px 14px",
          borderRadius: "12px 12px 12px 4px",
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.25)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
          }}
        >
          <span style={{ fontSize: "14px", lineHeight: 1 }}>{icon}</span>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#f59e0b",
              fontFamily: "'DM Sans', sans-serif",
              letterSpacing: "0.01em",
            }}
          >
            {title}
          </span>
        </div>
        {/* Friendly message */}
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            color: "#c5bfb5",
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: 1.55,
          }}
        >
          {msg.content}
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.isError) return <ErrorBubble msg={msg} />;

  const isUser = msg.role === "user";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: "6px",
        animation: "fadeUpChat 0.18s ease",
      }}
    >
      <div
        style={{
          maxWidth: "88%",
          padding: "10px 13px",
          borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: isUser ? "#181614" : "#22201d",
          border: isUser ? "1px solid #2e2b28" : "1px solid #2e2b28",
          color: isUser ? "#ebe8e2" : "#c5bfb5",
          fontSize: "13px",
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.isStreaming && msg.content === "" ? (
          /* Typing indicator */
          <div style={{ display: "flex", gap: "4px", alignItems: "center", padding: "2px 0" }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#6b6560",
                  animation: `chatDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        ) : (
          msg.content
        )}

        {/* Streaming cursor */}
        {msg.isStreaming && msg.content.length > 0 && (
          <span
            style={{
              display: "inline-block",
              width: "2px",
              height: "13px",
              background: "#6b6560",
              marginLeft: "2px",
              verticalAlign: "text-bottom",
              animation: "chatCursor 0.8s step-end infinite",
            }}
          />
        )}
      </div>

      {/* Source pills */}
      {!msg.isStreaming && msg.sources && msg.sources.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "5px",
            flexWrap: "wrap",
            maxWidth: "88%",
            paddingLeft: isUser ? 0 : "4px",
          }}
        >
          {msg.sources.map((s, i) => (
            <SourcePill key={i} source={s} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── CSS injection ─────────────────────────────────────────────────────────────

let _chatCssInjected = false;
function injectChatCSS() {
  if (_chatCssInjected || typeof document === "undefined") return;
  _chatCssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes chatDot {
      0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
      30% { opacity: 1; transform: scale(1); }
    }
    @keyframes chatCursor {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    @keyframes fadeUpChat {
      from { opacity: 0; transform: translateY(5px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes chatPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(235,232,226,0.15); }
      50%       { box-shadow: 0 0 0 6px rgba(235,232,226,0); }
    }
    #lg-chat-input:focus {
      outline: none;
      border-color: #4a4744 !important;
    }
    #lg-chat-input::placeholder {
      color: #4a4744;
    }
  `;
  document.head.appendChild(style);
}

// ── Main component ────────────────────────────────────────────────────────────

interface LeaseChatProps {
  leaseId: string;
  report: Report;
}

export function LeaseChat({ leaseId, report }: LeaseChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    injectChatCSS();
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 320);
    }
  }, [isOpen]);

  function open() {
    setIsOpen(true);
    setHasOpened(true);
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;
      setInput("");

      const userMsg: ChatMessage = { id: uid(), role: "user", content: text.trim() };
      const assistantMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      // Build history from last 6 non-streaming messages
      const history = messages
        .filter((m) => !m.isStreaming)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch(`/api/chat/${leaseId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim(), history }),
        });

        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => ({}));
          const code: string = errData.error ?? (res.status === 429 ? "rate_limit_exceeded" : "unknown");
          const FRIENDLY: Record<string, string> = {
            rate_limit_exceeded: "You've reached the hourly chat limit. Please wait a few minutes, then try again.",
            unknown: "Something went wrong. Please try again.",
          };
          const message = errData.message ?? FRIENDLY[code] ?? FRIENDLY.unknown;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: message, isError: true, errorCode: code, isStreaming: false }
                : m
            )
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = "";
        let sources: ChatSource[] = [];
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;

            try {
              const event = JSON.parse(raw) as {
                type: string;
                text?: string;
                sources?: ChatSource[];
                message?: string;
              };

              if (event.type === "token" && event.text) {
                accumulatedText += event.text;
                const captured = accumulatedText;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: captured }
                      : m
                  )
                );
              } else if (event.type === "sources" && event.sources) {
                sources = event.sources;
              } else if (event.type === "error") {
                const friendlyMsg =
                  event.message ?? "Something went wrong. Please try again.";
                const errCode = (event as { code?: string }).code;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          content: friendlyMsg,
                          isError: true,
                          errorCode: errCode,
                          isStreaming: false,
                        }
                      : m
                  )
                );
                // Don't accumulate error text into the normal response
                accumulatedText = "";
              } else if (event.type === "done") {
                break;
              }
            } catch {
              // Malformed JSON chunk — skip
            }
          }
        }

        // Finalize message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: accumulatedText, isStreaming: false, sources }
              : m
          )
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content: "Sorry, there was a network error. Please try again.",
                  isStreaming: false,
                }
              : m
          )
        );
        console.error("[LeaseChat]", err);
      } finally {
        setIsStreaming(false);
      }
    },
    [leaseId, messages, isStreaming]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const riskColors: Record<string, string> = {
    critical: "#f87171",
    high: "#fb923c",
    medium: "#fbbf24",
    low: "#4ade80",
  };
  const riskColor = riskColors[report.overall.risk_level] ?? "#9a9590";

  return (
    <>
      {/* ── Floating trigger button ──────────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          bottom: "28px",
          right: "28px",
          zIndex: 200,
          display: isOpen ? "none" : "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <button
          id="lg-chat-trigger"
          onClick={open}
          title="Ask your lease a question"
          aria-label="Open Ask Your Lease chat"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            padding: "11px 18px",
            borderRadius: "100px",
            background: "#191715",
            border: "1px solid #3a3532",
            color: "#ebe8e2",
            fontSize: "13px",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
            transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
            animation: hasOpened ? undefined : "chatPulse 2.4s ease-in-out 1.5s 3",
            letterSpacing: "0.01em",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#22201d";
            e.currentTarget.style.borderColor = "#5a5550";
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#191715";
            e.currentTarget.style.borderColor = "#3a3532";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.35)";
          }}
        >
          {/* Chat bubble icon */}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 2C5.58 2 2 5.24 2 9.2c0 2.08.93 3.95 2.43 5.26L3.5 17.5l3.28-1.38A8.38 8.38 0 0010 16.4c4.42 0 8-3.24 8-7.2C18 5.24 14.42 2 10 2z"
              fill="#ebe8e2"
              fillOpacity={0.85}
            />
          </svg>
          Ask your lease
          {/* Subtle risk indicator dot */}
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: riskColor,
              flexShrink: 0,
              opacity: 0.8,
            }}
          />
        </button>
      </div>

      {/* ── Chat panel ──────────────────────────────────────────────── */}
      <div
        id="lg-chat-panel"
        data-open={isOpen}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          width: "400px",
          height: "560px",
          zIndex: 200,
          background: "#191715",
          borderRadius: "16px",
          border: "1px solid #2e2b28",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transform: isOpen ? "translateY(0) scale(1)" : "translateY(16px) scale(0.97)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.25s cubic-bezier(0.4,0,0.2,1)",
          transformOrigin: "bottom right",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #2e2b28",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          {/* Shield + chat icon */}
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "8px",
              background: "#22201d",
              border: "1px solid #3a3532",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 2C5.58 2 2 5.24 2 9.2c0 2.08.93 3.95 2.43 5.26L3.5 17.5l3.28-1.38A8.38 8.38 0 0010 16.4c4.42 0 8-3.24 8-7.2C18 5.24 14.42 2 10 2z"
                fill="#9a9590"
              />
            </svg>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "15px",
                fontWeight: 600,
                color: "#ebe8e2",
                letterSpacing: "0.01em",
                lineHeight: 1.2,
              }}
            >
              Ask Your Lease
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "#5a5550",
                fontFamily: "'DM Sans', sans-serif",
                marginTop: "1px",
              }}
            >
              {report.lease.filename} · grounded in RTA law
            </div>
          </div>

          {/* Risk indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "3px 8px",
              borderRadius: "100px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid #2e2b28",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: riskColor,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "10px",
                color: riskColor,
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {report.overall.risk_score.toFixed(1)}
            </span>
          </div>

          {/* Close button */}
          <button
            id="lg-chat-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#5a5550",
              borderRadius: "4px",
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ebe8e2")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#5a5550")}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Messages area */}
        <div
          id="lg-chat-messages"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            scrollbarWidth: "thin",
            scrollbarColor: "#3a3532 transparent",
          }}
        >
          {messages.length === 0 ? (
            /* Empty state */
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "20px",
                padding: "20px 0",
              }}
            >
              {/* Decorative icon */}
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "14px",
                  background: "#22201d",
                  border: "1px solid #3a3532",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3C7.03 3 3 6.69 3 11.2c0 2.5 1.11 4.74 2.91 6.31L4.5 21l3.93-1.65A10 10 0 0012 19.4c4.97 0 9-3.69 9-8.2C21 6.69 16.97 3 12 3z"
                    fill="#3a3532"
                    stroke="#5a5550"
                    strokeWidth="1"
                  />
                  <path
                    d="M8 10.5h8M8 13.5h5"
                    stroke="#6b6560"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontFamily: "'Cormorant Garamond', serif",
                    color: "#9a9590",
                    fontWeight: 600,
                    marginBottom: "4px",
                  }}
                >
                  Ask anything about your lease
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#4a4744",
                    fontFamily: "'DM Sans', sans-serif",
                    lineHeight: 1.5,
                    maxWidth: "220px",
                    margin: "0 auto",
                  }}
                >
                  Answers are grounded in your clauses and Ontario law
                </div>
              </div>

              {/* Starter chips */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "7px",
                  width: "100%",
                }}
              >
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    id={`lg-chat-starter-${q.slice(0, 10).replace(/\s/g, "-")}`}
                    onClick={() => {
                      setInput(q);
                      sendMessage(q);
                    }}
                    style={{
                      width: "100%",
                      padding: "9px 13px",
                      borderRadius: "10px",
                      background: "#22201d",
                      border: "1px solid #2e2b28",
                      color: "#9a9590",
                      fontSize: "12px",
                      fontFamily: "'DM Sans', sans-serif",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      lineHeight: 1.4,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#2a2723";
                      e.currentTarget.style.borderColor = "#3a3532";
                      e.currentTarget.style.color = "#c5bfb5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#22201d";
                      e.currentTarget.style.borderColor = "#2e2b28";
                      e.currentTarget.style.color = "#9a9590";
                    }}
                  >
                    <span style={{ marginRight: "7px", opacity: 0.5 }}>→</span>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Disclaimer */}
        <div
          style={{
            padding: "5px 14px",
            borderTop: "1px solid #2e2b28",
            borderBottom: "1px solid #2e2b28",
            flexShrink: 0,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "9.5px",
              color: "#3a3532",
              fontFamily: "'DM Sans', sans-serif",
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            Educational information only — not legal advice
          </p>
        </div>

        {/* Input area */}
        <div
          style={{
            padding: "10px 12px",
            display: "flex",
            gap: "8px",
            alignItems: "center",
            background: "#191715",
            flexShrink: 0,
          }}
        >
          <input
            ref={inputRef}
            id="lg-chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your lease…"
            disabled={isStreaming}
            maxLength={500}
            aria-label="Chat message input"
            style={{
              flex: 1,
              padding: "9px 13px",
              borderRadius: "10px",
              background: "#22201d",
              border: "1px solid #2e2b28",
              color: "#ebe8e2",
              fontSize: "13px",
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
              transition: "border-color 0.12s",
              opacity: isStreaming ? 0.5 : 1,
            }}
          />
          <button
            id="lg-chat-send"
            onClick={() => sendMessage(input)}
            disabled={isStreaming || !input.trim()}
            aria-label="Send message"
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background:
                isStreaming || !input.trim() ? "#22201d" : "#ebe8e2",
              border: "none",
              cursor: isStreaming || !input.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isStreaming && input.trim())
                e.currentTarget.style.background = "#fff";
            }}
            onMouseLeave={(e) => {
              if (!isStreaming && input.trim())
                e.currentTarget.style.background = "#ebe8e2";
            }}
          >
            {isStreaming ? (
              /* Spinner */
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                style={{ animation: "spin 0.9s linear infinite" }}
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  stroke="#5a5550"
                  strokeWidth="2"
                  strokeDasharray="25 13"
                />
              </svg>
            ) : (
              /* Send arrow */
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke={input.trim() ? "#181614" : "#4a4744"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
