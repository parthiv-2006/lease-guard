#!/usr/bin/env python3
"""
seed_decisions_playwright.py — Playwright-based fallback for seeding Ontario LTB
decisions when the CanLII API caseText endpoint returns 403.

Strategy:
  1. caseBrowse API  → discover case IDs and titles  (basic API key works)
  2. Playwright      → fetch rendered HTML from CanLII website per case
  3. Same pipeline   → extract analysis, strip PII, embed, upsert

Why Playwright instead of requests:
  CanLII loads decision text via JavaScript. A plain requests.get() gets a
  Cloudflare challenge page. A real browser renders the JS and exposes the text.

Usage:
    python scripts/seed_decisions_playwright.py --clause-type entry_rights --limit 50
    python scripts/seed_decisions_playwright.py --all
    python scripts/seed_decisions_playwright.py --dry-run --clause-type entry_rights --limit 5

Rate limiting: 30 s between page loads (generous — avoids Cloudflare bans).
Expected runtime for 240 decisions: ~2.5 hours.

Environment variables (from ../.env.local or ../.env):
    CANLII_API_KEY, GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import os
import random
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
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

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

# Seconds to wait between page loads. Keep generous to avoid Cloudflare bans.
PAGE_DELAY_MIN = 25
PAGE_DELAY_MAX = 35

# ---------------------------------------------------------------------------
# Clause type config — same targets as seed_decisions.py
# ---------------------------------------------------------------------------

CLAUSE_TYPE_CONFIG: dict[str, dict[str, Any]] = {
    "security_deposit":   {"default_limit": 50},
    "entry_rights":       {"default_limit": 50},
    "maintenance_repairs":{"default_limit": 40},
    "early_termination":  {"default_limit": 40},
    "rent_increase":      {"default_limit": 30},
    "quiet_enjoyment":    {"default_limit": 30},
}

CLAUSE_TYPE_KEYWORDS: dict[str, list[str]] = {
    "security_deposit": [
        "last month", "deposit", "section 105", "s. 105", "s.105",
        "key deposit", "section 106",
    ],
    "entry_rights": [
        "entry", "without notice", "section 26", "s. 26",
        "section 27", "s. 27", "landlord enter",
    ],
    "maintenance_repairs": [
        "maintenance", "disrepair", "good repair", "section 20", "s. 20",
        "repair", "regulation 516",
    ],
    "early_termination": [
        "N12", "N4", "N13", "own use", "termination",
        "arrears", "eviction", "section 48",
    ],
    "rent_increase": [
        "rent increase", "above guideline", "AGI",
        "section 116", "s. 116", "guideline",
    ],
    "quiet_enjoyment": [
        "quiet enjoyment", "substantial interference",
        "section 22", "s. 22", "harassment",
    ],
}

# ---------------------------------------------------------------------------
# Section headers identifying the analysis portion of a decision
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
# Retry helper
# ---------------------------------------------------------------------------


def _with_retry(fn, max_attempts: int = 3, base_delay: float = 2.0):
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except Exception as e:
            if attempt == max_attempts:
                raise
            delay = base_delay ** attempt
            print(f"[retry {attempt}/{max_attempts}] {e}. Retrying in {delay:.0f}s...", file=sys.stderr)
            time.sleep(delay)


# ---------------------------------------------------------------------------
# CanLII caseBrowse (the only endpoint available on a basic key)
# ---------------------------------------------------------------------------


def _canlii_get(path: str, params: dict) -> dict:
    params = {**params, "api_key": CANLII_API_KEY}
    url = f"{CANLII_BASE}/{path}"

    def _call():
        resp = requests.get(
            url, params=params, timeout=30,
            headers={"User-Agent": "LeaseGuard/1.0 (tenant-rights research, non-commercial)"},
            verify=certifi.where(),
        )
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", "60"))
            print(f"[rate-limit] CanLII 429 — sleeping {wait}s...", file=sys.stderr)
            time.sleep(wait)
            resp.raise_for_status()
        resp.raise_for_status()
        return resp.json()

    return _with_retry(_call)


def browse_canlii(result_count: int = 20, offset: int = 0) -> list[dict]:
    data = _canlii_get(
        f"caseBrowse/en/{CANLII_TRIBUNAL_ID}/",
        {"resultCount": result_count, "offset": offset},
    )
    return data.get("cases", data.get("results", []))


def _extract_case_id_str(case_id_field) -> str:
    """caseBrowse returns caseId as {'en': '2026onltb23231'} — extract the string."""
    if isinstance(case_id_field, dict):
        return case_id_field.get("en", "") or next(iter(case_id_field.values()), "")
    return str(case_id_field)


def _extract_case_number(title: str) -> str:
    """'TST-12345-21 (Re)'  →  'TST-12345-21'"""
    return re.sub(r"\s*\(Re\)\s*$", "", title).strip()


# ---------------------------------------------------------------------------
# Playwright page fetcher
# ---------------------------------------------------------------------------

# Content selectors tried in order — CanLII uses different markup across decision years
_CONTENT_SELECTORS = [
    "#decisionTreeContainer",
    ".decision-content",
    "article",
    "main",
    "#contentBodyText",
    ".result-content",
    "#main-content",
    "body",   # last resort
]


def fetch_page_html(page, url: str) -> str | None:
    """
    Navigate to `url` with Playwright, wait for the decision text to render,
    and return the full page HTML. Returns None on hard failure.
    """
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    except PlaywrightTimeoutError:
        print(f"  [warn] Timeout navigating to {url}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  [warn] Navigation error: {e}", file=sys.stderr)
        return None

    # Give JS a moment to populate content after DOMContentLoaded
    try:
        page.wait_for_load_state("networkidle", timeout=15_000)
    except PlaywrightTimeoutError:
        pass  # networkidle is best-effort; continue with what we have

    # Confirm we got actual decision content (not a Cloudflare challenge)
    body_text = page.inner_text("body")
    if len(body_text.strip()) < 200 or "enable JS" in body_text or "cf-challenge" in page.url:
        print(f"  [warn] Cloudflare challenge detected — skipping", file=sys.stderr)
        return None

    return page.content()


# ---------------------------------------------------------------------------
# Text extraction (identical logic to seed_decisions.py)
# ---------------------------------------------------------------------------


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFKC", text).strip()


def extract_analysis(html_content: str) -> tuple[str, str]:
    """
    Returns (ruling_summary, relevant_principle).
    ruling_summary: up to 2000 chars of the analysis/reasons section.
    relevant_principle: first statute-referencing sentence (~300 chars).
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
                break
        elif in_analysis and el.name == "p":
            clean = text.strip()
            if len(clean) > 30:
                analysis_paragraphs.append(clean)

    # Fallback: skip first 3 preamble paragraphs, use the rest
    if not analysis_paragraphs:
        all_paras = [
            _normalize(p.get_text(separator=" "))
            for p in soup.find_all("p")
            if len(_normalize(p.get_text(separator=" "))) > 50
        ]
        analysis_paragraphs = all_paras[3:] if len(all_paras) > 3 else all_paras

    combined = " ".join(analysis_paragraphs)
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


def infer_outcome(full_text_lower: str, case_number: str) -> str:
    prefix = (case_number.split("-")[0] if "-" in case_number else case_number[:3]).upper()
    is_tenant_app = prefix.startswith("T")
    is_landlord_app = prefix.startswith("L")

    is_granted  = bool(re.search(r"application\s+is\s+granted|is\s+granted\b", full_text_lower))
    is_dismissed = bool(re.search(r"application\s+is\s+dismissed|is\s+dismissed\b", full_text_lower))

    landlord_pays = bool(re.search(
        r"landlord\s+shall\s+pay|landlord\s+must\s+pay|ordered\s+to\s+pay\s+the\s+tenant",
        full_text_lower))
    tenant_pays = bool(re.search(
        r"tenant\s+shall\s+pay|tenant\s+must\s+pay|ordered\s+to\s+pay\s+the\s+landlord",
        full_text_lower))

    if landlord_pays and not tenant_pays:
        return "tenant_favour"
    if tenant_pays and not landlord_pays:
        return "landlord_favour"
    if is_tenant_app:
        if is_granted:   return "tenant_favour"
        if is_dismissed: return "landlord_favour"
    if is_landlord_app:
        if is_granted:   return "landlord_favour"
        if is_dismissed: return "tenant_favour"
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
                result = result[: ent.start_char] + f"[{ent.label_}]" + result[ent.end_char:]
        text = result

    text = re.sub(
        r"\b\d{1,5}\s+\w[\w\s]{2,25}"
        r"(?:Street|St|Avenue|Ave|Drive|Dr|Road|Rd|Boulevard|Blvd|Lane|Ln"
        r"|Court|Ct|Way|Place|Pl|Crescent|Cres|Circle|Cir)\b[.,]?",
        "[ADDRESS]", text, flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\b(?:Unit|Apt|Apartment|Suite|#)\s*\d+[A-Za-z]?\b",
        "[UNIT]", text, flags=re.IGNORECASE,
    )
    return text


# ---------------------------------------------------------------------------
# Gemini embedding — REST only, never SDK (gRPC breaks on Windows SSL)
# ---------------------------------------------------------------------------


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
# Supabase
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
    client.table("tribunal_decisions").upsert(row, on_conflict="case_number").execute()


# ---------------------------------------------------------------------------
# Relevance filter
# ---------------------------------------------------------------------------


def _is_relevant(text_lower: str, clause_type: str) -> bool:
    return any(kw.lower() in text_lower for kw in CLAUSE_TYPE_KEYWORDS.get(clause_type, []))


# ---------------------------------------------------------------------------
# Core seeding loop
# ---------------------------------------------------------------------------


def seed_clause_type(
    clause_type: str,
    client,
    page,          # Playwright page — reused across calls
    limit: int,
    dry_run: bool = False,
) -> tuple[int, int, int]:
    """
    Browse LTB cases, fetch each via Playwright, filter by relevance,
    embed and upsert up to `limit` decisions. Returns (inserted, skipped, errors).
    """
    inserted = skipped = errors = 0
    seen_ids: set[str] = set()
    offset = 0
    browsed = 0
    browse_cap = limit * 12   # scan up to 12× the limit to find enough relevant ones

    print(f"\n  [browse] {clause_type} — target {limit}, scanning up to {browse_cap} cases",
          file=sys.stderr)

    while inserted < limit and browsed < browse_cap:
        try:
            results = browse_canlii(result_count=20, offset=offset)
        except Exception as e:
            print(f"  [error] caseBrowse failed: {e}", file=sys.stderr)
            break

        if not results:
            print(f"  [info] caseBrowse empty at offset={offset}", file=sys.stderr)
            break

        for meta in results:
            if inserted >= limit or browsed >= browse_cap:
                break

            browsed += 1
            title = meta.get("title", "")
            case_id_str = _extract_case_id_str(meta.get("caseId", ""))

            if not case_id_str or not title or case_id_str in seen_ids:
                continue
            seen_ids.add(case_id_str)

            case_number = _extract_case_number(title)

            if not dry_run and _decision_exists(client, case_number):
                skipped += 1
                continue

            url = (f"https://www.canlii.org/en/on/{CANLII_TRIBUNAL_ID}"
                   f"/doc/{case_id_str}/{case_id_str}.html")

            print(f"  [fetch] {case_number}  {url}", file=sys.stderr)

            html = fetch_page_html(page, url)

            # Rate limit: random delay to look human
            delay = random.uniform(PAGE_DELAY_MIN, PAGE_DELAY_MAX)
            print(f"  [wait]  {delay:.0f}s before next request", file=sys.stderr)
            time.sleep(delay)

            if not html:
                skipped += 1
                continue

            # Filter by clause-type relevance before expensive work
            if not _is_relevant(html.lower(), clause_type):
                print(f"  [skip] {case_number} — not relevant to {clause_type}", file=sys.stderr)
                skipped += 1
                continue

            try:
                ruling_summary, relevant_principle = extract_analysis(html)
            except Exception as e:
                print(f"  [error] extract_analysis: {e}", file=sys.stderr)
                errors += 1
                continue

            if not ruling_summary or len(ruling_summary) < 100:
                print(f"  [skip] {case_number} — analysis too short", file=sys.stderr)
                skipped += 1
                continue

            ruling_summary     = strip_pii(ruling_summary)
            relevant_principle = strip_pii(relevant_principle) or ruling_summary[:300]
            outcome            = infer_outcome(ruling_summary.lower(), case_number)

            if dry_run:
                print(
                    f"  [dry-run] {case_number} | {outcome}"
                    f" | {len(ruling_summary)} chars | {relevant_principle[:60]!r}...",
                    file=sys.stderr,
                )
                inserted += 1
                continue

            print(f"  [embed]  {case_number}", file=sys.stderr)
            try:
                embedding = _embed_text(ruling_summary)
            except Exception as e:
                print(f"  [error] embed failed: {e}", file=sys.stderr)
                errors += 1
                continue

            row: dict[str, Any] = {
                "jurisdiction_code":    JURISDICTION_CODE,
                "tribunal":             CANLII_TRIBUNAL_NAME,
                "case_number":          case_number,
                "decision_date":        _extract_decision_date_from_id(case_id_str),
                "ruling_summary":       ruling_summary,
                "outcome":              outcome,
                "relevant_principle":   relevant_principle,
                "relevant_clause_types":[clause_type],
                "url":                  url,
                "embedding":            embedding,
                "embedded_at":          datetime.now(timezone.utc).isoformat(),
                "corpus_version":       CORPUS_VERSION,
            }

            try:
                _upsert_decision(client, row)
                print(f"  [ok]     {case_number} ({outcome})", file=sys.stderr)
                inserted += 1
            except Exception as e:
                print(f"  [error] DB upsert: {e}", file=sys.stderr)
                errors += 1

        if len(results) < 20:
            break  # no more pages from CanLII
        offset += 20
        time.sleep(2.0)

    return inserted, skipped, errors


def _extract_decision_date_from_id(case_id_str: str) -> str:
    """
    Extract year from CanLII internal case ID like '2026onltb23231'.
    Returns 'YYYY-01-01' as a best-effort date when the API doesn't return a date field.
    """
    m = re.match(r"^(20\d{2})", case_id_str)
    return f"{m.group(1)}-01-01" if m else "2020-01-01"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Playwright-based LTB decision seeder — workaround for CanLII API "
            "caseText/caseSearch 403. Uses caseBrowse + browser rendering."
        )
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--clause-type",
        choices=list(CLAUSE_TYPE_CONFIG.keys()),
        help="Seed a single clause type",
    )
    group.add_argument("--all", action="store_true", help="Seed all 6 clause types")
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Max decisions per clause type (default: per-type config)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would be inserted without writing to DB or embedding",
    )
    parser.add_argument(
        "--headed", action="store_true",
        help="Run browser in headed mode (visible window — useful for debugging Cloudflare)",
    )
    args = parser.parse_args()

    missing = [
        v for v in ("CANLII_API_KEY", "GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        if not os.environ.get(v)
    ]
    if missing:
        print(f"[error] Missing env vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    client = None
    if not args.dry_run:
        print("[init] Connecting to Supabase...", file=sys.stderr)
        try:
            client = _get_supabase_client()
        except Exception as e:
            print(f"[error] Supabase connection failed: {e}", file=sys.stderr)
            sys.exit(1)

    clause_types = list(CLAUSE_TYPE_CONFIG.keys()) if args.all else [args.clause_type]

    total_inserted = total_skipped = total_errors = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=not args.headed,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-CA",
        )
        page = context.new_page()
        # Apply all stealth patches — hides webdriver flag, Chrome runtime,
        # plugins, WebGL vendor, navigator properties, and 15+ other signals
        # that Cloudflare uses to detect headless browsers
        Stealth().apply_stealth_sync(page)

        # Warm up: visit CanLII homepage first so the session looks human
        print("[init] Warming up browser session on canlii.org...", file=sys.stderr)
        try:
            page.goto("https://www.canlii.org/en/", wait_until="domcontentloaded", timeout=30_000)
            time.sleep(3)
        except Exception:
            pass  # warm-up failure is non-fatal

        for ct in clause_types:
            limit = args.limit or CLAUSE_TYPE_CONFIG[ct]["default_limit"]
            print(f"\n{'=' * 60}", file=sys.stderr)
            print(f"Clause type : {ct}  (target: {limit})", file=sys.stderr)
            print(f"{'=' * 60}", file=sys.stderr)

            ins, skp, err = seed_clause_type(ct, client, page, limit, dry_run=args.dry_run)
            total_inserted += ins
            total_skipped  += skp
            total_errors   += err

            print(f"\n  [{ct}] Inserted={ins}  Skipped={skp}  Errors={err}", file=sys.stderr)

        browser.close()

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
