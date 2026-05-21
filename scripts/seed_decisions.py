#!/usr/bin/env python3
"""
seed_decisions.py — Fetch Ontario LTB decisions from the CanLII API, extract
analysis sections, strip PII, embed with Gemini REST (RETRIEVAL_DOCUMENT), and
upsert into the tribunal_decisions Supabase table.

Usage:
    python scripts/seed_decisions.py --clause-type entry_rights --limit 50
    python scripts/seed_decisions.py --clause-type security_deposit --limit 50
    python scripts/seed_decisions.py --all
    python scripts/seed_decisions.py --dry-run --clause-type entry_rights --limit 10

Environment variables (loaded from ../.env.local then ../.env):
    CANLII_API_KEY
    GEMINI_API_KEY
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
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
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

_project_root = Path(__file__).parent.parent
load_dotenv(dotenv_path=_project_root / ".env.local")
load_dotenv(dotenv_path=_project_root / ".env")

CANLII_API_KEY = os.environ.get("CANLII_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

CORPUS_VERSION = date.today().isoformat()
CANLII_BASE = "https://api.canlii.org/v1"
CANLII_TRIBUNAL_ID = "onltb"
CANLII_TRIBUNAL_NAME = "Ontario Landlord and Tenant Board"
JURISDICTION_CODE = "CA-ON"

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
# Search configuration per clause type
# ---------------------------------------------------------------------------

CLAUSE_TYPE_CONFIG: dict[str, dict[str, Any]] = {
    "security_deposit": {
        "queries": [
            "last month rent deposit illegal section 105",
            "non-refundable deposit void RTA",
            "key deposit excess charge section 106",
            "deposit refund obligation landlord",
        ],
        "default_limit": 50,
    },
    "entry_rights": {
        "queries": [
            "entry without notice landlord section 26",
            "landlord access harassment illegal entry",
            "24 hours written notice entry section 27",
            "landlord enter rental unit without permission",
        ],
        "default_limit": 50,
    },
    "maintenance_repairs": {
        "queries": [
            "maintenance disrepair good repair section 20",
            "maintenance standard regulation 516 landlord obligation",
            "landlord repair failure rent abatement",
            "uninhabitable disrepair tenant remedy",
        ],
        "default_limit": 40,
    },
    "early_termination": {
        "queries": [
            "N12 notice own use bad faith eviction",
            "N4 arrears termination notice",
            "N13 renovation demolition eviction",
            "early termination lease notice grounds",
        ],
        "default_limit": 40,
    },
    "rent_increase": {
        "queries": [
            "above guideline rent increase AGI application",
            "section 116 rent increase notice unlawful",
            "unauthorized rent increase void",
        ],
        "default_limit": 30,
    },
    "quiet_enjoyment": {
        "queries": [
            "substantial interference quiet enjoyment section 22",
            "landlord harassment tenant section 23",
            "interference reasonable enjoyment tenant rights",
        ],
        "default_limit": 30,
    },
}

# ---------------------------------------------------------------------------
# Patterns for identifying analysis sections in LTB decision HTML
# ---------------------------------------------------------------------------

_ANALYSIS_PATTERN = re.compile(
    r"^(analysis|reasons?(\s+for\s+(decision|order|this\s+decision))?"
    r"|findings?(\s+and\s+analysis)?"
    r"|analysis\s+and\s+reasons?"
    r"|determination"
    r"|reasons?\s+and\s+analysis"
    r"|reasons?\s+for\s+ruling)$",
    re.IGNORECASE,
)

_STOP_HEADERS = re.compile(
    r"^(order|it\s+is\s+ordered|summary\s+of\s+order"
    r"|schedule|appendix|background|introduction"
    r"|issue|issues?\s+to\s+be\s+determined)$",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Retry / backoff helper (same pattern as build_corpus.py)
# ---------------------------------------------------------------------------


def _with_retry(fn, max_attempts: int = 3, base_delay: float = 2.0):
    """Call fn(), retrying on exception with exponential backoff."""
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except Exception as e:
            if attempt == max_attempts:
                raise
            delay = base_delay ** attempt
            print(
                f"[retry {attempt}/{max_attempts}] {e}. Retrying in {delay:.0f}s...",
                file=sys.stderr,
            )
            time.sleep(delay)


# ---------------------------------------------------------------------------
# CanLII API helpers
# ---------------------------------------------------------------------------


def _canlii_get(path: str, params: dict) -> dict:
    """GET a CanLII API endpoint with API key, retry, and rate-limit handling."""
    params = {**params, "api_key": CANLII_API_KEY}
    url = f"{CANLII_BASE}/{path}"

    def _call():
        resp = requests.get(
            url,
            params=params,
            timeout=30,
            headers={"User-Agent": "LeaseGuard/1.0 (tenant-rights research, non-commercial)"},
            verify=certifi.where(),
        )
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", "60"))
            print(f"[rate-limit] CanLII 429 — sleeping {retry_after}s...", file=sys.stderr)
            time.sleep(retry_after)
            resp.raise_for_status()
        resp.raise_for_status()
        return resp.json()

    return _with_retry(_call)


def browse_canlii(result_count: int = 20, offset: int = 0) -> list[dict]:
    """
    Browse LTB cases using caseBrowse (works with basic API key).
    Returns list of case metadata dicts. caseId is {'en': 'onltb-...'} — an object, not a string.
    caseSearch is a premium endpoint and returns 403 on basic keys — use browse instead.
    """
    data = _canlii_get(
        f"caseBrowse/en/{CANLII_TRIBUNAL_ID}/",
        {"resultCount": result_count, "offset": offset},
    )
    return data.get("cases", data.get("results", []))


def fetch_case_text(case_id_str: str) -> dict | None:
    """
    Fetch full text of a single LTB decision via CanLII API.
    Returns None on 404, raises PermissionError on 403 (key lacks caseText access).

    NOTE: caseText requires elevated API permissions — basic keys return 403.
    Contact CanLII support to request caseText access for your key.
    """
    try:
        return _canlii_get(f"caseText/en/{CANLII_TRIBUNAL_ID}/{case_id_str}/", {})
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            return None
        if e.response is not None and e.response.status_code == 403:
            raise PermissionError(
                "CanLII caseText returned 403 — your API key needs elevated permissions.\n"
                "Contact CanLII support and request caseText + caseSearch access for your key.\n"
                "See docs/HANDOFF.md Known Issue #5 for details."
            )
        raise


# ---------------------------------------------------------------------------
# Text extraction from LTB decision HTML
# ---------------------------------------------------------------------------


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFKC", text).strip()


def extract_analysis(html_content: str) -> tuple[str, str]:
    """
    Parse LTB decision HTML and extract the analysis/reasons section.

    Returns (ruling_summary, relevant_principle):
    - ruling_summary: up to 2000 chars of the analysis section
    - relevant_principle: first sentence referencing a statute, or first sentence (~300 chars)

    PII stripping is done by the caller — this returns raw extracted text.
    """
    soup = BeautifulSoup(html_content, "lxml")

    for el in soup.find_all(["nav", "header", "footer", "script", "style"]):
        el.decompose()

    in_analysis = False
    analysis_paragraphs: list[str] = []

    for el in soup.find_all(["h1", "h2", "h3", "h4", "p"]):
        text = _normalize(el.get_text(separator=" "))
        if not text:
            continue

        if el.name in ("h1", "h2", "h3", "h4"):
            heading = text.rstrip(".")
            if _ANALYSIS_PATTERN.match(heading):
                in_analysis = True
                continue
            elif in_analysis and _STOP_HEADERS.match(heading):
                break
            elif in_analysis and len(heading) < 80 and not re.match(r"^\d+\.", heading):
                # New major heading not in our stop list — stop collecting
                break

        elif in_analysis and el.name == "p":
            clean = text.strip()
            if len(clean) > 30:
                analysis_paragraphs.append(clean)

    # Fallback: if no analysis section found, use paragraphs 4+ (skip preamble)
    if not analysis_paragraphs:
        all_paras = [
            _normalize(p.get_text(separator=" "))
            for p in soup.find_all("p")
            if len(_normalize(p.get_text(separator=" "))) > 50
        ]
        analysis_paragraphs = all_paras[3:] if len(all_paras) > 3 else all_paras

    # Build ruling_summary (max 2000 chars, break at word boundary)
    combined = " ".join(analysis_paragraphs)
    if len(combined) > 2000:
        combined = combined[:2000].rsplit(" ", 1)[0]
    ruling_summary = combined

    # Extract relevant_principle: prefer a sentence referencing a statute
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


def infer_outcome(full_text_lower: str, case_number: str) -> str:
    """
    Infer decision outcome (tenant_favour | landlord_favour | mixed) from
    the decision text and case number prefix.

    LTB prefix conventions:
      T* (TST, TNT, TET, TWT, etc.) = tenant filed the application
      L* (LSL, LNL, LEL, LWL, etc.) = landlord filed the application
    """
    prefix = (case_number.split("-")[0] if "-" in case_number else case_number[:3]).upper()
    is_tenant_app = prefix.startswith("T")
    is_landlord_app = prefix.startswith("L")

    is_granted = bool(re.search(r"application\s+is\s+granted|is\s+granted\b", full_text_lower))
    is_dismissed = bool(re.search(r"application\s+is\s+dismissed|is\s+dismissed\b", full_text_lower))

    landlord_must_pay = bool(
        re.search(
            r"landlord\s+shall\s+pay|landlord\s+must\s+pay|ordered\s+to\s+pay\s+the\s+tenant",
            full_text_lower,
        )
    )
    tenant_must_pay = bool(
        re.search(
            r"tenant\s+shall\s+pay|tenant\s+must\s+pay|ordered\s+to\s+pay\s+the\s+landlord",
            full_text_lower,
        )
    )

    # Explicit payment orders are the clearest signal
    if landlord_must_pay and not tenant_must_pay:
        return "tenant_favour"
    if tenant_must_pay and not landlord_must_pay:
        return "landlord_favour"

    # Application type + granted/dismissed
    if is_tenant_app:
        if is_granted:
            return "tenant_favour"
        if is_dismissed:
            return "landlord_favour"
    if is_landlord_app:
        if is_granted:
            return "landlord_favour"
        if is_dismissed:
            return "tenant_favour"

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
    """
    Replace PERSON and FAC entities + common address patterns with placeholders.
    Keeps legal terms, statute references, and city/province names.
    """
    nlp = _get_nlp()
    if nlp:
        doc = nlp(text[:5000])
        result = text
        for ent in reversed(doc.ents):
            if ent.label_ in {"PERSON", "FAC"}:
                result = result[: ent.start_char] + f"[{ent.label_}]" + result[ent.end_char :]
        text = result

    # Street addresses
    text = re.sub(
        r"\b\d{1,5}\s+\w[\w\s]{2,25}"
        r"(?:Street|St|Avenue|Ave|Drive|Dr|Road|Rd|Boulevard|Blvd|Lane|Ln|Court|Ct|Way|Place|Pl|Crescent|Cres|Circle|Cir)\b[.,]?",
        "[ADDRESS]",
        text,
        flags=re.IGNORECASE,
    )
    # Unit numbers
    text = re.sub(
        r"\b(?:Unit|Apt|Apartment|Suite|#)\s*\d+[A-Za-z]?\b",
        "[UNIT]",
        text,
        flags=re.IGNORECASE,
    )
    return text


# ---------------------------------------------------------------------------
# Gemini embedding (same REST approach as build_corpus.py)
# ---------------------------------------------------------------------------


def _embed_text(text: str) -> list[float]:
    """
    Embed text using gemini-embedding-001 via REST (RETRIEVAL_DOCUMENT task type).
    Never uses the google-generativeai SDK — gRPC breaks on Windows SSL.
    outputDimensionality=768 matches the vector(768) schema column.
    """

    def _call():
        resp = requests.post(
            _GEMINI_EMBED_URL,
            params={"key": GEMINI_API_KEY},
            json={
                "content": {"parts": [{"text": text}]},
                "taskType": "RETRIEVAL_DOCUMENT",
                "outputDimensionality": 768,
            },
            timeout=30,
            verify=certifi.where(),
        )
        if resp.status_code == 429:
            print("[rate-limit] Gemini 429 — sleeping 60s...", file=sys.stderr)
            time.sleep(60)
            resp.raise_for_status()
        resp.raise_for_status()
        return resp.json()["embedding"]["values"]

    return _with_retry(_call, max_attempts=3, base_delay=2.0)


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------


def _get_supabase_client():
    from supabase import create_client

    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _decision_exists(client, case_number: str) -> bool:
    try:
        resp = (
            client.table("tribunal_decisions")
            .select("id")
            .eq("case_number", case_number)
            .limit(1)
            .execute()
        )
        return len(resp.data) > 0
    except Exception:
        return False


def _upsert_decision(client, row: dict[str, Any]) -> None:
    client.table("tribunal_decisions").upsert(
        row,
        on_conflict="case_number",
    ).execute()


# ---------------------------------------------------------------------------
# Case number extraction
# ---------------------------------------------------------------------------


def _extract_case_number(title: str) -> str:
    """
    Extract the LTB file number from a CanLII title string.
    "TST-12345-21 (Re)" → "TST-12345-21"
    "TNT-12345-21 (Re)" → "TNT-12345-21"
    """
    return re.sub(r"\s*\(Re\)\s*$", "", title).strip()


def _extract_decision_date(case_data: dict) -> str:
    """
    Extract ISO date string from CanLII case data, with fallbacks.
    CanLII may use 'decisionDate', 'date', or embed year in 'citation'.
    """
    date_str = case_data.get("decisionDate") or case_data.get("date") or ""
    if date_str and re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        return date_str
    if date_str and re.match(r"^\d{4}$", date_str):
        return f"{date_str}-01-01"

    # Extract year from citation as last resort
    citation = case_data.get("citation", "")
    year_match = re.search(r"\b(20\d{2})\b", citation)
    return f"{year_match.group(1)}-01-01" if year_match else "2020-01-01"


# ---------------------------------------------------------------------------
# Core seeding logic
# ---------------------------------------------------------------------------


def _extract_case_id_str(case_id_field) -> str:
    """
    caseBrowse returns caseId as either a string or {'en': 'onltb-...'} object.
    Always return the string value.
    """
    if isinstance(case_id_field, dict):
        return case_id_field.get("en", "") or next(iter(case_id_field.values()), "")
    return str(case_id_field)


# Keywords used to filter decisions by clause type relevance after fetching text.
# caseBrowse has no search filter, so we browse broadly and filter locally.
CLAUSE_TYPE_KEYWORDS: dict[str, list[str]] = {
    "security_deposit": ["last month", "deposit", "section 105", "s. 105", "s.105", "key deposit", "section 106"],
    "entry_rights": ["entry", "notice", "section 26", "s. 26", "section 27", "s. 27", "without notice", "landlord enter"],
    "maintenance_repairs": ["maintenance", "disrepair", "good repair", "section 20", "s. 20", "repair", "regulation 516"],
    "early_termination": ["N12", "N4", "N13", "own use", "termination", "arrears", "eviction", "section 48"],
    "rent_increase": ["rent increase", "above guideline", "AGI", "section 116", "s. 116", "guideline"],
    "quiet_enjoyment": ["quiet enjoyment", "substantial interference", "section 22", "s. 22", "harassment"],
}


def _is_relevant(text_lower: str, clause_type: str) -> bool:
    """Return True if the decision text is relevant to the clause type."""
    keywords = CLAUSE_TYPE_KEYWORDS.get(clause_type, [])
    return any(kw.lower() in text_lower for kw in keywords)


def seed_clause_type(
    clause_type: str,
    client,
    limit: int,
    dry_run: bool = False,
) -> tuple[int, int, int]:
    """
    Browse LTB cases, fetch full text for each, filter by clause-type relevance,
    and store up to `limit` relevant decisions.

    Uses caseBrowse (available on basic key) rather than caseSearch (premium only).
    Returns (inserted, skipped, errors).
    """
    inserted = skipped = errors = 0
    seen_case_ids: set[str] = set()
    offset = 0
    browsed_total = 0
    # Browse up to 10x the limit to find enough relevant decisions
    browse_cap = limit * 10

    print(f"\n  [browse] {clause_type} — scanning up to {browse_cap} recent decisions", file=sys.stderr)

    while inserted < limit and browsed_total < browse_cap:
        per_page = 20

        try:
            results = browse_canlii(result_count=per_page, offset=offset)
        except Exception as e:
            print(f"  [error] CanLII browse failed: {e}", file=sys.stderr)
            break

        if not results:
            print(f"  [info] caseBrowse returned empty at offset={offset}", file=sys.stderr)
            break

        for case_meta in results:
            if inserted >= limit or browsed_total >= browse_cap:
                break

            browsed_total += 1
            title = case_meta.get("title", "")
            case_id_raw = case_meta.get("caseId", "")
            case_id_str = _extract_case_id_str(case_id_raw)

            if not case_id_str or not title:
                continue
            if case_id_str in seen_case_ids:
                continue
            seen_case_ids.add(case_id_str)

            case_number = _extract_case_number(title)

            # Skip if already in DB
            if not dry_run and _decision_exists(client, case_number):
                skipped += 1
                continue

            print(f"  [fetch] {case_number} ({case_id_str})", file=sys.stderr)
            time.sleep(1.0)  # CanLII: ~1 req/s sustained

            try:
                case_data = fetch_case_text(case_id_str)
            except PermissionError as e:
                # API key lacks caseText access — abort entire run with a clear message
                print(f"\n[BLOCKED] {e}", file=sys.stderr)
                print("  Stopping seed run. Re-run after CanLII grants elevated API access.", file=sys.stderr)
                return inserted, skipped, errors
            except Exception as e:
                print(f"  [error] fetch failed for {case_id_str}: {e}", file=sys.stderr)
                errors += 1
                continue

            if case_data is None:
                print(f"  [skip] {case_number} — 404", file=sys.stderr)
                skipped += 1
                continue

            # Get HTML content (CanLII may use 'content' or 'text')
            html_content = case_data.get("content") or case_data.get("text") or ""
            if not html_content:
                print(f"  [skip] {case_number} — no HTML content", file=sys.stderr)
                skipped += 1
                continue

            # Filter by clause-type relevance before doing any expensive work
            if not _is_relevant(html_content.lower(), clause_type):
                skipped += 1
                continue

            # Extract decision date
            decision_date_str = _extract_decision_date(case_data)

            # Extract analysis section
            try:
                ruling_summary, relevant_principle = extract_analysis(html_content)
            except Exception as e:
                print(f"  [error] extract_analysis failed for {case_number}: {e}", file=sys.stderr)
                errors += 1
                continue

            if not ruling_summary or len(ruling_summary) < 100:
                print(f"  [skip] {case_number} — analysis too short ({len(ruling_summary)} chars)", file=sys.stderr)
                skipped += 1
                continue

            # Strip PII before storing or embedding
            ruling_summary = strip_pii(ruling_summary)
            relevant_principle = strip_pii(relevant_principle)
            if not relevant_principle:
                relevant_principle = ruling_summary[:300]

            # Infer outcome from text
            outcome = infer_outcome(ruling_summary.lower(), case_number)

            # Construct canonical CanLII URL from case ID
            canlii_url = (
                f"https://www.canlii.org/en/on/{CANLII_TRIBUNAL_ID}"
                f"/doc/{case_id_str}/{case_id_str}.html"
            )

            if dry_run:
                print(
                    f"  [dry-run] {case_number} | {decision_date_str} | {outcome}"
                    f" | {len(ruling_summary)} chars | {relevant_principle[:60]!r}...",
                    file=sys.stderr,
                )
                inserted += 1
                continue

            # Embed ruling_summary (RETRIEVAL_DOCUMENT — corpus indexing task type)
            print(f"  [embed]  {case_number}", file=sys.stderr)
            time.sleep(0.5)

            try:
                embedding = _embed_text(ruling_summary)
            except Exception as e:
                print(f"  [error] Embedding failed for {case_number}: {e}", file=sys.stderr)
                errors += 1
                continue

            row: dict[str, Any] = {
                "jurisdiction_code": JURISDICTION_CODE,
                "tribunal": CANLII_TRIBUNAL_NAME,
                "case_number": case_number,
                "decision_date": decision_date_str,
                "ruling_summary": ruling_summary,
                "outcome": outcome,
                "relevant_principle": relevant_principle,
                "relevant_clause_types": [clause_type],
                "url": canlii_url,
                "embedding": embedding,
                "embedded_at": datetime.now(timezone.utc).isoformat(),
                "corpus_version": CORPUS_VERSION,
            }

            try:
                _upsert_decision(client, row)
                print(f"  [ok]     {case_number} inserted ({outcome})", file=sys.stderr)
                inserted += 1
            except Exception as e:
                print(f"  [error] DB upsert failed for {case_number}: {e}", file=sys.stderr)
                errors += 1

        # Advance pagination offset after processing each page
        if len(results) < per_page:
            break  # No more pages from CanLII
        offset += per_page
        time.sleep(1.0)

    return inserted, skipped, errors


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed Ontario LTB decisions from CanLII into Supabase tribunal_decisions."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--clause-type",
        choices=list(CLAUSE_TYPE_CONFIG.keys()),
        help="Seed decisions for a single clause type",
    )
    group.add_argument("--all", action="store_true", help="Seed all 6 clause types")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max decisions to insert per clause type (default: per-type default in CLAUSE_TYPE_CONFIG)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be fetched and inserted without writing to DB",
    )
    args = parser.parse_args()

    # Validate environment
    missing = [
        v
        for v in ("CANLII_API_KEY", "GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        if not os.environ.get(v)
    ]
    if missing:
        print(f"[error] Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    # Connect to Supabase (skip in dry-run)
    client = None
    if not args.dry_run:
        print("[init] Connecting to Supabase...", file=sys.stderr)
        try:
            client = _get_supabase_client()
        except Exception as e:
            print(f"[error] Cannot connect to Supabase: {e}", file=sys.stderr)
            sys.exit(1)

    # Determine which clause types to run
    clause_types = list(CLAUSE_TYPE_CONFIG.keys()) if args.all else [args.clause_type]

    total_inserted = total_skipped = total_errors = 0

    for ct in clause_types:
        limit = args.limit or CLAUSE_TYPE_CONFIG[ct]["default_limit"]
        print(f"\n{'=' * 60}", file=sys.stderr)
        print(f"Clause type : {ct}", file=sys.stderr)
        print(f"Target      : {limit} decisions", file=sys.stderr)
        print(f"{'=' * 60}", file=sys.stderr)

        ins, skp, err = seed_clause_type(ct, client, limit, dry_run=args.dry_run)
        total_inserted += ins
        total_skipped += skp
        total_errors += err

        print(
            f"\n  [{ct}] Inserted={ins}  Skipped={skp}  Errors={err}",
            file=sys.stderr,
        )

    print(f"\n{'=' * 60}", file=sys.stderr)
    print(
        f"TOTAL  Inserted={total_inserted}  Skipped={total_skipped}  Errors={total_errors}",
        file=sys.stderr,
    )
    print(f"{'=' * 60}", file=sys.stderr)

    if total_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
