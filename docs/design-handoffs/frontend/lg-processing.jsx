// LeaseGuard — Processing / Progress Screen

const { useState, useEffect, useRef } = React;

const STEPS = [
  { id: "parse",        label: "Extracting text",         detail: "Reading PDF — 28 pages detected" },
  { id: "jurisdiction", label: "Detecting jurisdiction",  detail: "Ontario (CA-ON) confirmed — high confidence" },
  { id: "segment",      label: "Reading clauses",         detail: "Segmenting into individual clauses…" },
  { id: "research",     label: "Researching law",         detail: "Querying 1,574 RTA statute chunks via RAG…" },
  { id: "report",       label: "Building report",         detail: "Scoring risk · detecting contradictions · generating negotiation guide…" },
];

const STEP_DURATIONS = [2200, 400, 900, 18000, 6500]; // ms each step takes (sim)

function ProcessingPage({ filename, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const stepRef = useRef(0);

  // Advance steps
  useEffect(() => {
    let timeout;
    function advance() {
      const step = stepRef.current;
      if (step >= STEPS.length) { onComplete(); return; }
      timeout = setTimeout(() => {
        setCompletedSteps(prev => [...prev, step]);
        stepRef.current = step + 1;
        setCurrentStep(step + 1);
        advance();
      }, STEP_DURATIONS[step] || 2000);
    }
    advance();
    return () => clearTimeout(timeout);
  }, []);

  // Elapsed timer
  useEffect(() => {
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const totalExpected = STEP_DURATIONS.reduce((a, b) => a + b, 0) / 1000;
  const remaining = Math.max(0, Math.round(totalExpected - elapsed));

  return (
    <div style={{
      minHeight: "100vh", background: "#f6f3ee",
      display: "flex", flexDirection: "column",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", padding: "0 48px", height: "56px",
        borderBottom: "1px solid #e8e4dc", background: "#f6f3ee",
      }}>
        <span style={{
          fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
          fontSize: "17px", letterSpacing: "0.02em", color: "#181614",
        }}>LeaseGuard</span>
      </header>

      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "64px 24px",
      }}>
        <div style={{ width: "100%", maxWidth: "520px" }}>
          {/* File info */}
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 16px", background: "#fff",
            border: "1px solid #e8e4dc", borderRadius: "7px",
            marginBottom: "40px",
          }}>
            <svg width="16" height="18" viewBox="0 0 16 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="0.75" y="0.75" width="12.5" height="16.5" rx="1.75" fill="white" stroke="#ddd8cf" strokeWidth="1.5" />
              <rect x="3" y="8" width="5" height="1.5" rx="0.75" fill="#c8c3ba" />
              <rect x="3" y="11" width="8" height="1.5" rx="0.75" fill="#c8c3ba" />
              <rect x="3" y="14" width="6" height="1.5" rx="0.75" fill="#c8c3ba" />
              <rect x="3" y="4" width="3" height="2" rx="0.5" fill="#b91c1c" opacity="0.85" />
            </svg>
            <span style={{ fontSize: "13px", fontWeight: 500, color: "#181614", flex: 1 }}>{filename || "KingSt_Lease_2026.pdf"}</span>
            <span style={{ fontSize: "12px", color: "#9a9590" }}>Ontario · 28 pages</span>
          </div>

          {/* Title */}
          <h2 style={{
            fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
            fontSize: "28px", color: "#181614", margin: "0 0 8px",
            letterSpacing: "-0.01em",
          }}>
            Analysing your lease
          </h2>
          <p style={{ fontSize: "14px", color: "#6b6560", margin: "0 0 36px" }}>
            Usually 60–90 seconds. Please keep this tab open.
          </p>

          {/* Progress steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {STEPS.map((step, i) => {
              const done = completedSteps.includes(i);
              const active = currentStep === i;
              const pending = i > currentStep;

              return (
                <div key={step.id} style={{ display: "flex", gap: "0" }}>
                  {/* Left column: connector + dot */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "32px", flexShrink: 0 }}>
                    {/* Top connector */}
                    <div style={{
                      width: "1px", flex: "0 0 10px",
                      background: i === 0 ? "transparent" : done || active ? "#181614" : "#e8e4dc",
                    }} />
                    {/* Dot */}
                    <div style={{
                      width: done ? 20 : active ? 20 : 16,
                      height: done ? 20 : active ? 20 : 16,
                      borderRadius: "50%",
                      background: done ? "#181614" : active ? "transparent" : "#e8e4dc",
                      border: active ? "2px solid #181614" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, transition: "all 0.3s",
                      position: "relative",
                    }}>
                      {done && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.2 2.2L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {active && (
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%", background: "#181614",
                          animation: "pulse-dot 1.2s ease-in-out infinite",
                        }} />
                      )}
                    </div>
                    {/* Bottom connector */}
                    <div style={{
                      width: "1px", flex: 1, minHeight: "10px",
                      background: i === STEPS.length - 1 ? "transparent" : done ? "#181614" : "#e8e4dc",
                    }} />
                  </div>

                  {/* Right column: content */}
                  <div style={{ paddingLeft: "14px", paddingBottom: "24px", paddingTop: "4px", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{
                        fontSize: "14px", fontWeight: done ? 400 : active ? 600 : 400,
                        color: done ? "#6b6560" : active ? "#181614" : "#b0aaa4",
                        transition: "all 0.2s",
                      }}>
                        {step.label}
                      </span>
                      {active && (
                        <span style={{
                          fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase",
                          color: "#9a9590", fontWeight: 500,
                        }}>In progress</span>
                      )}
                      {done && (
                        <span style={{ fontSize: "11px", color: "#15803d", fontWeight: 500 }}>Done</span>
                      )}
                    </div>
                    {(active || done) && (
                      <div style={{
                        marginTop: "3px", fontSize: "12px", color: active ? "#6b6560" : "#9a9590",
                        lineHeight: 1.4,
                      }}>
                        {step.detail}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time display */}
          <div style={{
            marginTop: "8px", padding: "14px 18px",
            background: "#fff", border: "1px solid #e8e4dc", borderRadius: "8px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: "12px", color: "#9a9590" }}>
              {currentStep >= STEPS.length ? "Analysis complete" : `Elapsed: ${elapsed}s`}
            </span>
            {currentStep < STEPS.length && (
              <span style={{ fontSize: "12px", color: "#6b6560", fontWeight: 500 }}>
                ~{remaining}s remaining
              </span>
            )}
          </div>

          {/* Dev shortcut note */}
          <p style={{
            marginTop: "20px", fontSize: "11px", color: "#c8c3ba",
            textAlign: "center",
          }}>
            Using mock data — click{" "}
            <button onClick={onComplete} style={{
              background: "none", border: "none", color: "#9a9590",
              cursor: "pointer", fontSize: "11px", textDecoration: "underline", padding: 0,
            }}>
              skip to report
            </button>
            {" "}to preview immediately.
          </p>
        </div>
      </main>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }
      `}</style>
    </div>
  );
}

window.ProcessingPage = ProcessingPage;
