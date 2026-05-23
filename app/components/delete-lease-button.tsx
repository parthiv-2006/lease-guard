"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteLeaseButton({ leaseId }: { leaseId: string }) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (
      !confirm(
        "Delete this analysis? This permanently removes the report, all clause data, and the uploaded PDF. This cannot be undone."
      )
    )
      return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/report/${leaseId}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body?.message ?? "Could not delete. Please try again.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      title="Delete this analysis (permanent)"
      style={{
        flexShrink: 0,
        width: "30px",
        height: "30px",
        borderRadius: "6px",
        border: "1px solid #e8e4dc",
        background: "#fff",
        cursor: deleting ? "wait" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: deleting ? 0.5 : 1,
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!deleting) {
          e.currentTarget.style.borderColor = "#fecaca";
          e.currentTarget.style.background = "#fef2f2";
        }
      }}
      onMouseLeave={(e) => {
        if (!deleting) {
          e.currentTarget.style.borderColor = "#e8e4dc";
          e.currentTarget.style.background = "#fff";
        }
      }}
    >
      {deleting ? (
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
      ) : (
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
      )}
    </button>
  );
}
