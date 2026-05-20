// LeaseGuard — Root App + Tweaks

const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentColor": "#b91c1c",
  "sidebarDark": true,
  "fontStyle": "serif",
  "density": "comfortable"
}/*EDITMODE-END*/;

function App() {
  const [screen, setScreen] = useState("landing"); // landing | processing | report
  const [uploadedFile, setUploadedFile] = useState(null);
  const [tweaks, setTweakState] = useState(TWEAK_DEFAULTS);
  const [showTweaks, setShowTweaks] = useState(false);

  const report = window.MOCK_REPORT;

  function setTweak(keyOrObj, val) {
    const update = typeof keyOrObj === "string" ? { [keyOrObj]: val } : keyOrObj;
    const next = { ...tweaks, ...update };
    setTweakState(next);
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: next }, "*");
  }

  // Register tweaks protocol
  useEffect(() => {
    function handleMessage(e) {
      if (e.data?.type === "__activate_edit_mode") setShowTweaks(true);
      if (e.data?.type === "__deactivate_edit_mode") setShowTweaks(false);
    }
    window.addEventListener("message", handleMessage);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function handleUpload(file) {
    setUploadedFile(file);
    setScreen("processing");
  }

  function handleProcessingComplete() {
    setScreen("report");
  }

  function handleBack() {
    setScreen("landing");
    setUploadedFile(null);
  }

  return (
    <div style={{ fontFamily: tweaks.fontStyle === "serif" ? "'DM Sans', sans-serif" : "'DM Sans', sans-serif" }}>
      {screen === "landing" && (
        <LandingPage onUpload={handleUpload} />
      )}
      {screen === "processing" && (
        <ProcessingPage
          filename={uploadedFile?.name || "KingSt_Lease_2026.pdf"}
          onComplete={handleProcessingComplete}
        />
      )}
      {screen === "report" && (
        <ReportPage report={report} onBack={handleBack} />
      )}

      {/* Tweaks panel */}
      {showTweaks && (
        <TweaksPanel
          title="Tweaks"
          onClose={() => {
            setShowTweaks(false);
            window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*");
          }}
        >
          <TweakSection title="Quick jump">
            <TweakButton label="Landing page" onClick={() => setScreen("landing")} />
            <TweakButton label="Processing screen" onClick={() => setScreen("processing")} />
            <TweakButton label="Report — Overview" onClick={() => { setScreen("report"); }} />
          </TweakSection>

          <TweakSection title="Report panel">
            {["overview","redflags","clauses","negotiation","missing","contradictions","sources","trace"].map(p => (
              <TweakButton key={p} label={p.charAt(0).toUpperCase() + p.slice(1)}
                onClick={() => {
                  setScreen("report");
                  // dispatch panel change after mount
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("lg-navigate", { detail: p }));
                  }, 50);
                }}
              />
            ))}
          </TweakSection>

          <TweakSection title="Design">
            <TweakColor
              label="Risk accent"
              value={tweaks.accentColor}
              options={["#b91c1c", "#1d4ed8", "#0d9488", "#7c3aed"]}
              onChange={v => setTweak("accentColor", v)}
            />
            <TweakRadio
              label="Font style"
              value={tweaks.fontStyle}
              options={[{ value: "serif", label: "Serif" }, { value: "sans", label: "Sans" }]}
              onChange={v => setTweak("fontStyle", v)}
            />
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
