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
from datetime import date
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load environment
# ---------------------------------------------------------------------------

_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

CORPUS_VERSION = date.today().isoformat()  # e.g. "2026-05-14"
RTA_URL = "https://www.ontario.ca/laws/statute/06r17"
JURISDICTION_CODE = "ON"
ACT_NAME = "Residential Tenancies Act, 2006"

# ---------------------------------------------------------------------------
# Section → ClauseType mapping
# ---------------------------------------------------------------------------

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
    """Fetch HTML with retry."""
    def _get():
        resp = requests.get(url, timeout=30, headers={"User-Agent": "LeaseGuard/1.0"})
        resp.raise_for_status()
        return resp.text

    return _with_retry(_get, max_attempts=3, base_delay=2.0)


def _normalize_text(text: str) -> str:
    """Normalize unicode to UTF-8 compatible form."""
    return unicodedata.normalize("NFKC", text)


def _parse_rta_sections(html: str) -> list[dict[str, Any]]:
    """
    Parse Ontario RTA HTML into section chunks.
    Each chunk: {section_number, section_title, full_text, url, clause_type}
    """
    soup = BeautifulSoup(html, "lxml")

    # Ontario laws pages wrap each section in elements with id like "BK42"
    # Sections are typically <h2> or <h3> followed by <p> tags.
    sections: list[dict[str, Any]] = []

    # Find all heading elements that represent sections
    # Ontario.ca uses <h2 class="section"> or similar; fall back to heuristics.
    content_div = (
        soup.find("div", {"class": "field-items"})
        or soup.find("div", {"id": "content"})
        or soup.find("main")
        or soup.body
    )

    if content_div is None:
        print("[warn] Could not find main content div; using full body.", file=sys.stderr)
        content_div = soup.body

    # Collect all block-level elements in order
    # We look for elements with anchors that match section patterns
    section_pattern = re.compile(r"^(\d+(?:\.\d+)?)\s*[.\-–—]?\s*(.*)")
    anchor_pattern = re.compile(r"^BK\d+$")

    current_section: dict[str, Any] | None = None
    current_paragraphs: list[str] = []
    current_anchor: str = ""

    def _flush_section():
        nonlocal current_section, current_paragraphs, current_anchor
        if current_section is None:
            return
        full_text = _normalize_text("\n".join(current_paragraphs).strip())
        if not full_text:
            current_section = None
            current_paragraphs = []
            current_anchor = ""
            return
        sec_num = current_section["section_number"]
        sections.append(
            {
                "section_number": sec_num,
                "section_title": current_section["section_title"],
                "full_text": full_text,
                "url": f"{RTA_URL}#{current_anchor}" if current_anchor else RTA_URL,
                "clause_type": SECTION_CLAUSE_MAP.get(sec_num, "general"),
            }
        )
        current_section = None
        current_paragraphs = []
        current_anchor = ""

    for element in content_div.find_all(
        ["h1", "h2", "h3", "h4", "p", "li", "div"], recursive=True
    ):
        tag = element.name

        # Check for anchor on element or its parent
        anchor_id = element.get("id", "")
        if not anchor_id and element.parent:
            anchor_id = element.parent.get("id", "")

        is_heading = tag in ("h1", "h2", "h3", "h4")
        text = element.get_text(separator=" ", strip=True)
        text = _normalize_text(text)

        if not text:
            continue

        if is_heading:
            m = section_pattern.match(text)
            if m:
                _flush_section()
                sec_num = m.group(1).strip()
                sec_title = m.group(2).strip()
                current_section = {
                    "section_number": sec_num,
                    "section_title": sec_title,
                }
                if anchor_id and anchor_pattern.match(anchor_id):
                    current_anchor = anchor_id
                current_paragraphs = [text]
            # Non-section headings are ignored for section breaks
        else:
            if current_section is not None:
                # Avoid double-adding the heading text
                if text not in current_paragraphs:
                    current_paragraphs.append(text)

    _flush_section()

    # Deduplicate by section_number (keep last occurrence which is most complete)
    seen: dict[str, dict] = {}
    for s in sections:
        seen[s["section_number"]] = s
    return list(seen.values())


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

def _embed_text(text: str) -> list[float]:
    """
    Embed text using Gemini text-embedding-004.
    Handles rate limits (429) with a 60s sleep + retry.
    """
    import google.generativeai as genai

    genai.configure(api_key=GEMINI_API_KEY)

    def _call():
        try:
            result = genai.embed_content(
                model="models/text-embedding-004",
                content=text,
                task_type="RETRIEVAL_DOCUMENT",
            )
            return result["embedding"]
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "quota" in err_str.lower() or "rate" in err_str.lower():
                print("[rate-limit] Gemini 429 — sleeping 60s...", file=sys.stderr)
                time.sleep(60)
                raise  # trigger retry
            raise

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
            client.table("statute_sections")
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
    client.table("statute_sections").upsert(
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

    # Step 1: Fetch RTA
    print("[1/4] Fetching RTA HTML from ontario.ca...", file=sys.stderr)
    try:
        html = _fetch_html(RTA_URL)
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

        # Embed
        try:
            embedding = _embed_text(full_text)
        except Exception as e:
            print(f"       [error] Embedding failed: {e}", file=sys.stderr)
            errors += 1
            continue

        # Build row
        row: dict[str, Any] = {
            "jurisdiction_code": JURISDICTION_CODE,
            "act_name": ACT_NAME,
            "section_number": sec_num,
            "section_title": sec_title,
            "full_text": full_text,
            "url": chunk.get("url", RTA_URL),
            "clause_type": chunk.get("clause_type", "general"),
            "embedding": embedding,
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
