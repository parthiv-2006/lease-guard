#!/usr/bin/env python3
"""
build_corpus.py - Scrape Ontario's RTA and embed into Supabase pgvector.

Usage:
    python scripts/build_corpus.py

Environment variables (loaded from ../.env):
    GEMINI_API_KEY
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
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
truststore.inject_into_ssl()  # patches Python ssl module (requests/httpx)
# gRPC uses BoringSSL — a separate TLS stack that ignores truststore.
# This env var points gRPC at the certifi CA bundle before gRPC initializes.
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load environment
# ---------------------------------------------------------------------------

_project_root = Path(__file__).parent.parent
load_dotenv(dotenv_path=_project_root / ".env.local")  # preferred
load_dotenv(dotenv_path=_project_root / ".env")        # fallback

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

CORPUS_VERSION = date.today().isoformat()  # e.g. "2026-05-14"

# ontario.ca now requires JavaScript (SPA). The Wayback Machine snapshot from
# 2022-01-01 has the full static HTML and is the last known good version of the
# pre-redesign page. The canonical URL is stored in the DB for citation purposes.
RTA_URL = "https://www.ontario.ca/laws/statute/06r17"
RTA_FETCH_URL = "https://web.archive.org/web/20220101120457/https://www.ontario.ca/laws/statute/06r17"

JURISDICTION_CODE = "ON"
ACT_NAME = "Residential Tenancies Act, 2006"

# ---------------------------------------------------------------------------
# Section → ClauseType mapping
# ---------------------------------------------------------------------------

VALID_CLAUSE_TYPES: frozenset[str] = frozenset({
    "rent_payment", "rent_increase", "security_deposit", "entry_rights",
    "maintenance_repairs", "subletting_assignment", "early_termination",
    "renewal_terms", "utilities", "pets", "alterations", "quiet_enjoyment",
    "liability_indemnification", "dispute_resolution", "parking_storage",
    "guest_policy", "standard_boilerplate", "unknown",
})

SECTION_CLAUSE_MAP: dict[str, str] = {
    "12": "rent_payment",
    "20": "maintenance_repairs",
    "22": "quiet_enjoyment",
    "27": "entry_rights",
    "29": "alterations",
    # 42-58 → renewal_terms / early_termination
    **{str(s): "renewal_terms" for s in range(42, 59)},
    # 59-84 → early_termination
    **{str(s): "early_termination" for s in range(59, 85)},
    "95": "subletting_assignment",
    "97": "subletting_assignment",
    "105": "security_deposit",
    "106": "security_deposit",
    "107": "security_deposit",
    # 116-120 → rent_increase
    **{str(s): "rent_increase" for s in range(116, 121)},
}


# ---------------------------------------------------------------------------
# Retry / backoff helper
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
                f"[retry {attempt}/{max_attempts}] Error: {e}. Retrying in {delay:.0f}s...",
                file=sys.stderr,
            )
            time.sleep(delay)


# ---------------------------------------------------------------------------
# Step 1: Scrape RTA
# ---------------------------------------------------------------------------

def _fetch_html(url: str) -> str:
    """Fetch HTML with retry. Uses a longer timeout for Wayback Machine."""
    def _get():
        resp = requests.get(url, timeout=60, headers={"User-Agent": "LeaseGuard/1.0"}, verify=certifi.where())
        resp.raise_for_status()
        return resp.text

    return _with_retry(_get, max_attempts=3, base_delay=2.0)


def _normalize_text(text: str) -> str:
    """Normalize unicode to UTF-8 compatible form."""
    return unicodedata.normalize("NFKC", text)


def _parse_rta_sections(html: str) -> list[dict[str, Any]]:
    """
    Parse Ontario RTA HTML (Wayback Machine 2022-01-01 snapshot) into sections.

    Structure of the archived page:
      - <p class="section"> — starts each section; text begins with the section
        number immediately followed by the content, e.g. "105(1) A landlord..."
      - <p class="paragraph"> — numbered subsection items within a section
      - <p class="TOCid"> / <p class="table"> — table-of-contents rows that
        give us section titles (parsed separately into toc_titles map)
      - <a name="BK{n}"> — anchors used for deep-linking (preserved as url)
    """
    soup = BeautifulSoup(html, "lxml")

    # Strip Wayback Machine toolbar so its text doesn't pollute sections
    for el in soup.find_all(id=re.compile(r"^wm")):
        el.decompose()

    # ── Build section-number → title map from the TOC ──────────────────────
    # TOC structure: each <tr> has <td><p class="TOCid">N.</p></td>
    #                                   <td><p class="table">Title</p></td>
    toc_titles: dict[str, str] = {}
    for toc_el in soup.find_all("p", class_="TOCid"):
        raw_id = toc_el.get_text(strip=True).rstrip(".")
        # Title is in a <p class="table"> inside the next <td> of the same <tr>
        td = toc_el.parent  # the enclosing <td>
        if td and td.name == "td":
            next_td = td.find_next_sibling("td")
            if next_td:
                title_el = next_td.find("p", class_="table")
                if title_el and raw_id:
                    toc_titles[raw_id] = _normalize_text(title_el.get_text(strip=True))

    # ── Build BK-anchor → section-number map from TOC hrefs ─────────────────
    bk_to_sec: dict[str, str] = {}
    for a in soup.find_all("a", href=re.compile(r"^#BK")):
        title_attr = a.get("title", "")
        m = re.match(r"Section\s+(\d+(?:\.\d+)?)", title_attr)
        if m:
            bk = a["href"].lstrip("#")
            bk_to_sec[bk] = m.group(1)

    # ── Parse section content blocks ─────────────────────────────────────────
    # Section number is always a leading digit sequence in the <p class="section"> text.
    sec_num_re = re.compile(r"^(\d{1,3}(?:\.\d+)?)")
    sections: list[dict[str, Any]] = []
    seen_nums: set[str] = set()

    section_els = soup.find_all("p", class_="section")
    for sec_el in section_els:
        raw_text = _normalize_text(sec_el.get_text(strip=True))
        m = sec_num_re.match(raw_text)
        if not m:
            continue
        sec_num = m.group(1)

        # Collect subsection paragraphs that follow until the next section
        paras: list[str] = [raw_text]
        for sib in sec_el.next_siblings:
            if not hasattr(sib, "name") or sib.name != "p":
                continue
            sib_classes = sib.get("class", [])
            if "section" in sib_classes:
                break
            if "paragraph" in sib_classes or "subsection" in sib_classes:
                t = _normalize_text(sib.get_text(strip=True))
                if t:
                    paras.append(t)

        full_text = " ".join(paras)
        if not full_text:
            continue

        # Find the nearest preceding BK anchor to build a deep-link URL
        bk_anchor = ""
        for prev in sec_el.previous_siblings:
            if hasattr(prev, "name") and prev.name == "a":
                name = prev.get("name", "")
                if name.startswith("BK"):
                    bk_anchor = name
                    break

        url = f"{RTA_URL}#{bk_anchor}" if bk_anchor else RTA_URL
        sec_title = toc_titles.get(sec_num, "")

        # Deduplicate — keep only the first occurrence of each section number
        if sec_num in seen_nums:
            continue
        seen_nums.add(sec_num)

        sections.append(
            {
                "section_number": sec_num,
                "section_title": sec_title,
                "full_text": full_text,
                "url": url,
                "clause_type": SECTION_CLAUSE_MAP.get(sec_num, "general"),
            }
        )

    return sections


# ---------------------------------------------------------------------------
# Step 2: Chunk long sections
# ---------------------------------------------------------------------------

_MAX_CHARS = 2000
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
_SUBSECTION_BOUNDARY = re.compile(r"\(\d+\)")


def _chunk_section(section: dict[str, Any]) -> list[dict[str, Any]]:
    """
    If section.full_text > _MAX_CHARS, split into sub-chunks at subsection
    boundaries (e.g. "(1)", "(2)") or sentence boundaries.
    Each chunk inherits section metadata.
    """
    text = section["full_text"]
    if len(text) <= _MAX_CHARS:
        return [section]

    # Try splitting at subsection boundaries first
    parts = _SUBSECTION_BOUNDARY.split(text)
    # Reattach subsection markers
    markers = _SUBSECTION_BOUNDARY.findall(text)
    reassembled: list[str] = []
    if parts:
        reassembled.append(parts[0])
        for i, marker in enumerate(markers):
            chunk_text = marker + (parts[i + 1] if i + 1 < len(parts) else "")
            reassembled.append(chunk_text)

    # If subsection split didn't help (single big block), split by sentences
    final_chunks: list[str] = []
    for part in reassembled:
        part = part.strip()
        if not part:
            continue
        if len(part) <= _MAX_CHARS:
            final_chunks.append(part)
        else:
            # Split at sentence boundaries
            sentences = _SENTENCE_END.split(part)
            current = ""
            for sentence in sentences:
                if len(current) + len(sentence) + 1 > _MAX_CHARS and current:
                    final_chunks.append(current.strip())
                    current = sentence
                else:
                    current = (current + " " + sentence).strip() if current else sentence
            if current:
                final_chunks.append(current.strip())

    if not final_chunks:
        return [section]

    result = []
    for i, chunk_text in enumerate(final_chunks):
        chunk = dict(section)
        chunk["full_text"] = chunk_text
        chunk["section_number"] = (
            section["section_number"] if i == 0 else f"{section['section_number']}.{i}"
        )
        result.append(chunk)
    return result


# ---------------------------------------------------------------------------
# Step 3: Embed with Gemini
# ---------------------------------------------------------------------------

_GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/gemini-embedding-001:embedContent"
)


def _embed_text(text: str) -> list[float]:
    """
    Embed text using gemini-embedding-001 via REST (not gRPC).

    The google-generativeai SDK uses gRPC which has its own BoringSSL stack
    that ignores truststore on Windows. REST via requests avoids gRPC entirely.
    outputDimensionality=768 keeps vectors compatible with the vector(768) schema.
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
# Step 4: Store in Supabase
# ---------------------------------------------------------------------------

def _get_supabase_client():
    from supabase import create_client

    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _section_exists(client, jurisdiction_code: str, act_name: str, section_number: str) -> bool:
    """Check if a section already exists in the DB."""
    try:
        resp = (
            client.table("statutes")
            .select("id")
            .eq("jurisdiction_code", jurisdiction_code)
            .eq("act_name", act_name)
            .eq("section_number", section_number)
            .limit(1)
            .execute()
        )
        return len(resp.data) > 0
    except Exception:
        return False


def _upsert_section(client, row: dict[str, Any]) -> None:
    """Upsert a section row. Conflict on (jurisdiction_code, act_name, section_number)."""
    client.table("statutes").upsert(
        row,
        on_conflict="jurisdiction_code,act_name,section_number",
    ).execute()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    # Validate env
    missing = [
        v
        for v in ("GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        if not os.environ.get(v)
    ]
    if missing:
        print(f"[error] Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    # Step 1: Fetch RTA (via Wayback Machine — ontario.ca now requires JS)
    print(f"[1/4] Fetching RTA HTML from Wayback Machine...", file=sys.stderr)
    try:
        html = _fetch_html(RTA_FETCH_URL)
    except Exception as e:
        print(f"[error] Failed to fetch RTA: {e}", file=sys.stderr)
        sys.exit(1)

    # Step 2: Parse sections
    print("[2/4] Parsing sections...", file=sys.stderr)
    sections = _parse_rta_sections(html)
    if not sections:
        print("[error] No sections parsed from RTA page. The page structure may have changed.", file=sys.stderr)
        sys.exit(1)
    print(f"       Found {len(sections)} raw sections.", file=sys.stderr)

    # Chunk long sections
    all_chunks: list[dict[str, Any]] = []
    for s in sections:
        all_chunks.extend(_chunk_section(s))
    print(f"       {len(all_chunks)} chunks after splitting long sections.", file=sys.stderr)

    # Step 3: Connect to Supabase
    print("[3/4] Connecting to Supabase...", file=sys.stderr)
    try:
        client = _get_supabase_client()
    except Exception as e:
        print(f"[error] Cannot connect to Supabase: {e}", file=sys.stderr)
        sys.exit(1)

    # Step 4: Embed and store
    print(f"[4/4] Embedding {len(all_chunks)} chunks and storing in Supabase...", file=sys.stderr)

    skipped = 0
    inserted = 0
    errors = 0

    for idx, chunk in enumerate(all_chunks, start=1):
        sec_num = chunk["section_number"]
        sec_title = chunk.get("section_title", "")
        full_text = chunk.get("full_text", "").strip()

        progress_label = f"Section {sec_num}" + (f" - {sec_title[:40]}" if sec_title else "")
        print(f"[{idx}/{len(all_chunks)}] Embedding {progress_label}", file=sys.stderr)

        # Skip empty sections
        if not full_text:
            print(f"       Skipping (no text).", file=sys.stderr)
            skipped += 1
            continue

        # Check if already in DB
        if _section_exists(client, JURISDICTION_CODE, ACT_NAME, sec_num):
            print(f"       Already in DB — skipping.", file=sys.stderr)
            skipped += 1
            continue

        # Embed — 1s pause keeps us at ~60 RPM, safely under free-tier limits
        time.sleep(1.0)
        try:
            embedding = _embed_text(full_text)
        except Exception as e:
            print(f"       [error] Embedding failed: {e}", file=sys.stderr)
            errors += 1
            continue

        # Build row — relevant_clause_types is a clause_type[] enum array
        raw_type = chunk.get("clause_type", "")
        relevant_types = [raw_type] if raw_type in VALID_CLAUSE_TYPES else []

        row: dict[str, Any] = {
            "jurisdiction_code": JURISDICTION_CODE,
            "act_name": ACT_NAME,
            "section_number": sec_num,
            "section_title": sec_title,
            "full_text": full_text,
            "url": chunk.get("url", RTA_URL),
            "relevant_clause_types": relevant_types,
            "embedding": embedding,
            "embedded_at": datetime.now(timezone.utc).isoformat(),
            "corpus_version": CORPUS_VERSION,
        }

        # Store
        try:
            _upsert_section(client, row)
            inserted += 1
        except Exception as e:
            print(f"       [error] DB upsert failed: {e}", file=sys.stderr)
            errors += 1
            continue

        # Rate limiting: 0.5s between calls
        time.sleep(0.5)

    print(
        f"\n[done] Inserted={inserted}, Skipped={skipped}, Errors={errors}",
        file=sys.stderr,
    )

    if errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
