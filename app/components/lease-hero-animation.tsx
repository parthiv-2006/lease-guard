"use client";

// A self-looping mock lease document that highlights three clauses in
// sequence, stamps a flag + statute citation next to each, then stamps a
// score in the corner — a 12s loop, driven entirely by CSS keyframes
// (lg-h1/h2/h3, lg-f1/f2/f3, lg-scan, lg-stamp) defined in globals.css.

const MONO = "'IBM Plex Mono', monospace";
const SERIF = "'Newsreader', serif";

export function LeaseHeroAnimation() {
  return (
    <div style={{ position: "relative", paddingBottom: 70 }}>
      {/* Score stamp */}
      <div
        data-lg-anim
        style={{
          position: "absolute",
          zIndex: 3,
          bottom: 6,
          left: -6,
          border: "2px solid #9c2b23",
          background: "#f7f4ee",
          padding: "12px 20px 14px",
          textAlign: "center",
          animation: "lg-stamp 12s cubic-bezier(0.2,0.8,0.2,1) infinite",
          boxShadow: "0 10px 24px rgba(23,20,15,0.12)",
        }}
      >
        <div
          style={{
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 56,
            lineHeight: 0.9,
            color: "#9c2b23",
          }}
        >
          9.5
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#9c2b23",
            marginTop: 6,
          }}
        >
          Critical risk
        </div>
      </div>

      {/* Document panel */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          border: "1px solid #17140f",
          borderBottom: "none",
          background: "#fffdfa",
          boxShadow: "0 24px 60px rgba(23,20,15,0.14)",
          padding: "0 clamp(22px,2.6vw,34px) 44px",
        }}
      >
        {/* Scan-line sweep */}
        <div
          data-lg-anim
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 2,
            background:
              "linear-gradient(90deg,rgba(156,43,35,0),#9c2b23,rgba(156,43,35,0))",
            animation: "lg-scan 12s cubic-bezier(0.4,0,0.6,1) infinite",
            zIndex: 2,
          }}
        />

        {/* Doc header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "18px 0 16px",
            borderBottom: "1px solid #e0d9c6",
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#6f6857",
          }}
        >
          <span>Residential Tenancy Agreement</span>
          <span>p. 3 / 11</span>
        </div>

        <div style={{ paddingTop: 22, display: "flex", flexDirection: "column", gap: 5 }}>
          {/* Line 11 — static */}
          <DocLine n="11">
            The tenant shall keep the premises clean and in a good state of repair.
          </DocLine>

          {/* Line 12 — late fees */}
          <DocLine n="12" highlight="lg-h1" highlightColor="#9c2b23" highlightBg="rgba(156,43,35,0.13)">
            The tenant shall pay a late fee of $100 per day for any rent payment received
            after the 1st of the month.
          </DocLine>
          <Flag anim="lg-f1" tag="Critical" tagBg="#9c2b23" text="s.134 — charges beyond rent are prohibited" textColor="#9c2b23" />

          {/* Line 13 — post-dated cheques */}
          <DocLine n="13" highlight="lg-h2" highlightColor="#a15a1f" highlightBg="rgba(161,90,31,0.14)">
            Rent shall be payable by post-dated cheques for the full term, provided on signing.
          </DocLine>
          <Flag anim="lg-f2" tag="High" tagBg="#a15a1f" text="s.108 — post-dated cheques cannot be required" textColor="#8a4a17" />

          {/* Line 14 — no pets */}
          <DocLine n="14" highlight="lg-h3" highlightColor="#9c2b23" highlightBg="rgba(156,43,35,0.13)">
            No pets of any kind shall be kept on the premises at any time.
          </DocLine>
          <Flag anim="lg-f3" tag="Critical" tagBg="#9c2b23" text="s.14 — no-pet provisions are void" textColor="#9c2b23" />

          {/* Line 15 — static, faded (implies "more below") */}
          <div style={{ display: "flex", gap: 14, opacity: 0.5 }}>
            <LineNum n="15" />
            <span style={{ fontSize: 14, lineHeight: 1.85, color: "#4a4438" }}>
              The tenant agrees to provide the landlord with reasonable access for repairs and
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LineNum({ n }: { n: string }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 12, color: "#b5ac98", paddingTop: 3, flexShrink: 0 }}>
      {n}
    </span>
  );
}

function DocLine({
  n,
  children,
  highlight,
  highlightColor,
  highlightBg,
}: {
  n: string;
  children: React.ReactNode;
  highlight?: string;
  highlightColor?: string;
  highlightBg?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      <LineNum n={n} />
      <span
        data-lg-anim={highlight ? true : undefined}
        style={
          highlight
            ? {
                fontSize: 14,
                lineHeight: 1.85,
                color: "#17140f",
                backgroundImage: `linear-gradient(${highlightBg},${highlightBg}), linear-gradient(${highlightColor},${highlightColor})`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "0 0, 0 100%",
                backgroundSize: "0% 100%, 0% 2px",
                animation: `${highlight} 12s cubic-bezier(0.2,0.8,0.2,1) infinite`,
              }
            : { fontSize: 14, lineHeight: 1.85, color: "#4a4438" }
        }
      >
        {children}
      </span>
    </div>
  );
}

function Flag({
  anim,
  tag,
  tagBg,
  text,
  textColor,
}: {
  anim: string;
  tag: string;
  tagBg: string;
  text: string;
  textColor: string;
}) {
  return (
    <div
      data-lg-anim
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        margin: "2px 0 8px 26px",
        animation: `${anim} 12s cubic-bezier(0.2,0.8,0.2,1) infinite`,
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#fffdfa",
          background: tagBg,
          padding: "3px 9px",
        }}
      >
        {tag}
      </span>
      <span style={{ fontSize: 13, color: textColor, lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}
