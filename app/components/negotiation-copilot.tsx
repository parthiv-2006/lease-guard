"use client";

import { useState, useEffect } from "react";
import { Icon, CopyButton } from "./shared";
import type { NegotiationPoint } from "./types";

interface NegotiationCopilotProps {
  isOpen: boolean;
  onClose: () => void;
  leaseId: string;
  negotiationPoints: NegotiationPoint[];
  propertyAddress: string;
}

interface GenerateNegotiationResponse {
  email_subject: string;
  email_body: string;
  addendum_title: string;
  addendum_intro: string;
  addendum_clauses: Array<{
    original_number: string;
    heading: string;
    proposed_text: string;
  }>;
}

export function NegotiationCopilot({
  isOpen,
  onClose,
  leaseId,
  negotiationPoints,
  propertyAddress,
}: NegotiationCopilotProps) {
  const [tenantName, setTenantName] = useState("");
  const [landlordName, setLandlordName] = useState("");
  const [tone, setTone] = useState<"cooperative" | "formal" | "assertive">("cooperative");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateNegotiationResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"email" | "addendum">("email");
  const [error, setError] = useState<string | null>(null);

  // Initialize selected clauses: default all high and medium priority
  useEffect(() => {
    const defaults = negotiationPoints
      .filter((n) => n.priority === "high" || n.priority === "medium")
      .map((n) => n.clause_id);
    // Fall back to all if none are high/medium
    setSelectedIds(defaults.length > 0 ? defaults : negotiationPoints.map((n) => n.clause_id));
  }, [negotiationPoints]);

  if (!isOpen) return null;

  function toggleClause(clauseId: string) {
    setSelectedIds((prev) =>
      prev.includes(clauseId) ? prev.filter((id) => id !== clauseId) : [...prev, clauseId]
    );
  }

  async function handleGenerate() {
    if (!tenantName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!landlordName.trim()) {
      setError("Please enter the landlord's name.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Please select at least one clause to negotiate.");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/negotiation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId,
          tenantName,
          landlordName,
          tone,
          selectedClauseIds: selectedIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Generation failed. Please try again.");
        return;
      }

      setResult(data);
      setActiveTab("email");
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setGenerating(false);
    }
  }

  // Format addendum as pure markdown text for easy copying
  const addendumText = result
    ? `${result.addendum_title}

Property Address: ${propertyAddress}
Tenant(s): ${tenantName}
Landlord: ${landlordName}

${result.addendum_intro}

${result.addendum_clauses
  .map(
    (c) => `1. AMENDMENT TO CLAUSE ${c.original_number} (${c.heading})
The original clause is deleted in its entirety and replaced with the following:
"${c.proposed_text}"`
  )
  .join("\n\n")}

IN WITNESS WHEREOF, the parties hereto have executed this Addendum.

Tenant Signature: _________________________  Date: ______________
Landlord Signature: ________________________  Date: ______________`
    : "";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        backdropFilter: "blur(2px)",
        zIndex: 500,
        display: "flex",
        justifyContent: "flex-end",
        transition: "opacity 0.25s ease-out",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: "560px",
          maxWidth: "95vw",
          background: "#fdfcfa",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-10px 0 40px rgba(0,0,0,0.08)",
          borderLeft: "1px solid #e8e4dc",
          position: "relative",
          animation: "slideIn 0.3s ease-out",
        }}
      >
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Drawer Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e8e4dc",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f6f3ee",
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "18px",
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 600,
                color: "#181614",
              }}
            >
              Negotiation Copilot
            </h3>
            <span style={{ fontSize: "11px", color: "#9a9590" }}>
              Ontario Residential Tenancies Act grounding
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px",
              display: "flex",
              borderRadius: "50%",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e8e4dc")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Icon name="close" size={16} color="#6b6560" />
          </button>
        </div>

        {/* Drawer Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
          {!result && !generating ? (
            /* Configure Form View */
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Names input row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#6b6560",
                      marginBottom: "6px",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Tenant Name(s)
                  </label>
                  <input
                    type="text"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #ddd8cf",
                      fontSize: "13px",
                      background: "#fff",
                      color: "#181614",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#6b6560",
                      marginBottom: "6px",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Landlord Name
                  </label>
                  <input
                    type="text"
                    value={landlordName}
                    onChange={(e) => setLandlordName(e.target.value)}
                    placeholder="e.g. Mapleleaf PM"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #ddd8cf",
                      fontSize: "13px",
                      background: "#fff",
                      color: "#181614",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  />
                </div>
              </div>

              {/* Tone Selection */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#6b6560",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Tone of Negotiation
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  {(["cooperative", "formal", "assertive"] as const).map((t) => {
                    const active = tone === t;
                    const labels = {
                      cooperative: "Cooperative",
                      formal: "Formal Business",
                      assertive: "Assertive (Legal)",
                    };
                    return (
                      <button
                        key={t}
                        onClick={() => setTone(t)}
                        style={{
                          padding: "8px 4px",
                          borderRadius: "6px",
                          border: active ? "1.5px solid #181614" : "1px solid #ddd8cf",
                          background: active ? "#181614" : "#fff",
                          color: active ? "#fff" : "#6b6560",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all 0.15s",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {labels[t]}
                      </button>
                    );
                  })}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#9a9590" }}>
                  {tone === "cooperative" &&
                    "Stresses friendly partnership and aligning lease with standard regulations."}
                  {tone === "formal" &&
                    "Uses objective, standard professional correspondence layouts."}
                  {tone === "assertive" &&
                    "Directly cites RTA sections and outlines that conflicting terms are void."}
                </p>
              </div>

              {/* Clause Selector */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#6b6560",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Select Clauses to Address ({selectedIds.length})
                </label>
                <div
                  style={{
                    border: "1px solid #e8e4dc",
                    borderRadius: "8px",
                    maxHeight: "300px",
                    overflow: "auto",
                    background: "#fff",
                  }}
                >
                  {negotiationPoints.map((n) => {
                    const isSelected = selectedIds.includes(n.clause_id);
                    return (
                      <div
                        key={n.id}
                        onClick={() => toggleClause(n.clause_id)}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px",
                          padding: "10px 14px",
                          borderBottom: "1px solid #f6f3ee",
                          cursor: "pointer",
                          background: isSelected ? "#faf9f6" : "#fff",
                          transition: "background 0.12s",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          style={{ marginTop: "3px", cursor: "pointer" }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              marginBottom: "2px",
                            }}
                          >
                            <span style={{ fontSize: "12px", fontWeight: 600, color: "#181614" }}>
                              {n.clause_label}
                            </span>
                            <span
                              style={{
                                fontSize: "9px",
                                textTransform: "uppercase",
                                padding: "1px 5px",
                                borderRadius: "100px",
                                background:
                                  n.priority === "high"
                                    ? "#fef2f2"
                                    : n.priority === "medium"
                                    ? "#fffbeb"
                                    : "#f0fdf4",
                                color:
                                  n.priority === "high"
                                    ? "#b91c1c"
                                    : n.priority === "medium"
                                    ? "#b45309"
                                    : "#15803d",
                                border: `1px solid ${
                                  n.priority === "high"
                                    ? "#fecaca"
                                    : n.priority === "medium"
                                    ? "#fde68a"
                                    : "#bbf7d0"
                                }`,
                              }}
                            >
                              {n.priority}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#6b6560",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {n.ask}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "6px",
                    color: "#b91c1c",
                    fontSize: "12px",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#181614",
                  border: "1px solid #181614",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  marginTop: "8px",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2825")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#181614")}
              >
                Generate Proposal
              </button>
            </div>
          ) : generating ? (
            /* Loading State */
            <div
              style={{
                height: "60vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: "2px solid #e8e4dc",
                  borderTopColor: "#181614",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <span style={{ fontSize: "14px", color: "#6b6560", fontWeight: 500 }}>
                Generating proposal...
              </span>
              <span style={{ fontSize: "11px", color: "#b0aaa4", textAlign: "center", maxWidth: "260px" }}>
                Analyzing selected violations & scripting compliance edits.
              </span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            /* Results View */
            <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "16px" }}>
              {/* Tab Selector Headers */}
              <div
                style={{
                  display: "flex",
                  borderBottom: "1px solid #e8e4dc",
                  gap: "16px",
                  marginBottom: "8px",
                }}
              >
                <button
                  onClick={() => setActiveTab("email")}
                  style={{
                    padding: "8px 12px 10px",
                    background: "none",
                    border: "none",
                    borderBottom: activeTab === "email" ? "2.5px solid #181614" : "2.5px solid transparent",
                    color: activeTab === "email" ? "#181614" : "#9a9590",
                    fontWeight: activeTab === "email" ? 600 : 400,
                    fontSize: "13px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Email Proposal
                </button>
                <button
                  onClick={() => setActiveTab("addendum")}
                  style={{
                    padding: "8px 12px 10px",
                    background: "none",
                    border: "none",
                    borderBottom: activeTab === "addendum" ? "2.5px solid #181614" : "2.5px solid transparent",
                    color: activeTab === "addendum" ? "#181614" : "#9a9590",
                    fontWeight: activeTab === "addendum" ? 600 : 400,
                    fontSize: "13px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Lease Amendment Addendum
                </button>
              </div>

              {activeTab === "email" && result && (
                /* Tab 1: Email View */
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#9a9590", textTransform: "uppercase" }}>
                      Email Content
                    </span>
                    <CopyButton text={`Subject: ${result.email_subject}\n\n${result.email_body}`} label="Copy Email" />
                  </div>

                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #e8e4dc",
                      borderRadius: "6px",
                      padding: "16px",
                      fontSize: "13px",
                      lineHeight: 1.6,
                      color: "#181614",
                    }}
                  >
                    <div style={{ borderBottom: "1px solid #f6f3ee", paddingBottom: "10px", marginBottom: "12px" }}>
                      <strong>Subject:</strong> {result.email_subject}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{result.email_body}</div>
                  </div>
                </div>
              )}

              {activeTab === "addendum" && result && (
                /* Tab 2: Addendum Legal Sheet View */
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#9a9590", textTransform: "uppercase" }}>
                      Amendment Sheet
                    </span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <CopyButton text={addendumText} label="Copy Wording" />
                      <button
                        onClick={() => window.print()}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "5px 12px",
                          borderRadius: "5px",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontFamily: "'DM Sans', sans-serif",
                          fontWeight: 500,
                          background: "#fff",
                          border: "1px solid #ddd8cf",
                          color: "#5c5751",
                          transition: "all 0.15s",
                        }}
                      >
                        <Icon name="export" size={12} color="#5c5751" />
                        Print/PDF
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #ddd8cf",
                      borderRadius: "6px",
                      padding: "24px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                      fontFamily: "Georgia, serif",
                      color: "#111",
                      fontSize: "13px",
                      lineHeight: 1.65,
                    }}
                  >
                    <h4 style={{ textAlign: "center", margin: "0 0 16px", textTransform: "uppercase", fontSize: "15px", letterSpacing: "0.05em" }}>
                      {result.addendum_title}
                    </h4>

                    <div style={{ marginBottom: "16px", fontSize: "12px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>
                      <div><strong>Property Address:</strong> {propertyAddress}</div>
                      <div><strong>Tenant(s):</strong> {tenantName}</div>
                      <div><strong>Landlord:</strong> {landlordName}</div>
                    </div>

                    <p style={{ textIndent: "20px", margin: "0 0 16px" }}>{result.addendum_intro}</p>

                    <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "28px" }}>
                      {result.addendum_clauses.map((c, i) => (
                        <div key={i} style={{ borderLeft: "2px solid #ddd8cf", paddingLeft: "12px" }}>
                          <strong style={{ display: "block", marginBottom: "4px", fontSize: "12px" }}>
                            AMENDMENT TO CLAUSE {c.original_number} ({c.heading})
                          </strong>
                          <span style={{ fontStyle: "italic", color: "#444" }}>
                            The original clause is deleted in its entirety and replaced with the following:
                          </span>
                          <p style={{ margin: "6px 0 0", fontWeight: 500 }}>&ldquo;{c.proposed_text}&rdquo;</p>
                        </div>
                      ))}
                    </div>

                    <p style={{ margin: "0 0 24px" }}>
                      IN WITNESS WHEREOF, the parties hereto have executed this Addendum.
                    </p>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "24px", fontSize: "11px", fontFamily: "'DM Sans', sans-serif" }}>
                      <div>
                        <div>____________________________________</div>
                        <div style={{ marginTop: "4px" }}>Tenant Signature</div>
                        <div style={{ marginTop: "4px", color: "#9a9590" }}>Date: __________________</div>
                      </div>
                      <div>
                        <div>____________________________________</div>
                        <div style={{ marginTop: "4px" }}>Landlord Signature</div>
                        <div style={{ marginTop: "4px", color: "#9a9590" }}>Date: __________________</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action row */}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "auto",
                  paddingTop: "14px",
                  borderTop: "1px solid #e8e4dc",
                }}
              >
                <button
                  onClick={() => setResult(null)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "6px",
                    border: "1px solid #ddd8cf",
                    background: "#fff",
                    color: "#6b6560",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Adjust Config
                </button>
                <button
                  onClick={onClose}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "6px",
                    border: "1px solid #181614",
                    background: "#181614",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    marginLeft: "auto",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
