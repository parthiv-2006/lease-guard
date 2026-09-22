"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { LetterParties, TenantLetter } from "@/lib/tenant-letters/core";
import { LetterPreview } from "./letter-preview";

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "'Public Sans', sans-serif",
  fontSize: 15,
  padding: "10px 12px",
  border: "1px solid #cfc7b3",
  background: "#fff",
  color: "#17140f",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6f6857",
  marginBottom: 6,
};

/**
 * Today's local calendar date as a UTC-midnight Date, matching how the
 * checkers parse "YYYY-MM-DD" inputs so the letter date never drifts a day.
 */
function todayAsUtcDate(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

interface LetterBuilderProps {
  /** Builds the letter from the party details; null hides the builder entirely. */
  build: (parties: LetterParties, letterDate: Date) => TenantLetter | null;
  /** One line explaining what this letter does, shown above the button. */
  intro: string;
  /** Optional letter-specific inputs rendered after the party fields. */
  extraFields?: ReactNode;
}

const EMPTY_PARTIES: LetterParties = { tenantName: "", landlordName: "", rentalAddress: "" };

/**
 * Collapsible "write a letter" panel shown under a checker result. Party
 * details live only in this component's state — they are never saved,
 * sent to the server, or written to browser storage.
 */
export function LetterBuilder({ build, intro, extraFields }: LetterBuilderProps) {
  const [open, setOpen] = useState(false);
  const [parties, setParties] = useState<LetterParties>(EMPTY_PARTIES);
  const letterDate = useMemo(todayAsUtcDate, []);
  const letter = useMemo(() => build(parties, letterDate), [build, parties, letterDate]);

  if (!letter) return null;

  function update<K extends keyof LetterParties>(key: K, value: string) {
    setParties((p) => ({ ...p, [key]: value }));
  }

  return (
    <section
      data-testid="letter-builder"
      aria-label="Write a letter to your landlord"
      style={{ border: "1px solid #17140f", background: "#fbf9f4", padding: "clamp(20px,4vw,32px)", marginTop: 32 }}
    >
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#6f6857",
          marginBottom: 8,
        }}
      >
        Put it in writing
      </div>
      <h3 style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: 22, margin: "0 0 8px" }}>
        {letter.title} letter
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 15, color: "#4a4438", lineHeight: 1.6 }}>{intro}</p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          style={{
            padding: "12px 24px",
            border: "1px solid #17140f",
            background: "#151209",
            color: "#f4efe4",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'Public Sans', sans-serif",
          }}
        >
          Write a letter to my landlord
        </button>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle} htmlFor="letterTenantName">Your name</label>
              <input
                id="letterTenantName"
                style={inputStyle}
                autoComplete="off"
                value={parties.tenantName}
                onChange={(e) => update("tenantName", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="letterLandlordName">Landlord&rsquo;s name</label>
              <input
                id="letterLandlordName"
                style={inputStyle}
                autoComplete="off"
                value={parties.landlordName}
                onChange={(e) => update("landlordName", e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle} htmlFor="letterRentalAddress">Rental unit address</label>
            <input
              id="letterRentalAddress"
              style={inputStyle}
              autoComplete="off"
              value={parties.rentalAddress}
              onChange={(e) => update("rentalAddress", e.target.value)}
            />
          </div>
          {extraFields}
          <p style={{ margin: "0 0 20px", fontSize: 12, color: "#6f6857", lineHeight: 1.6 }}>
            Nothing you type here is saved or sent to LeaseGuard — the letter is put together in your browser.
          </p>
          <LetterPreview letter={letter} />
        </>
      )}
    </section>
  );
}
