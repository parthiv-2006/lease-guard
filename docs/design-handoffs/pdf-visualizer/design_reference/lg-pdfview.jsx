// LeaseGuard — Split-Screen PDF Viewer
// Renders a scrollable mock-PDF with per-clause highlight linking.
// Exports: PDFViewer

const { useState, useEffect, useRef } = React;

// ── Helpers ──────────────────────────────────────────────────────────────────
function hexAlpha(hex, alpha) {
  if (!hex || hex.length < 7) return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Static document structure ────────────────────────────────────────────────
// Each page = array of section descriptors.
// t:'bp'     → boilerplate clause (number n, heading h, text)
// t:'clause' → real clause from mock data (id)
// t:'header' → document header block
// t:'sigs'   → signature block
const PAGES = [
  {
    num: 1,
    sections: [
      { t: 'header' },
      { t: 'bp', n: '1', h: 'Parties and Property',
        text: 'This Residential Tenancy Agreement ("Agreement") is entered into between Mapleleaf Properties Inc. (the "Landlord"), registered at 1800–55 University Ave, Toronto, ON, and the undersigned individual(s) (the "Tenant"). The Landlord agrees to rent to the Tenant the residential premises municipally described as Unit 1204–123 King St W, Toronto, ON M5X 1C4 (the "Premises"), subject to the terms of this Agreement and the Residential Tenancies Act, 2006, S.O. 2006, c. 17 (the "Act").'
      },
      { t: 'bp', n: '2', h: 'Term of Tenancy',
        text: 'The tenancy commences on September 1, 2026 and continues for a fixed term ending August 31, 2027 (the "Term"), thereafter continuing on a month-to-month basis. Either party may terminate the month-to-month tenancy in writing in accordance with the Act. The Tenant shall take possession on the commencement date and deliver vacant possession on the termination date in the same condition, reasonable wear and tear excepted.'
      },
    ]
  },
  {
    num: 2,
    sections: [
      { t: 'clause', id: 'c1' },
      { t: 'bp', n: '4', h: 'Rules and Common Areas',
        text: 'The Tenant agrees to abide by all building rules and regulations as amended by the Landlord from time to time, provided such rules do not conflict with the Act. The Tenant shall keep the Premises and common areas clean, shall not create unreasonable noise or disturbance, and shall dispose of refuse in designated receptacles only. Violation of building rules may constitute grounds for a notice of termination under the Act.'
      },
      { t: 'clause', id: 'c2' },
    ]
  },
  {
    num: 3,
    sections: [
      { t: 'clause', id: 'c3' },
      { t: 'bp', n: '7', h: 'Utilities and Services',
        text: 'The Tenant is solely responsible for establishing accounts and paying all charges for hydro, natural gas, internet, telephone, and cable services. Monthly rent includes water and municipal waste collection. The Landlord shall not be liable for disruption to utilities caused by third-party providers or by the Tenant\'s failure to maintain utility accounts in good standing.'
      },
      { t: 'clause', id: 'c4' },
    ]
  },
  {
    num: 4,
    sections: [
      { t: 'bp', n: '9', h: 'Maintenance and Repairs',
        text: 'The Landlord shall maintain the Premises and the residential complex in a good state of repair, fit for habitation, and in compliance with health, safety, housing, and maintenance standards as required by the Act. The Tenant shall maintain ordinary cleanliness and promptly notify the Landlord of any damage or required repair. The Tenant is liable for damage caused by the Tenant\'s wilful or negligent conduct, or that of persons permitted on the Premises by the Tenant.'
      },
      { t: 'bp', n: '10', h: 'Tenant\'s Insurance',
        text: 'The Tenant is strongly encouraged to obtain and maintain, throughout the Term, a comprehensive tenant\'s insurance policy covering personal property and third-party liability. The Landlord\'s property insurance covers the building structure only and does not extend to the Tenant\'s personal effects, household contents, or liability arising from the Tenant\'s use of the Premises.'
      },
      { t: 'bp', n: '11', h: 'Assignment and Subletting',
        text: 'The Tenant shall not assign this tenancy or sublet the Premises without prior written consent of the Landlord. The Landlord shall not arbitrarily withhold or delay consent to a proposed assignment or sublet that meets the requirements of the Act. Any assignment or sublet effected without consent shall be void and may result in termination proceedings before the Landlord and Tenant Board.'
      },
      { t: 'clause', id: 'c5' },
    ]
  },
  {
    num: 5,
    sections: [
      { t: 'bp', n: '13', h: 'Notices',
        text: 'All notices under this Agreement shall be in writing and served personally, by prepaid first-class mail, or by email to the contact information on page one. Mailed notices are deemed received on the third business day after mailing. Either party may update their notice address by written notification to the other party.'
      },
      { t: 'bp', n: '14', h: 'Quiet Enjoyment',
        text: 'Provided the Tenant complies with all obligations under this Agreement and the Act, the Tenant shall have the right to quiet enjoyment of the Premises, free from interference or harassment by the Landlord or anyone claiming through the Landlord. This covenant is in addition to any rights the Tenant may have under the Act.'
      },
      { t: 'bp', n: '15', h: 'Keys and Access',
        text: 'Upon commencement of the tenancy, the Landlord shall provide two (2) sets of unit keys and one (1) building fob or access card. Lost or unreturned keys or fobs shall be replaced at the Tenant\'s expense, not to exceed the Landlord\'s actual replacement cost. The Tenant shall not change, add, or re-key any lock without prior written consent.'
      },
      { t: 'bp', n: '16', h: 'Parking',
        text: 'One underground parking space (Space #47, Level P2) is included in the monthly rent at no additional charge, for a single passenger vehicle only. No storage, commercial vehicles, or recreational vehicles may be kept in the space without prior written consent. The Tenant assumes all risk of loss or damage to any vehicle or contents.'
      },
      { t: 'clause', id: 'c6' },
    ]
  },
  {
    num: 6,
    sections: [
      { t: 'bp', n: '18', h: 'Alterations',
        text: 'The Tenant shall make no structural alterations, additions, or improvements to the Premises without prior written consent of the Landlord. Permitted alterations shall be completed in a good and workmanlike manner, in compliance with all applicable codes. Upon termination, the Landlord may require the Tenant to restore the Premises to pre-alteration condition at the Tenant\'s expense.'
      },
      { t: 'bp', n: '19', h: 'Smoke Detectors and Safety',
        text: 'The Landlord shall ensure all smoke detectors and carbon monoxide detectors are installed and operational at commencement. The Tenant shall test these devices monthly, report any malfunction immediately, and shall not remove, disable, or tamper with any detector. Failure to comply may constitute an offence under the Fire Protection and Prevention Act, 1997.'
      },
      { t: 'bp', n: '20', h: 'Smoking Prohibition',
        text: 'Smoking of tobacco, cannabis, or any other substance is strictly prohibited within the unit, on balconies and terraces appurtenant to the unit, and in all common areas of the building. This prohibition applies to all occupants and guests. A violation shall be deemed a substantial breach of this Agreement.'
      },
      { t: 'clause', id: 'c7' },
      { t: 'bp', n: '22', h: 'Entire Agreement',
        text: 'This Agreement, including any attached Schedules, constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, and understandings. This Agreement may not be amended except by a written instrument signed by both parties. In the event of any conflict between this Agreement and the Act, the Act shall prevail to the extent of the conflict.'
      },
      { t: 'bp', n: '23', h: 'Governing Law',
        text: 'This Agreement shall be governed by the laws of the Province of Ontario. The Landlord and Tenant Board of Ontario shall have exclusive jurisdiction to resolve disputes arising under this Agreement, except where a court of competent jurisdiction is specifically designated by the Act.'
      },
      { t: 'sigs' },
    ]
  },
];

// ── Page sub-components ──────────────────────────────────────────────────────

function DocHeader() {
  return (
    <div style={{ marginBottom: 26, paddingBottom: 18, borderBottom: '1.5px solid #181614' }}>
      <div style={{
        fontSize: 8, letterSpacing: '0.13em', textTransform: 'uppercase',
        color: '#9a9590', fontFamily: "'DM Sans', sans-serif", marginBottom: 9,
      }}>
        Province of Ontario · Residential Tenancies Act, 2006
      </div>
      <div style={{
        fontSize: 19, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
        color: '#181614', letterSpacing: '-0.01em', marginBottom: 16,
      }}>
        Residential Tenancy Agreement
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 24px' }}>
        {[
          ['Landlord', 'Mapleleaf Properties Inc.'],
          ['Unit Address', '1204 – 123 King St W'],
          ['City / Postal', 'Toronto, ON  M5X 1C4'],
          ['Monthly Rent', '$2,850.00'],
          ['Term Commencement', 'September 1, 2026'],
          ['Term End Date', 'August 31, 2027'],
        ].map(([label, val]) => (
          <div key={label}>
            <div style={{
              fontSize: 8, color: '#9a9590', textTransform: 'uppercase',
              letterSpacing: '0.07em', fontFamily: "'DM Sans', sans-serif", marginBottom: 1,
            }}>{label}</div>
            <div style={{ fontSize: 10.5, color: '#181614', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
              {val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BpSection({ n, h, text }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 7, marginBottom: 4 }}>
        <span style={{
          fontSize: 10, fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700, color: '#181614', flexShrink: 0, minWidth: 16,
        }}>{n}.</span>
        <span style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: '#181614' }}>
          {h}
        </span>
      </div>
      <p style={{
        margin: 0, fontSize: 10, fontFamily: "'DM Sans', sans-serif",
        color: '#3d3d3d', lineHeight: 1.72, paddingLeft: 23,
        textAlign: 'justify',
      }}>{text}</p>
    </div>
  );
}

function ClauseSec({ clause, highlighted, flash }) {
  const col  = window.riskColor(clause.risk_level);
  const bg   = window.riskBg(clause.risk_level);
  const bdr  = window.riskBorder(clause.risk_level);
  const lbls = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

  const bgColor = flash
    ? bg
    : highlighted
    ? hexAlpha(bg, 0.45)
    : 'transparent';

  const borderColor = highlighted ? col : 'transparent';

  return (
    <div
      id={`pdf-${clause.id}`}
      style={{
        marginBottom: 14,
        paddingLeft: highlighted ? 9 : 12,
        paddingTop: highlighted ? 7 : 0,
        paddingBottom: highlighted ? 7 : 0,
        borderLeft: `3px solid ${borderColor}`,
        background: bgColor,
        borderRadius: highlighted ? '0 5px 5px 0' : 0,
        transition: 'background 0.5s ease, border-color 0.35s ease, padding 0.25s ease',
        position: 'relative',
      }}
    >
      {/* Risk label bubble */}
      {highlighted && (
        <div style={{
          position: 'absolute', top: 7, right: 0,
          fontSize: 8, padding: '2px 8px',
          background: bg, border: `1px solid ${bdr}`,
          borderRadius: '3px 0 0 3px',
          color: col, fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          opacity: flash ? 1 : 0.75,
          transition: 'opacity 0.5s',
        }}>{lbls[clause.risk_level] || clause.risk_level}</div>
      )}

      {/* Clause heading */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 4 }}>
        <span style={{
          fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
          color: highlighted ? col : '#181614', flexShrink: 0, minWidth: 16,
          transition: 'color 0.35s',
        }}>{clause.number}.</span>
        <span style={{
          fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
          color: highlighted ? col : '#181614', transition: 'color 0.35s',
        }}>{clause.heading}</span>
      </div>

      {/* Clause text */}
      <p style={{
        margin: 0, fontSize: 10, fontFamily: "'DM Sans', sans-serif",
        color: '#3d3d3d', lineHeight: 1.72, paddingLeft: 23,
        textAlign: 'justify',
      }}>{clause.raw_text}</p>
    </div>
  );
}

function SigSection() {
  return (
    <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #ddd8cf' }}>
      <div style={{
        fontSize: 10, fontFamily: "'DM Sans', sans-serif",
        fontWeight: 700, color: '#181614', marginBottom: 14,
      }}>24. Signatures</div>
      <p style={{
        margin: '0 0 20px', fontSize: 9.5, fontFamily: "'DM Sans', sans-serif",
        color: '#6b6560', lineHeight: 1.65,
      }}>
        By signing below, both parties acknowledge they have read, understood, and agree to the terms
        of this Agreement. The Tenant acknowledges receiving a copy of this Agreement and the Ontario
        Standard Lease information package.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {['Landlord', 'Tenant'].map(party => (
          <div key={party}>
            <div style={{
              fontSize: 8.5, color: '#9a9590', fontFamily: "'DM Sans', sans-serif",
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 32,
            }}>{party}</div>
            {['Signature', 'Print Name', 'Date'].map((lbl, i) => (
              <div key={lbl} style={{ marginTop: i > 0 ? 20 : 0 }}>
                <div style={{ borderBottom: '1px solid #9a9590', marginBottom: 4 }} />
                <div style={{ fontSize: 8.5, color: '#b0aaa4', fontFamily: "'DM Sans', sans-serif" }}>{lbl}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

function PDFViewer({ clauses, activeClauseId }) {
  const scrollRef = useRef(null);
  const [flashId, setFlashId] = useState(null);

  // Respond to active clause changes: scroll + flash
  useEffect(() => {
    if (!activeClauseId) return;

    // Flash for 1.8s
    setFlashId(activeClauseId);
    const clearFlash = setTimeout(() => setFlashId(null), 1800);

    // Scroll into view (avoid scrollIntoView per guidelines)
    const scrollEl = scrollRef.current;
    const target   = scrollEl ? scrollEl.querySelector(`#pdf-${activeClauseId}`) : null;
    if (scrollEl && target) {
      const cRect = scrollEl.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      const targetTop = scrollEl.scrollTop + tRect.top - cRect.top
        - (cRect.height / 2 - tRect.height / 2);
      scrollEl.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }

    return () => clearTimeout(clearFlash);
  }, [activeClauseId]);

  const activeClause = clauses.find(c => c.id === activeClauseId);

  function renderSection(sec, key) {
    switch (sec.t) {
      case 'header':
        return <DocHeader key="hdr" />;
      case 'bp':
        return <BpSection key={sec.n} n={sec.n} h={sec.h} text={sec.text} />;
      case 'sigs':
        return <SigSection key="sigs" />;
      case 'clause': {
        const c = clauses.find(cl => cl.id === sec.id);
        if (!c) return null;
        return (
          <ClauseSec
            key={c.id}
            clause={c}
            highlighted={activeClauseId === c.id}
            flash={flashId === c.id}
          />
        );
      }
      default:
        return null;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#484848' }}>

      {/* ── PDF toolbar ── */}
      <div style={{
        flexShrink: 0, height: 36,
        background: '#2c2c2c', borderBottom: '1px solid #1a1a1a',
        display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10,
      }}>
        {/* PDF file icon */}
        <svg width="13" height="14" viewBox="0 0 13 14" fill="none" style={{ opacity: 0.45, flexShrink: 0 }}>
          <rect x="0.5" y="0.5" width="9" height="13" rx="1" stroke="#fff" strokeWidth="1.2" />
          <path d="M9.5 0.5L12.5 3.5v9a1 1 0 01-1 1H3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M9.5 0.5v3h3" stroke="#fff" strokeWidth="1.2" />
        </svg>

        <span style={{ fontSize: 11, color: '#ccc', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
          KingSt_Lease_2026.pdf
        </span>
        <span style={{ fontSize: 10, color: '#666', fontFamily: "'DM Sans', sans-serif" }}>
          6 pp.
        </span>

        <div style={{ flex: 1 }} />

        {/* Active clause status pill */}
        {activeClause ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 3,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: window.riskColor(activeClause.risk_level),
            }} />
            <span style={{ fontSize: 10, color: '#bbb', fontFamily: "'DM Sans', sans-serif" }}>
              Clause {activeClause.number} — {activeClause.heading}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 10, color: '#555', fontFamily: "'DM Sans', sans-serif" }}>
            Click a clause to highlight
          </span>
        )}
      </div>

      {/* ── Scrollable pages ── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflow: 'auto',
          padding: '16px 12px 24px',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12,
        }}
      >
        {PAGES.map(page => (
          <div key={page.num} style={{
            background: '#fff',
            width: '100%', maxWidth: 620,
            padding: '44px 48px 34px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.42)',
            position: 'relative',
          }}>
            {/* Page footer */}
            <div style={{
              position: 'absolute', bottom: 12,
              left: 0, right: 0, textAlign: 'center',
              fontSize: 8.5, color: '#c5bfb5',
              fontFamily: "'DM Sans', sans-serif",
              letterSpacing: '0.06em',
            }}>— {page.num} —</div>

            {page.sections.map((sec, i) => renderSection(sec, i))}
          </div>
        ))}
        <div style={{ height: 12 }} />
      </div>
    </div>
  );
}

window.PDFViewer = PDFViewer;
