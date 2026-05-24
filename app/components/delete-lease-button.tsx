"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type State = "idle" | "confirming" | "deleting" | "error";

export function DeleteLeaseButton({ leaseId }: { leaseId: string }) {
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  async function handleConfirmedDelete() {
    setState("deleting");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/report/${leaseId}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body?.message ?? "Could not delete. Please try again.");
        setState("error");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("error");
    }
  }

  // ── Idle: trash icon button ──────────────────────────────────────────────────
  if (state === "idle") {
    return (
      <button
        onClick={() => setState("confirming")}
        title="Delete this analysis (permanent)"
        style={{
          flexShrink: 0,
          width: "30px",
          height: "30px",
          borderRadius: "6px",
          border: "1px solid #e8e4dc",
          background: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "border-color 0.15s, background 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#fecaca";
          e.currentTarget.style.background = "#fef2f2";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "#e8e4dc";
          e.currentTarget.style.background = "#fff";
        }}
      >
        <TrashIcon />
      </button>
    );
  }

  // ── Confirming: inline "Delete? [Cancel] [Delete]" ──────────────────────────
  if (state === "confirming") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
        <span style={{ fontSize: "11px", color: "#6b6560", whiteSpace: "nowrap" }}>
          Delete?
        </span>
        <button
          onClick={() => setState("idle")}
          style={{
            padding: "4px 10px",
            borderRadius: "5px",
            border: "1px solid #e8e4dc",
            background: "#fff",
            fontSize: "11px",
            color: "#6b6560",
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f3ee")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
        >
          Cancel
        </button>
        <button
          onClick={handleConfirmedDelete}
          style={{
            padding: "4px 10px",
            borderRadius: "5px",
            border: "1px solid #fecaca",
            background: "#fef2f2",
            fontSize: "11px",
            color: "#b91c1c",
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#fee2e2")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fef2f2")}
        >
          Delete
        </button>
      </div>
    );
  }

  // ── Deleting: spinner ────────────────────────────────────────────────────────
  if (state === "deleting") {
    return (
      <div
        style={{
          flexShrink: 0,
          width: "30px",
          height: "30px",
          borderRadius: "6px",
          border: "1px solid #e8e4dc",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.6,
        }}
      >
        <SpinnerIcon />
      </div>
    );
  }

  // ── Error: inline message + dismiss ─────────────────────────────────────────
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
      <span
        style={{
          fontSize: "11px",
          color: "#b91c1c",
          whiteSpace: "nowrap",
          maxWidth: "160px",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {errorMsg}
      </span>
      <button
        onClick={() => setState("idle")}
        style={{
          padding: "4px 10px",
          borderRadius: "5px",
          border: "1px solid #e8e4dc",
          background: "#fff",
          fontSize: "11px",
          color: "#6b6560",
          cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="#9a9590"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 4 4 4 13 4" />
      <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
      <path d="M5.5 7.5v5M10.5 7.5v5" />
      <path d="M4 4l.8 9a1 1 0 001 .93h4.4a1 1 0 001-.93L12 4" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="#9a9590" strokeWidth="1.5" strokeDasharray="4 4">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 8 8"
          to="360 8 8"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
