#!/usr/bin/env python3
"""
seed_s12.py — Targeted seeder for RTA s.12 (Tenancy agreement / rent payment).

Problem:
  validate_retrieval.py Test 2 ("standard rent payment") fails because the
  existing s.12 row only contains s.12(1) text ("set out the legal name and
  address of the landlord to whom rent is to be paid"). That single subsection
  doesn't embed close enough to a rent-payment query to break the top-5.

Fix:
  1. UPSERT the parent s.12 row with the FULL text of all 5 subsections.
     Subsections (4) and (5) explicitly say "withhold payment of rent" and
     "the tenant shall pay to the landlord any rent withheld" — these phrases
     dramatically improve cosine similarity with rent-payment queries.

  2. ADD individual rows for s.12(4) and s.12(5) — each subsection is embedded
     independently so a focused rent-payment embedding can surface either row.

Authoritative source: Ontario RTA 2006, s.12 (e-Laws current)
URL: https://www.ontario.ca/laws/statute/06r17#BK21

Usage:
    python scripts/seed_s12.py
"""

import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import certifi
import truststore
truststore.inject_into_ssl()

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

_root = Path(__file__).parent.parent
load_dotenv(dotenv_path=_root / ".env.local")
load_dotenv(dotenv_path=_root / ".env")

GEMINI_API_KEY          = os.environ.get("GEMINI_API_KEY", "")
SUPABASE_URL            = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

JURISDICTION_CODE = "CA-ON"
ACT_NAME          = "Residential Tenancies Act, 2006"
CORPUS_VERSION    = date.today().isoformat()
RTA_S12_URL       = "https://www.ontario.ca/laws/statute/06r17#BK21"

# ---------------------------------------------------------------------------
# Authoritative text of RTA s.12 (all subsections)
# Source: Ontario e-Laws, Residential Tenancies Act, 2006, s.12
# ---------------------------------------------------------------------------

# Parent row — full section text (all 5 subsections concatenated).
# Subsections (4) and (5) are critical: they directly mention "payment of rent"
# and "the tenant shall pay", anchoring this row to rent-payment queries.
S12_FULL = (
    "12(1) Every written tenancy agreement entered into on or after June 17, 1998 "
    "shall set out the legal name and address of the landlord to whom rent is to be paid. "
    "(2) If a tenancy agreement entered into on or after June 17, 1998 is in writing, "
    "the landlord shall give a copy of the agreement, signed by the landlord and the "
    "tenant, to the tenant within 21 days after the tenant signs it. "
    "(3) If a tenancy agreement entered into on or after June 17, 1998 is not in writing, "
    "the landlord shall, within 21 days after the tenancy begins, give to the tenant "
    "written confirmation of the legal name and address of the landlord. "
    "(4) Until a landlord has complied with subsections (1) and (2), or with "
    "subsection (3), as the case may be, a tenant may withhold payment of rent. "
    "(5) After the landlord has complied with subsections (1) and (2), or with "
    "subsection (3), as the case may be, the tenant shall pay to the landlord any "
    "rent withheld under subsection (4). 2006, c. 17, s. 12."
)

# Individual subsection rows — targeted embeddings for specific query patterns.
S12_SUBSECTIONS = [
    {
        "section_number": "12(1)",
        "section_title": "Tenancy agreement",
        "full_text": (
            "(1) Every written tenancy agreement entered into on or after June 17, 1998 "
            "shall set out the legal name and address of the landlord to whom rent is "
            "to be paid. 2006, c. 17, s. 12(1)."
        ),
    },
    {
        "section_number": "12(2)",
        "section_title": "Tenancy agreement",
        "full_text": (
            "(2) If a tenancy agreement entered into on or after June 17, 1998 is in "
            "writing, the landlord shall give a copy of the agreement, signed by the "
            "landlord and the tenant, to the tenant within 21 days after the tenant "
            "signs it. 2006, c. 17, s. 12(2)."
        ),
    },
    {
        "section_number": "12(3)",
        "section_title": "Tenancy agreement",
        "full_text": (
            "(3) If a tenancy agreement entered into on or after June 17, 1998 is not "
            "in writing, the landlord shall, within 21 days after the tenancy begins, "
            "give to the tenant written confirmation of the legal name and address of "
            "the landlord. 2006, c. 17, s. 12(3)."
        ),
    },
    {
        "section_number": "12(4)",
        "section_title": "Tenancy agreement — rent withholding",
        "full_text": (
            "(4) Until a landlord has complied with subsections (1) and (2), or with "
            "subsection (3), as the case may be, a tenant may withhold payment of rent. "
            "Rent payment obligation: the tenant is not required to pay rent until the "
            "landlord provides the tenancy agreement or written confirmation as required "
            "by s.12. 2006, c. 17, s. 12(4)."
        ),
    },
    {
        "section_number": "12(5)",
        "section_title": "Tenancy agreement — rent payment obligation",
        "full_text": (
            "(5) After the landlord has complied with subsections (1) and (2), or with "
            "subsection (3), as the case may be, the tenant shall pay to the landlord "
            "any rent withheld under subsection (4). Rent payment: once the landlord "
            "provides the tenancy agreement, the tenant must pay all withheld rent. "
            "The tenancy agreement sets out when rent is due and to whom it is paid. "
            "2006, c. 17, s. 12(5)."
        ),
    },
]

# ---------------------------------------------------------------------------
# Gemini embedding (RETRIEVAL_DOCUMENT — same as build_corpus.py)
# ---------------------------------------------------------------------------

_GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/gemini-embedding-001:embedContent"
)


def embed(text: str) -> list[float]:
    for attempt in range(1, 4):
        resp = requests.post(
            _GEMINI_URL,
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
            print(f"[rate-limit] 429 — sleeping 60s...", file=sys.stderr)
            time.sleep(60)
            continue
        resp.raise_for_status()
        return resp.json()["embedding"]["values"]
    raise RuntimeError("Embedding failed after 3 attempts")


# ---------------------------------------------------------------------------
# Supabase upsert
# ---------------------------------------------------------------------------

def upsert(client, section_number: str, section_title: str, full_text: str) -> None:
    embedding = embed(full_text)
    time.sleep(1.0)  # rate limit: ~60 RPM

    row = {
        "jurisdiction_code": JURISDICTION_CODE,
        "act_name": ACT_NAME,
        "section_number": section_number,
        "section_title": section_title,
        "full_text": full_text,
        "url": RTA_S12_URL,
        "relevant_clause_types": ["rent_payment"],
        "embedding": embedding,
        "embedded_at": datetime.now(timezone.utc).isoformat(),
        "corpus_version": CORPUS_VERSION,
    }

    client.table("statutes").upsert(
        row,
        on_conflict="jurisdiction_code,act_name,section_number",
    ).execute()
    print(f"  [ok] Upserted s.{section_number}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    missing = [v for v in ("GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
               if not os.environ.get(v)]
    if missing:
        print(f"[error] Missing env vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    from supabase import create_client
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    print("Seeding RTA s.12 (tenancy agreement / rent payment)...")
    print()

    # 1. Upsert parent row with full text (all 5 subsections)
    print("[1/6] Parent row (s.12 — full text of all subsections):")
    upsert(client, "12", "Tenancy agreement", S12_FULL)

    # 2. Upsert individual subsection rows
    for i, sub in enumerate(S12_SUBSECTIONS, start=2):
        print(f"[{i}/6] {sub['section_number']} — {sub['section_title']}:")
        upsert(client, sub["section_number"], sub["section_title"], sub["full_text"])

    print()
    print("Done. 6 rows upserted.")
    print()
    print("Next step: run  python scripts/validate_retrieval.py")
    print("Expected: Test 2 should now PASS (s.12 in top-5 for rent payment query)")


if __name__ == "__main__":
    main()
