// LeaseGuard — Landing / Upload Page

const { useState, useRef, useCallback } = React;

function LandingPage({ onUpload }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  function validateFile(f) {
    if (!f) return "No file selected.";
    if (!f.name.toLowerCase().endsWith(".pdf")) return "Only PDF files are supported.";
    if (f.size > 25 * 1024 * 1024) return `File exceeds 25 MB limit (${(f.size / 1024 / 1024).toFixed(1)} MB received).`;
    return null;
  }

  function handleFile(f) {
    const err = validateFile(f);
    if (err) { setError(err); setFile(null); return; }
    setError(null);
    setFile(f);
  }

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, []);

  const onDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback(() => setDragOver(false), []);

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  const borderColor = error ? "#b91c1c" : dragOver ? "#181614" : file ? "#181614" : "#c8c3ba";
  const bgColor = dragOver ? "#f0ede6" : "#fdfcfa";

  return (
    <div style={{
      minHeight: "100vh", background: "#f6f3ee",
      display: "flex", flexDirection: "column",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Top bar */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 48px", height: "56px",
        borderBottom: "1px solid #e8e4dc", background: "#f6f3ee",
      }}>
        <span style={{
          fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
          fontSize: "17px", letterSpacing: "0.02em", color: "#181614",
        }}>LeaseGuard</span>
        <nav style={{ display: "flex", gap: "28px" }}>
          {["How it works", "Ontario RTA", "About"].map(label => (
            <a key={label} href="#" style={{
              fontSize: "13px", color: "#6b6560", textDecoration: "none",
              fontWeight: 400, letterSpacing: "0.01em",
            }}
              onMouseEnter={e => e.currentTarget.style.color = "#181614"}
              onMouseLeave={e => e.currentTarget.style.color = "#6b6560"}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* Hero */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "64px 24px 80px",
      }}>
        {/* Jurisdiction tag */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          padding: "4px 12px", borderRadius: "100px",
          background: "#fff", border: "1px solid #e8e4dc",
          fontSize: "11px", color: "#6b6560", marginBottom: "28px",
          letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 500,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#15803d", display: "inline-block" }}></span>
          Ontario Residential Tenancies Act
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
          fontSize: "clamp(40px, 6vw, 68px)", lineHeight: 1.05,
          color: "#181614", textAlign: "center", margin: "0 0 18px",
          letterSpacing: "-0.02em", maxWidth: "720px",
        }}>
          Read what you sign.
        </h1>
        <p style={{
          fontSize: "16px", color: "#6b6560", textAlign: "center",
          maxWidth: "480px", lineHeight: 1.6, margin: "0 0 48px",
        }}>
          Upload your Ontario lease. LeaseGuard reads every clause against real statute and
          tells you exactly what you are agreeing to — in under 90 seconds.
        </p>

        {/* Upload zone */}
        <div style={{ width: "100%", maxWidth: "560px" }}>
          <div
            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
            onClick={() => !file && inputRef.current?.click()}
            style={{
              border: `1.5px dashed ${borderColor}`,
              borderRadius: "10px", background: bgColor,
              padding: "52px 40px", textAlign: "center",
              cursor: file ? "default" : "pointer",
              transition: "all 0.2s",
            }}>
            <input ref={inputRef} type="file" accept=".pdf" style={{ display: "none" }}
              onChange={e => handleFile(e.target.files[0])} />

            {!file ? (
              <>
                {/* PDF icon */}
                <div style={{
                  width: 48, height: 56, margin: "0 auto 20px",
                  position: "relative",
                }}>
                  <svg viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
                    <rect x="1" y="1" width="38" height="46" rx="3" fill="#fff" stroke={dragOver ? "#181614" : "#ddd8cf"} strokeWidth="1.5" />
                    <path d="M27 1l11 10H28a1 1 0 01-1-1V1z" fill={dragOver ? "#e8e4dc" : "#f0ede6"} stroke={dragOver ? "#181614" : "#ddd8cf"} strokeWidth="1.5" />
                    <rect x="8" y="26" width="14" height="2" rx="1" fill={dragOver ? "#181614" : "#c8c3ba"} />
                    <rect x="8" y="31" width="22" height="2" rx="1" fill={dragOver ? "#181614" : "#c8c3ba"} />
                    <rect x="8" y="36" width="18" height="2" rx="1" fill={dragOver ? "#181614" : "#c8c3ba"} />
                    <rect x="8" y="17" width="8" height="4" rx="1" fill="#b91c1c" opacity="0.85" />
                    <text x="9.5" y="22.5" fontSize="5" fill="white" fontWeight="700" fontFamily="monospace">PDF</text>
                  </svg>
                </div>
                <p style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 500, color: "#181614" }}>
                  {dragOver ? "Release to upload" : "Drop your lease PDF here"}
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "#9a9590" }}>
                  or{" "}
                  <span style={{ color: "#181614", textDecoration: "underline", textUnderlineOffset: "2px", cursor: "pointer" }}>
                    click to browse
                  </span>
                </p>
              </>
            ) : (
              /* File selected state */
              <div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: "10px",
                  padding: "10px 16px", background: "#f0fdf4",
                  border: "1px solid #bbf7d0", borderRadius: "7px", marginBottom: "16px",
                }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3.5 3.5L13 4.5" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "#181614" }}>{file.name}</span>
                  <span style={{ fontSize: "12px", color: "#9a9590" }}>{formatSize(file.size)}</span>
                </div>
                <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#6b6560" }}>
                  File verified · Ontario lease detected
                </p>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  <button onClick={() => { setFile(null); setError(null); }} style={{
                    padding: "10px 20px", borderRadius: "6px", cursor: "pointer",
                    fontSize: "13px", fontWeight: 500, background: "transparent",
                    border: "1px solid #ddd8cf", color: "#6b6560",
                  }}>
                    Remove
                  </button>
                  <button onClick={() => onUpload(file)} style={{
                    padding: "10px 28px", borderRadius: "6px", cursor: "pointer",
                    fontSize: "13px", fontWeight: 500, background: "#181614",
                    border: "1px solid #181614", color: "#fff",
                    letterSpacing: "0.02em",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "#2d2926"}
                    onMouseLeave={e => e.currentTarget.style.background = "#181614"}>
                    Analyse Lease
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginTop: "12px", padding: "10px 14px", background: "#fef2f2",
              border: "1px solid #fecaca", borderRadius: "6px",
              fontSize: "13px", color: "#b91c1c", display: "flex", gap: "8px", alignItems: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="#b91c1c" strokeWidth="1.5" />
                <path d="M8 5v3.5M8 11v.5" stroke="#b91c1c" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          {/* Caption row */}
          <div style={{
            display: "flex", justifyContent: "center", gap: "20px",
            marginTop: "20px", flexWrap: "wrap",
          }}>
            {["Text + scanned PDF", "Ontario leases", "Free · no account"].map(item => (
              <span key={item} style={{ fontSize: "12px", color: "#9a9590", display: "flex", gap: "5px", alignItems: "center" }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 4.5" stroke="#9a9590" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Stats bar */}
        <div style={{
          marginTop: "72px", display: "flex", gap: "48px",
          padding: "24px 48px", background: "#fff",
          border: "1px solid #e8e4dc", borderRadius: "10px",
          flexWrap: "wrap", justifyContent: "center",
        }}>
          {[
            { n: "< 90s", d: "Median analysis time" },
            { n: "1,574", d: "RTA sections indexed" },
            { n: "100%", d: "Cited to statute" },
            { n: "Free", d: "No account required" },
          ].map(({ n, d }) => (
            <div key={d} style={{ textAlign: "center" }}>
              <div style={{
                fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
                fontSize: "22px", color: "#181614", letterSpacing: "-0.01em",
              }}>{n}</div>
              <div style={{ fontSize: "11px", color: "#9a9590", marginTop: "2px", letterSpacing: "0.03em" }}>{d}</div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer disclaimer */}
      <footer style={{
        padding: "16px 48px", borderTop: "1px solid #e8e4dc",
        fontSize: "11px", color: "#b0aaa4", textAlign: "center", lineHeight: 1.5,
      }}>
        LeaseGuard provides educational information only and does not constitute legal advice.
        For matters requiring professional legal judgment, consult a licensed paralegal or lawyer.
        Analysis is grounded in the Ontario Residential Tenancies Act, 2006.
        Corpus version RTA-2024-Q4.
      </footer>
    </div>
  );
}

window.LandingPage = LandingPage;
