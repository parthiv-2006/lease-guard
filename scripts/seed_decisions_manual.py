#!/usr/bin/env python3
"""
seed_decisions_manual.py — Seed LTB decisions from manually copied text files.

Use this when the CanLII API caseText endpoint returns 403 and browser scraping
is blocked by Cloudflare. You copy decision text from your normal browser;
this script handles PII stripping, embedding, and upserting.

─── How to use ────────────────────────────────────────────────────────────────

1. Open any LTB decision on canlii.org in your browser (normal browsing works fine).
   Example: https://www.canlii.org/en/on/onltb/doc/2024onltb12345/2024onltb12345.html

2. Select all the decision text (Ctrl+A → Ctrl+C, or copy from the text area).

3. Create a file in scripts/source-docs/ltb_decisions/ named after the case:
       TST-12345-23.txt   ← use the LTB file number as the filename

4. Paste the decision text into the file and save it.

5. Also add a metadata line at the very top of the file (before the decision text):
       #meta: date=2023-05-14, clause_types=entry_rights, url=https://www.canlii.org/...
   All three fields are optional — the script will infer what it can without them.

6. Run this script:
       python scripts/seed_decisions_manual.py

The script will:
  - Read every .txt file in scripts/source-docs/ltb_decisions/
  - Strip PII, extract analysis section, infer outcome
  - Embed with Gemini REST and upsert into tribunal_decisions

─── Target decisions (priority order) ────────────────────────────────────────

Pick decisions that are clearly on-point for each clause type.
Landmark cases are best — they get cited often, so retrieval will find them.

entry_rights (10):
  Search canlii.org for: "entry without notice" site:canlii.org/en/on/onltb
  Good search: https://www.canlii.org/en/on/onltb/ → filter by keyword

security_deposit (10):
  Search for: "last month rent deposit" OR "section 105"

maintenance_repairs (5): "section 20" "disrepair" "good repair"
early_termination (5):   "N12" "own use" OR "bad faith eviction"
rent_increase (5):       "above guideline" OR "section 116"
quiet_enjoyment (5):     "substantial interference" OR "section 22"

Total: ~40 decisions. Takes about 1 hour to copy-paste.

──────────────────────────────────────────────────────────────────────────────
"""

import os
import re
import sys
import time
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import certifi
import truststore

truststore.inject_into_ssl()

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

_project_root = Path(__file__).parent.parent
load_dotenv(dotenv_path=_project_root / ".env.local")
load_dotenv(dotenv_path=_project_root / ".env")

GEMINI_API_KEY          = os.environ.get("GEMINI_API_KEY", "")
SUPABASE_URL            = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

CORPUS_VERSION       = date.today().isoformat()
CANLII_TRIBUNAL_NAME = "Ontario Landlord and Tenant Board"
JURISDICTION_CODE    = "CA-ON"
DECISIONS_DIR        = _project_root / "scripts" / "source-docs" / "ltb_decisions"

_GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/gemini-embedding-001:embedContent"
)

VALID_CLAUSE_TYPES: frozenset[str] = frozenset({
    "rent_payment", "rent_increase", "security_deposit", "entry_rights",
    "maintenance_repairs", "subletting_assignment", "early_termination",
    "renewal_terms", "utilities", "pets", "alterations", "quiet_enjoyment",
    "liability_indemnification", "dispute_resolution", "parking_storage",
    "guest_policy", "standard_boilerplate", "unknown",
})

# ---------------------------------------------------------------------------
# Metadata parsing
# ---------------------------------------------------------------------------

_META_RE = re.compile(
    r"^#meta:\s*"
    r"(?:date=(?P<date>[0-9]{4}-[0-9]{2}-[0-9]{2}))?,?\s*"
    r"(?:clause_types?=(?P<types>[a-z_,\s]+))?,?\s*"
    r"(?:url=(?P<url>https?://\S+))?",
    re.IGNORECASE,
)

_CLAUSE_INFER: list[tuple[str, list[str]]] = [
    ("security_deposit",    ["deposit", "section 105", "s. 105", "s.105", "key deposit", "section 106"]),
    ("entry_rights",        ["entry without notice", "section 26", "s. 26", "section 27", "s. 27", "landlord enter"]),
    ("maintenance_repairs", ["maintenance", "disrepair", "good repair", "section 20", "s. 20", "regulation 516"]),
    ("early_termination",   ["N12", "N4", "N13", "own use eviction", "section 48"]),
    ("rent_increase",       ["above guideline", "AGI", "section 116", "s. 116", "rent increase notice"]),
    ("quiet_enjoyment",     ["quiet enjoyment", "substantial interference", "section 22", "s. 22"]),
]


def _infer_clause_types(text_lower: str) -> list[str]:
    found = []
    for clause_type, keywords in _CLAUSE_INFER:
        if any(kw.lower() in text_lower for kw in keywords):
            found.append(clause_type)
    return found or ["unknown"]


def parse_decision_file(path: Path) -> dict[str, Any] | None:
    """
    Read a .txt file and return a row dict ready for embedding + upsert.
    Returns None if the file can't be parsed into a usable decision.
    """
    raw = path.read_text(encoding="utf-8", errors="replace")
    lines = raw.splitlines()

    # Parse optional #meta line at top
    meta_date = ""
    meta_types: list[str] = []
    meta_url = ""
    text_start = 0

    if lines and lines[0].startswith("#meta:"):
        m = _META_RE.match(lines[0])
        if m:
            meta_date  = (m.group("date") or "").strip()
            raw_types  = (m.group("types") or "").strip()
            meta_url   = (m.group("url") or "").strip()
            meta_types = [
                t.strip() for t in raw_types.split(",")
                if t.strip() in VALID_CLAUSE_TYPES
            ]
        text_start = 1

    body = "\n".join(lines[text_start:]).strip()
    if len(body) < 200:
        print(f"  [skip] {path.name} — too short ({len(body)} chars)", file=sys.stderr)
        return None

    # Case number from filename (strip .txt)
    case_number = path.stem.strip()

    # Decision date: meta > infer from case number year > fallback
    if not meta_date:
        # CanLII IDs like "2024onltb12345" or LTB numbers like "TST-12345-23"
        year_m = re.search(r"\b(20\d{2})\b", case_number)
        meta_date = f"{year_m.group(1)}-01-01" if year_m else "2020-01-01"

    # Clause types: meta > infer from body
    clause_types = meta_types or _infer_clause_types(body.lower())

    # URL: meta > construct from case number if it looks like a CanLII ID
    if not meta_url:
        canlii_id_m = re.match(r"^(20\d{2}onltb\d+)$", case_number.lower())
        if canlii_id_m:
            cid = canlii_id_m.group(1)
            meta_url = f"https://www.canlii.org/en/on/onltb/doc/{cid}/{cid}.html"
        else:
            meta_url = "https://www.canlii.org/en/on/onltb/"

    return {
        "case_number":  case_number,
        "decision_date": meta_date,
        "clause_types": clause_types,
        "url":          meta_url,
        "body":         body,
    }


# ---------------------------------------------------------------------------
# Analysis extraction (same logic as seed_decisions.py)
# ---------------------------------------------------------------------------

_ANALYSIS_PATTERN = re.compile(
    r"^(analysis|reasons?(\s+for\s+(decision|order|this\s+decision))?"
    r"|findings?(\s+and\s+analysis)?"
    r"|analysis\s+and\s+reasons?"
    r"|determination|reasons?\s+and\s+analysis)$",
    re.IGNORECASE,
)
_STOP_HEADERS = re.compile(
    r"^(order|it\s+is\s+ordered|summary\s+of\s+order|schedule|appendix|background"
    r"|introduction|issue|issues?\s+to\s+be\s+determined)$",
    re.IGNORECASE,
)


def extract_analysis_from_text(body: str) -> tuple[str, str]:
    """
    For plain text (not HTML), find the analysis section by heading line.
    Falls back to middle portion of the text if no heading found.
    Returns (ruling_summary, relevant_principle).
    """
    lines = body.splitlines()
    in_analysis = False
    analysis_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if in_analysis and analysis_lines:
                analysis_lines.append("")  # preserve paragraph breaks
            continue

        # Check if this line is a section heading (short, possibly all-caps)
        is_heading = len(stripped) < 80 and (stripped.isupper() or not stripped.endswith(","))
        heading_clean = stripped.rstrip(".").strip()

        if is_heading and _ANALYSIS_PATTERN.match(heading_clean):
            in_analysis = True
            continue
        elif in_analysis and is_heading and _STOP_HEADERS.match(heading_clean):
            break
        elif in_analysis:
            analysis_lines.append(stripped)

    # Fallback: use lines 20–60% through the document (skip header/preamble/order sections)
    if not analysis_lines:
        start = max(0, len(lines) // 5)
        end   = min(len(lines), (len(lines) * 4) // 5)
        analysis_lines = [l.strip() for l in lines[start:end] if l.strip()]

    combined = " ".join(l for l in analysis_lines if l)
    if len(combined) > 2000:
        combined = combined[:2000].rsplit(" ", 1)[0]
    ruling_summary = combined

    sentences = re.split(r"(?<=[.!?])\s+", ruling_summary)
    relevant_principle = sentences[0] if sentences else ruling_summary[:300]
    for sent in sentences[:10]:
        if re.search(r"section\s+\d+|s\.\s*\d+|\bRTA\b|\bAct\b|subsection", sent, re.IGNORECASE):
            relevant_principle = sent
            break

    return ruling_summary, relevant_principle[:500]


# ---------------------------------------------------------------------------
# Outcome inference
# ---------------------------------------------------------------------------


def infer_outcome(text_lower: str, case_number: str) -> str:
    prefix = (case_number.split("-")[0] if "-" in case_number else case_number[:3]).upper()
    is_tenant_app   = prefix.startswith("T")
    is_landlord_app = prefix.startswith("L")

    granted   = bool(re.search(r"application\s+is\s+granted|is\s+granted\b", text_lower))
    dismissed = bool(re.search(r"application\s+is\s+dismissed|is\s+dismissed\b", text_lower))

    landlord_pays = bool(re.search(r"landlord\s+shall\s+pay|landlord\s+must\s+pay|ordered\s+to\s+pay\s+the\s+tenant", text_lower))
    tenant_pays   = bool(re.search(r"tenant\s+shall\s+pay|tenant\s+must\s+pay|ordered\s+to\s+pay\s+the\s+landlord", text_lower))

    if landlord_pays and not tenant_pays: return "tenant_favour"
    if tenant_pays and not landlord_pays: return "landlord_favour"
    if is_tenant_app:
        if granted:   return "tenant_favour"
        if dismissed: return "landlord_favour"
    if is_landlord_app:
        if granted:   return "landlord_favour"
        if dismissed: return "tenant_favour"
    return "mixed"


# ---------------------------------------------------------------------------
# PII stripping
# ---------------------------------------------------------------------------

_nlp = None

def _get_nlp():
    global _nlp
    if _nlp is None:
        try:
            import spacy
            _nlp = spacy.load("en_core_web_sm")
        except Exception as e:
            print(f"[warn] spaCy unavailable ({e}) — regex-only PII stripping.", file=sys.stderr)
            _nlp = False
    return _nlp


def strip_pii(text: str) -> str:
    nlp = _get_nlp()
    if nlp:
        doc = nlp(text[:5000])
        result = text
        for ent in reversed(doc.ents):
            if ent.label_ in {"PERSON", "FAC"}:
                result = result[:ent.start_char] + f"[{ent.label_}]" + result[ent.end_char:]
        text = result
    text = re.sub(
        r"\b\d{1,5}\s+\w[\w\s]{2,25}"
        r"(?:Street|St|Avenue|Ave|Drive|Dr|Road|Rd|Boulevard|Blvd|Lane|Ln"
        r"|Court|Ct|Way|Place|Pl|Crescent|Cres|Circle|Cir)\b[.,]?",
        "[ADDRESS]", text, flags=re.IGNORECASE,
    )
    text = re.sub(r"\b(?:Unit|Apt|Apartment|Suite|#)\s*\d+[A-Za-z]?\b", "[UNIT]", text, flags=re.IGNORECASE)
    return text


# ---------------------------------------------------------------------------
# Gemini embedding — REST only, never SDK
# ---------------------------------------------------------------------------


def _with_retry(fn, max_attempts=3, base_delay=2.0):
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except Exception as e:
            if attempt == max_attempts: raise
            delay = base_delay ** attempt
            print(f"[retry {attempt}/{max_attempts}] {e}. Sleeping {delay:.0f}s...", file=sys.stderr)
            time.sleep(delay)


def _embed_text(text: str) -> list[float]:
    def _call():
        resp = requests.post(
            _GEMINI_EMBED_URL,
            params={"key": GEMINI_API_KEY},
            json={
                "content": {"parts": [{"text": text}]},
                "taskType": "RETRIEVAL_DOCUMENT",
                "outputDimensionality": 768,
            },
            timeout=30, verify=certifi.where(),
        )
        if resp.status_code == 429:
            print("[rate-limit] Gemini 429 — sleeping 60s...", file=sys.stderr)
            time.sleep(60)
            resp.raise_for_status()
        resp.raise_for_status()
        return resp.json()["embedding"]["values"]
    return _with_retry(_call)


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------


def _get_supabase_client():
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _decision_exists(client, case_number: str) -> bool:
    try:
        resp = client.table("tribunal_decisions").select("id").eq("case_number", case_number).limit(1).execute()
        return len(resp.data) > 0
    except Exception:
        return False


def _upsert_decision(client, row: dict) -> None:
    client.table("tribunal_decisions").upsert(row, on_conflict="case_number").execute()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Seed LTB decisions from manually copied text files.")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to DB")
    parser.add_argument("--dir", default=str(DECISIONS_DIR), help="Directory containing .txt files")
    args = parser.parse_args()

    decisions_dir = Path(args.dir)

    missing = [v for v in ("GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if not os.environ.get(v)]
    if missing:
        print(f"[error] Missing env vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    if not decisions_dir.exists():
        decisions_dir.mkdir(parents=True, exist_ok=True)
        print(f"[created] {decisions_dir}", file=sys.stderr)
        print(f"[info] Add .txt files to that folder, then re-run this script.", file=sys.stderr)
        print(f"[info] See the docstring at the top of this file for instructions.", file=sys.stderr)
        return

    txt_files = sorted(decisions_dir.glob("*.txt"))
    if not txt_files:
        print(f"[info] No .txt files found in {decisions_dir}", file=sys.stderr)
        print(f"[info] Copy LTB decision text from canlii.org, save as <CaseNumber>.txt", file=sys.stderr)
        return

    print(f"[init] Found {len(txt_files)} .txt file(s) in {decisions_dir}", file=sys.stderr)

    client = None
    if not args.dry_run:
        try:
            client = _get_supabase_client()
        except Exception as e:
            print(f"[error] Supabase: {e}", file=sys.stderr)
            sys.exit(1)

    inserted = skipped = errors = 0

    for path in txt_files:
        print(f"\n[read] {path.name}", file=sys.stderr)

        parsed = parse_decision_file(path)
        if parsed is None:
            errors += 1
            continue

        case_number = parsed["case_number"]

        if not args.dry_run and _decision_exists(client, case_number):
            print(f"  [skip] {case_number} — already in DB", file=sys.stderr)
            skipped += 1
            continue

        # Extract analysis, strip PII
        ruling_summary, relevant_principle = extract_analysis_from_text(parsed["body"])
        if not ruling_summary or len(ruling_summary) < 100:
            print(f"  [skip] {case_number} — analysis too short", file=sys.stderr)
            skipped += 1
            continue

        ruling_summary     = strip_pii(ruling_summary)
        relevant_principle = strip_pii(relevant_principle) or ruling_summary[:300]
        outcome            = infer_outcome(ruling_summary.lower(), case_number)

        print(f"  case_number   : {case_number}", file=sys.stderr)
        print(f"  decision_date : {parsed['decision_date']}", file=sys.stderr)
        print(f"  clause_types  : {parsed['clause_types']}", file=sys.stderr)
        print(f"  outcome       : {outcome}", file=sys.stderr)
        print(f"  ruling chars  : {len(ruling_summary)}", file=sys.stderr)
        print(f"  principle     : {relevant_principle[:80]!r}...", file=sys.stderr)

        if args.dry_run:
            inserted += 1
            continue

        print(f"  [embed] ...", file=sys.stderr)
        time.sleep(0.5)
        try:
            embedding = _embed_text(ruling_summary)
        except Exception as e:
            print(f"  [error] Embed failed: {e}", file=sys.stderr)
            errors += 1
            continue

        row = {
            "jurisdiction_code":    JURISDICTION_CODE,
            "tribunal":             CANLII_TRIBUNAL_NAME,
            "case_number":          case_number,
            "decision_date":        parsed["decision_date"],
            "ruling_summary":       ruling_summary,
            "outcome":              outcome,
            "relevant_principle":   relevant_principle,
            "relevant_clause_types": parsed["clause_types"],
            "url":                  parsed["url"],
            "embedding":            embedding,
            "embedded_at":          datetime.now(timezone.utc).isoformat(),
            "corpus_version":       CORPUS_VERSION,
        }

        try:
            _upsert_decision(client, row)
            print(f"  [ok] {case_number} inserted", file=sys.stderr)
            inserted += 1
        except Exception as e:
            print(f"  [error] DB upsert: {e}", file=sys.stderr)
            errors += 1

    print(f"\n{'='*50}", file=sys.stderr)
    print(f"Inserted={inserted}  Skipped={skipped}  Errors={errors}", file=sys.stderr)
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
