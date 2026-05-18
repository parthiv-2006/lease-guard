#!/usr/bin/env python3
"""
build_regulations.py - Seed Ontario regulations and Standard Form of Lease into Supabase.

Sources:
  1. O. Reg. 516/06 — Maintenance Standards (fetched via Wayback Machine)
  2. O. Reg. 517/06 — Rent Increase (fetched via Wayback Machine)
  3. Ontario Standard Form of Lease PDF (scripts/source-docs/ontario_standard_lease.pdf)

Usage:
    python scripts/build_regulations.py [--source 516 | --source 517 | --source form | --source all]

Environment variables (loaded from ../.env or ../.env.local):
    GEMINI_API_KEY
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import os
import re
import subprocess
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

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

CORPUS_VERSION = date.today().isoformat()
JURISDICTION_CODE = "CA-ON"

# ---------------------------------------------------------------------------
# Source definitions
# ---------------------------------------------------------------------------

SOURCES = {
    "516": {
        "act_name": "O. Reg. 516/06 — Maintenance Standards",
        "canonical_url": "https://www.ontario.ca/laws/regulation/060516",
        "fetch_url": "https://web.archive.org/web/20220101000000*/https://www.ontario.ca/laws/regulation/060516",
        # More reliable snapshot
        "wayback_url": "https://web.archive.org/web/20221001120000/https://www.ontario.ca/laws/regulation/060516",
        "default_clause_type": "maintenance_repairs",
    },
    "517": {
        "act_name": "O. Reg. 517/06 — Rent Increase",
        "canonical_url": "https://www.ontario.ca/laws/regulation/060517",
        "wayback_url": "https://web.archive.org/web/20221001120000/https://www.ontario.ca/laws/regulation/060517",
        "default_clause_type": "rent_increase",
    },
    "form": {
        "act_name": "Ontario Standard Form of Lease",
        "canonical_url": "https://www.ontario.ca/page/residential-tenancy-agreement-standard-lease",
        "pdf_path": _project_root / "scripts" / "source-docs" / "ontario_standard_lease.pdf",
        "default_clause_type": "standard_boilerplate",
    },
}

# Section-level clause type overrides per regulation.
# These are sparse — only entries that differ from the source's default_clause_type.
# For 516/06 everything is maintenance_repairs (same as default) so no overrides needed.
# For 517/06 everything is rent_increase (same as default) so no overrides needed.
REG_SECTION_MAPS: dict[str, dict[str, str]] = {
    "516": {},  # all sections -> default (maintenance_repairs)
    "517": {},  # all sections -> default (rent_increase)
}

# Standard Form of Lease: fixed 17-section structure with known clause types.
STANDARD_FORM_SECTIONS: dict[int, tuple[str, str]] = {
    1:  ("Parties to the Agreement",       "standard_boilerplate"),
    2:  ("Rental Unit",                    "standard_boilerplate"),
    3:  ("Contact Information",            "standard_boilerplate"),
    4:  ("Term of Tenancy Agreement",      "renewal_terms"),
    5:  ("Rent",                           "rent_payment"),
    6:  ("Services and Utilities",         "utilities"),
    7:  ("Rent Discounts",                 "rent_payment"),
    8:  ("Rent Deposit",                   "security_deposit"),
    9:  ("Key Deposit",                    "security_deposit"),
    10: ("Smoking",                        "alterations"),
    11: ("Tenant's Insurance",             "liability_indemnification"),
    12: ("Changes to the Rental Unit",     "alterations"),
    13: ("Maintenance and Repairs",        "maintenance_repairs"),
    14: ("Assignment and Subletting",      "subletting_assignment"),
    15: ("Additional Terms",               "standard_boilerplate"),
    16: ("Changes to this Agreement",      "standard_boilerplate"),
    17: ("Signatures",                     "standard_boilerplate"),
}

# Maps Standard Form headings to clause types
STANDARD_FORM_HEADING_MAP: dict[str, str] = {
    "rent": "rent_payment",
    "payment": "rent_payment",
    "deposit": "security_deposit",
    "last month": "security_deposit",
    "entry": "entry_rights",
    "access": "entry_rights",
    "maintenance": "maintenance_repairs",
    "repair": "maintenance_repairs",
    "termination": "early_termination",
    "notice": "early_termination",
    "subletting": "subletting_assignment",
    "assignment": "subletting_assignment",
    "increase": "rent_increase",
    "utilities": "utilities",
    "pet": "pets",
    "smoking": "alterations",
    "alteration": "alterations",
    "quiet enjoyment": "quiet_enjoyment",
    "parking": "parking_storage",
    "storage": "parking_storage",
}

VALID_CLAUSE_TYPES: frozenset[str] = frozenset({
    "rent_payment", "rent_increase", "security_deposit", "entry_rights",
    "maintenance_repairs", "subletting_assignment", "early_termination",
    "renewal_terms", "utilities", "pets", "alterations", "quiet_enjoyment",
    "liability_indemnification", "dispute_resolution", "parking_storage",
    "guest_policy", "standard_boilerplate", "unknown",
})

# ---------------------------------------------------------------------------
# Shared utilities
# ---------------------------------------------------------------------------

def _normalize_text(text: str) -> str:
    return unicodedata.normalize("NFKC", text)


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


def _fetch_html(url: str) -> str:
    def _get():
        resp = requests.get(
            url, timeout=60,
            headers={"User-Agent": "LeaseGuard/1.0"},
            verify=certifi.where(),
        )
        resp.raise_for_status()
        return resp.text
    return _with_retry(_get)


_GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/gemini-embedding-001:embedContent"
)


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
    return _with_retry(_call)


def _get_supabase_client():
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _section_exists(client, act_name: str, section_number: str) -> bool:
    try:
        resp = (
            client.table("statutes")
            .select("id")
            .eq("jurisdiction_code", JURISDICTION_CODE)
            .eq("act_name", act_name)
            .eq("section_number", section_number)
            .limit(1)
            .execute()
        )
        return len(resp.data) > 0
    except Exception:
        return False


def _upsert_section(client, row: dict[str, Any]) -> None:
    client.table("statutes").upsert(
        row,
        on_conflict="jurisdiction_code,act_name,section_number",
    ).execute()


_MAX_CHARS = 2000
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def _chunk_text(text: str, base_section: str, url: str, act_name: str,
                clause_type: str, section_title: str) -> list[dict[str, Any]]:
    """Split long text into chunks, returning list of section dicts."""
    if len(text) <= _MAX_CHARS:
        return [{
            "section_number": base_section,
            "section_title": section_title,
            "full_text": text,
            "url": url,
            "clause_type": clause_type,
            "act_name": act_name,
        }]

    sentences = _SENTENCE_END.split(text)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if len(current) + len(sentence) + 1 > _MAX_CHARS and current:
            chunks.append(current.strip())
            current = sentence
        else:
            current = (current + " " + sentence).strip() if current else sentence
    if current:
        chunks.append(current.strip())

    result = []
    for i, chunk_text in enumerate(chunks):
        result.append({
            "section_number": base_section if i == 0 else f"{base_section}.{i}",
            "section_title": section_title,
            "full_text": chunk_text,
            "url": url,
            "clause_type": clause_type,
            "act_name": act_name,
        })
    return result


def _embed_and_store(client, sections: list[dict[str, Any]]) -> tuple[int, int, int]:
    """Embed and upsert a list of section dicts. Returns (inserted, skipped, errors)."""
    inserted = skipped = errors = 0
    total = len(sections)

    for idx, sec in enumerate(sections, start=1):
        act_name = sec["act_name"]
        sec_num = sec["section_number"]
        full_text = sec.get("full_text", "").strip()
        clause_type = sec.get("clause_type", "standard_boilerplate")
        section_title = sec.get("section_title", "")

        print(
            f"[{idx}/{total}] {act_name[:35]} § {sec_num}"
            + (f" — {section_title[:30]}" if section_title else ""),
            file=sys.stderr,
        )

        if not full_text:
            print("       Skipping (no text).", file=sys.stderr)
            skipped += 1
            continue

        if _section_exists(client, act_name, sec_num):
            print("       Already in DB — skipping.", file=sys.stderr)
            skipped += 1
            continue

        time.sleep(1.0)
        try:
            embedding = _embed_text(full_text)
        except Exception as e:
            print(f"       [error] Embedding failed: {e}", file=sys.stderr)
            errors += 1
            continue

        relevant_types = [clause_type] if clause_type in VALID_CLAUSE_TYPES else []

        row: dict[str, Any] = {
            "jurisdiction_code": JURISDICTION_CODE,
            "act_name": act_name,
            "section_number": sec_num,
            "section_title": section_title,
            "full_text": full_text,
            "url": sec.get("url", ""),
            "relevant_clause_types": relevant_types,
            "embedding": embedding,
            "embedded_at": datetime.now(timezone.utc).isoformat(),
            "corpus_version": CORPUS_VERSION,
        }

        try:
            _upsert_section(client, row)
            inserted += 1
        except Exception as e:
            print(f"       [error] DB upsert failed: {e}", file=sys.stderr)
            errors += 1
            continue

        time.sleep(0.5)

    return inserted, skipped, errors


# ---------------------------------------------------------------------------
# Source 1 + 2: Ontario Regulations (HTML via Wayback Machine)
# ---------------------------------------------------------------------------

_SEC_NUM_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*[\.\)]?\s*")
_SUBSEC_RE = re.compile(r"^\((\d+)\)")


def _parse_regulation_html(html: str, source: dict[str, Any],
                           source_key: str = "") -> list[dict[str, Any]]:
    """
    Parse an Ontario regulation HTML page into section rows.

    Ontario e-Laws regulation pages use "-e" suffix CSS classes:
      <p class="section-e">   — section openers like "1.(1) ..."
      <p class="subsection-e"> — subsections "(2) ..."
      <p class="paragraph-e">  — list items within a subsection
      <p class="headnote-e">   — section heading/title
    """
    soup = BeautifulSoup(html, "lxml")

    for el in soup.find_all(id=re.compile(r"^wm")):
        el.decompose()

    act_name = source["act_name"]
    canonical_url = source["canonical_url"]
    default_type = source["default_clause_type"]

    sections: list[dict[str, Any]] = []
    seen_nums: set[str] = set()

    # e-Laws regulation pages use <p class="section-e"> for section openers
    section_els = soup.find_all("p", class_="section-e")

    # Build headnote map: section number → title
    # headnote-e elements appear just before their section-e element
    headnote_map: dict[str, str] = {}
    all_els = soup.find_all("p", class_=re.compile(r"^(section-e|headnote-e)$"))
    pending_headnote: str = ""
    for el in all_els:
        cls = el.get("class", [""])[0]
        text = _normalize_text(el.get_text(strip=True))
        if cls == "headnote-e":
            pending_headnote = text
        elif cls == "section-e":
            m = _SEC_NUM_RE.match(text)
            if m and pending_headnote:
                headnote_map[m.group(1)] = pending_headnote
                pending_headnote = ""

    CONTINUATION_CLASSES = {
        "subsection-e", "paragraph-e", "subpara-e",
        "clause-e", "subclause-e", "definition-e",
        "firstdef-e", "defclause-e", "Sdefinition-e",
    }

    for sec_el in section_els:
        raw_text = _normalize_text(sec_el.get_text(strip=True))

        # section-e text starts like "1.(1) ..." or "4. The landlord..."
        # Normalise "1.(1)" → extract base section number "1"
        m = re.match(r"^(\d+(?:\.\d+)?)\s*[.\(]", raw_text)
        if not m:
            m = _SEC_NUM_RE.match(raw_text)
        if not m:
            continue
        sec_num = m.group(1)

        if sec_num in seen_nums:
            continue
        seen_nums.add(sec_num)

        sec_title = headnote_map.get(sec_num, f"Section {sec_num}")
        sec_map = REG_SECTION_MAPS.get(source_key, {})
        clause_type = sec_map.get(sec_num, default_type)

        # Collect all continuation paragraphs until the next section-e
        all_parts: list[str] = [raw_text]
        for sib in sec_el.next_siblings:
            if not hasattr(sib, "name") or sib.name != "p":
                continue
            sib_cls = (sib.get("class", []) or [""])[0]
            if sib_cls == "section-e":
                break  # start of next section
            if sib_cls in CONTINUATION_CLASSES or sib_cls.endswith("-e"):
                t = _normalize_text(sib.get_text(strip=True))
                if t:
                    all_parts.append(t)

        full_text = " ".join(all_parts)
        if full_text:
            for chunk in _chunk_text(
                full_text, sec_num, canonical_url, act_name, clause_type,
                section_title=sec_title,
            ):
                sections.append(chunk)

    return sections


def build_regulation(source_key: str) -> tuple[int, int, int]:
    source = SOURCES[source_key]
    act_name = source["act_name"]
    wayback_url = source["wayback_url"]

    print(f"\n[regulation] Fetching {act_name}...", file=sys.stderr)
    print(f"             URL: {wayback_url}", file=sys.stderr)

    try:
        html = _fetch_html(wayback_url)
    except Exception as e:
        print(f"[error] Failed to fetch {act_name}: {e}", file=sys.stderr)
        # Try a fallback Wayback URL with a different timestamp
        fallback = wayback_url.replace("20221001120000", "20230601120000")
        print(f"[regulation] Retrying with fallback URL: {fallback}", file=sys.stderr)
        try:
            html = _fetch_html(fallback)
        except Exception as e2:
            print(f"[error] Fallback also failed: {e2}", file=sys.stderr)
            return 0, 0, 1

    sections = _parse_regulation_html(html, source, source_key=source_key)
    if not sections:
        print(f"[warn] No sections parsed from {act_name}. HTML structure may differ.", file=sys.stderr)
        print("[warn] Attempting generic text extraction fallback...", file=sys.stderr)
        sections = _fallback_parse(html, source)

    print(f"[regulation] Parsed {len(sections)} sections/chunks from {act_name}.", file=sys.stderr)

    client = _get_supabase_client()
    return _embed_and_store(client, sections)


def _fallback_parse(html: str, source: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Generic fallback parser for regulation pages where class-based parsing fails.
    Extracts any paragraph containing a section-number pattern and groups text
    between consecutive section numbers.
    """
    soup = BeautifulSoup(html, "lxml")
    for el in soup.find_all(id=re.compile(r"^wm")):
        el.decompose()

    act_name = source["act_name"]
    canonical_url = source["canonical_url"]
    default_type = source["default_clause_type"]

    # Get all paragraph text in document order
    all_paras = [
        _normalize_text(p.get_text(strip=True))
        for p in soup.find_all("p")
        if p.get_text(strip=True)
    ]

    sections: list[dict[str, Any]] = []
    current_sec_num: str | None = None
    current_parts: list[str] = []

    def _flush():
        if current_sec_num and current_parts:
            text = " ".join(current_parts)
            clause_type = REG_516_SECTION_MAP.get(current_sec_num, default_type)
            for chunk in _chunk_text(
                text, current_sec_num, canonical_url, act_name, clause_type,
                section_title=f"Section {current_sec_num}",
            ):
                sections.append(chunk)

    for para in all_paras:
        m = _SEC_NUM_RE.match(para)
        if m and re.match(r"^\d+", m.group(1)):
            candidate = m.group(1)
            # Only treat as a new section if it looks like "N." or "N " at start
            if re.match(r"^\d{1,3}(?:\.\d+)?\s*[\.\)]", para):
                _flush()
                current_sec_num = candidate
                current_parts = [para]
                continue
        if current_sec_num is not None:
            current_parts.append(para)

    _flush()
    return sections


# ---------------------------------------------------------------------------
# Source 3: Ontario Standard Form of Lease (PDF)
# ---------------------------------------------------------------------------

# Heading patterns in the Standard Form of Lease that map to clause types
_FORM_HEADING_RE = re.compile(
    r"^\s*(?:section\s+)?([a-z][a-z\s\-/]{2,50})\s*$",
    re.IGNORECASE,
)

# Numbered item pattern: "A.", "1.", "2)", "A)"
_NUMBERED_ITEM_RE = re.compile(r"^\s*(?:[A-Z]\.|[0-9]+[.):])\s+")


def _map_heading_to_clause_type(heading: str) -> str:
    heading_lower = heading.lower()
    for keyword, clause_type in STANDARD_FORM_HEADING_MAP.items():
        if keyword in heading_lower:
            return clause_type
    return "standard_boilerplate"


def _extract_pdf_text(pdf_path: Path) -> str:
    """Use parse_pdf.py subprocess to extract text from the Standard Form PDF."""
    parse_script = _project_root / "scripts" / "parse_pdf.py"
    result = subprocess.run(
        [sys.executable, str(parse_script), str(pdf_path)],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(f"parse_pdf.py failed: {result.stderr[:500]}")

    import json
    data = json.loads(result.stdout)
    return data.get("raw_text", "")


def _parse_standard_form(pdf_path: Path, source: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Parse the Ontario Standard Form of Lease PDF into embeddable sections.

    The Standard Form uses numbered top-level sections 1–17 (e.g. "5. Rent",
    "8. Rent Deposit"). We split on these, map each to a clause_type, and chunk
    long blocks. Sub-items within a section (also numbered "1.", "2." etc.) are
    folded into their parent section's text — they don't trigger a new section.
    """
    act_name = source["act_name"]
    canonical_url = source["canonical_url"]

    print(f"[form] Extracting text from {pdf_path.name}...", file=sys.stderr)
    try:
        raw_text = _extract_pdf_text(pdf_path)
    except Exception as e:
        print(f"[error] PDF extraction failed: {e}", file=sys.stderr)
        return []

    if not raw_text.strip():
        print("[error] No text extracted from Standard Form PDF.", file=sys.stderr)
        return []

    print(f"[form] Extracted {len(raw_text):,} chars. Segmenting into sections...", file=sys.stderr)

    lines = raw_text.splitlines()
    sections: list[dict[str, Any]] = []

    # Use the fixed 17-section structure — the Standard Form never changes.
    # We match lines like "5. Rent" or "13. Maintenance and Repairs" using the
    # known section numbers so OCR sub-items ("1. Last Name") are never mistaken
    # for top-level sections.
    known_nums = set(STANDARD_FORM_SECTIONS.keys())  # {1..17}
    top_section_re = re.compile(r"^(\d{1,2})\.\s+(.+)$")

    current_num: int = 0
    current_heading: str = "preamble"
    current_clause_type: str = "standard_boilerplate"
    current_parts: list[str] = []

    def _flush_section():
        text = " ".join(p for p in current_parts if p.strip())
        if not text.strip():
            return
        label = re.sub(r"[^a-z0-9]+", "_", current_heading.lower().strip())[:40].strip("_")
        sec_num = f"form_{current_num:02d}_{label}" if current_num else f"form_00_{label}"
        for chunk in _chunk_text(
            text, sec_num, canonical_url, act_name, current_clause_type,
            section_title=current_heading,
        ):
            sections.append(chunk)

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        m = top_section_re.match(stripped)
        if m:
            n = int(m.group(1))
            # Only advance if this is a known top-level section number (1-17)
            # and it's the next expected section (prevents sub-item confusion)
            if n in known_nums and n == current_num + 1:
                _flush_section()
                title, clause_type = STANDARD_FORM_SECTIONS[n]
                current_num = n
                current_heading = title
                current_clause_type = clause_type
                current_parts = [stripped]
                continue

        current_parts.append(stripped)

    _flush_section()

    print(f"[form] Produced {len(sections)} section chunks from Standard Form PDF.", file=sys.stderr)
    return sections


def build_standard_form() -> tuple[int, int, int]:
    source = SOURCES["form"]
    pdf_path = source["pdf_path"]

    if not pdf_path.exists():
        print(
            f"[error] Standard Form PDF not found: {pdf_path}\n"
            "        Download it from: https://www.ontario.ca/page/residential-tenancy-agreement-standard-lease\n"
            "        Save as: scripts/source-docs/ontario_standard_lease.pdf",
            file=sys.stderr,
        )
        return 0, 0, 1

    sections = _parse_standard_form(pdf_path, source)
    if not sections:
        return 0, 0, 1

    client = _get_supabase_client()
    return _embed_and_store(client, sections)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed Ontario regulations and Standard Form of Lease into Supabase."
    )
    parser.add_argument(
        "--source",
        choices=["516", "517", "form", "all"],
        default="all",
        help="Which source to seed (default: all)",
    )
    args = parser.parse_args()

    missing = [
        v for v in ("GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        if not os.environ.get(v)
    ]
    if missing:
        print(f"[error] Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    total_inserted = total_skipped = total_errors = 0

    sources_to_run = ["516", "517", "form"] if args.source == "all" else [args.source]

    for src in sources_to_run:
        if src == "form":
            ins, skp, err = build_standard_form()
        else:
            ins, skp, err = build_regulation(src)
        total_inserted += ins
        total_skipped += skp
        total_errors += err
        print(
            f"[{src}] Inserted={ins}, Skipped={skp}, Errors={err}",
            file=sys.stderr,
        )

    print(
        f"\n[done] Total — Inserted={total_inserted}, Skipped={total_skipped}, Errors={total_errors}",
        file=sys.stderr,
    )

    if total_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
