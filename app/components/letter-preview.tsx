"use client";

import { useState } from "react";
import { hasPlaceholders, letterToPlainText, type TenantLetter } from "@/lib/tenant-letters/core";

const actionButtonStyle: React.CSSProperties = {
  padding: "10px 18px",
  border: "1px solid #17140f",
  background: "#fff",
  color: "#17140f",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'Public Sans', sans-serif",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Renders the letter as a standalone printable HTML document. */
function letterToPrintHtml(letter: TenantLetter): string {
  const body = letter.blocks
    .map((block) =>
      block.type === "paragraph"
        ? `<p>${escapeHtml(block.text)}</p>`
        : `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(letter.title)}</title>
<style>
  body { font-family: Georgia, serif; font-size: 12pt; line-height: 1.55; color: #111; max-width: 6.5in; margin: 0.8in auto; }
  .meta p { margin: 0 0 4px; }
  .sig { margin-top: 48px; }
  .refs { margin-top: 36px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 9pt; color: #555; }
</style></head><body>
<p>${escapeHtml(letter.date)}</p>
<div class="meta"><p><strong>To:</strong> ${escapeHtml(letter.recipient)}</p><p><strong>Re:</strong> ${escapeHtml(letter.subject)}</p><p><strong>Rental unit:</strong> ${escapeHtml(letter.rentalAddress)}</p></div>
<p>${escapeHtml(letter.salutation)}</p>
${body}
<p>${escapeHtml(letter.signOff)}</p>
<p class="sig">${escapeHtml(letter.signature)}</p>
<div class="refs"><p>Legal references: ${escapeHtml(letter.citations.join(" · "))}</p><p>${escapeHtml(letter.disclaimer)}</p></div>
</body></html>`;
}

export function LetterPreview({ letter }: { letter: TenantLetter }) {
  const [status, setStatus] = useState<string>("");
  const incomplete = hasPlaceholders(letter);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(letterToPlainText(letter));
      setStatus("Letter copied to your clipboard.");
    } catch {
      setStatus("Couldn't copy automatically — select the letter text and copy it instead.");
    }
  }

  function handlePrint() {
    const win = window.open("", "_blank");
    if (!win) {
      setStatus("Your browser blocked the print window — allow pop-ups for this site and try again.");
      return;
    }
    win.document.write(letterToPrintHtml(letter));
    win.document.close();
    win.focus();
    win.print();
  }

  async function handleDownload() {
    try {
      const { exportLetterPDF } = await import("@/lib/pdf-export");
      await exportLetterPDF(letter);
      setStatus("PDF downloaded.");
    } catch {
      setStatus("Couldn't create the PDF — try printing the letter instead.");
    }
  }

  return (
    <div data-testid="letter-preview">
      {incomplete && (
        <p
          data-testid="letter-placeholder-warning"
          style={{ margin: "0 0 12px", padding: "10px 14px", background: "#fbf6e8", border: "1px solid #9c7a1f", color: "#6b5415", fontSize: 13 }}
        >
          Fill in the details above to replace the [bracketed] placeholders before you send this letter.
        </p>
      )}

      <article
        aria-label={`${letter.title} letter preview`}
        style={{
          background: "#fff",
          border: "1px solid #cfc7b3",
          padding: "clamp(20px,4vw,40px)",
          fontFamily: "'Newsreader', Georgia, serif",
          fontSize: 16,
          lineHeight: 1.65,
          color: "#17140f",
          overflowWrap: "anywhere",
        }}
      >
        <p style={{ margin: "0 0 18px" }}>{letter.date}</p>
        <p style={{ margin: "0 0 4px" }}><strong>To:</strong> {letter.recipient}</p>
        <p style={{ margin: "0 0 4px" }}><strong>Re:</strong> {letter.subject}</p>
        <p style={{ margin: "0 0 18px" }}><strong>Rental unit:</strong> {letter.rentalAddress}</p>
        <p style={{ margin: "0 0 14px" }}>{letter.salutation}</p>
        {letter.blocks.map((block, i) =>
          block.type === "paragraph" ? (
            <p key={i} style={{ margin: "0 0 14px" }}>{block.text}</p>
          ) : (
            <ul key={i} style={{ margin: "0 0 14px", paddingLeft: 22 }}>
              {block.items.map((item) => (
                <li key={item} style={{ marginBottom: 6 }}>{item}</li>
              ))}
            </ul>
          )
        )}
        <p style={{ margin: "0 0 36px" }}>{letter.signOff}</p>
        <p style={{ margin: 0 }}>{letter.signature}</p>
        <div
          style={{
            marginTop: 28,
            paddingTop: 12,
            borderTop: "1px solid #e4ddcc",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            color: "#6f6857",
            lineHeight: 1.6,
          }}
        >
          {letter.citations.join(" · ")}
        </div>
      </article>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        <button type="button" style={actionButtonStyle} onClick={handleCopy}>Copy text</button>
        <button type="button" style={actionButtonStyle} onClick={handlePrint}>Print</button>
        <button type="button" style={{ ...actionButtonStyle, background: "#151209", color: "#f4efe4" }} onClick={handleDownload}>
          Download PDF
        </button>
      </div>
      <p role="status" aria-live="polite" data-testid="letter-action-status" style={{ minHeight: 18, margin: "10px 0 0", fontSize: 13, color: "#4a4438" }}>
        {status}
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6f6857", lineHeight: 1.6 }}>{letter.disclaimer}</p>
    </div>
  );
}
