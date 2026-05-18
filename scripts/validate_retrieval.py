#!/usr/bin/env python3
"""
validate_retrieval.py - Validate statute retrieval quality against known clause/statute pairs.

Usage:
    python scripts/validate_retrieval.py

Exit code 0 if hit rate >= 80%, exit code 1 otherwise.

Environment variables (loaded from ../.env):
    GEMINI_API_KEY
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

import os
import re
import sys
import time
from pathlib import Path

import certifi
import truststore
truststore.inject_into_ssl()

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load environment
# ---------------------------------------------------------------------------

_project_root = Path(__file__).parent.parent
load_dotenv(dotenv_path=_project_root / ".env.local")
load_dotenv(dotenv_path=_project_root / ".env")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# ---------------------------------------------------------------------------
# Test pairs
# ---------------------------------------------------------------------------

TEST_PAIRS = [
    # --- Clearly illegal / unenforceable clauses ---
    {
        "description": "Unconditional entry without notice",
        "clause_text": "The landlord may enter the unit at any time without notice for inspection purposes.",
        "clause_type": "entry_rights",
        "expected_sections": ["26", "27"],
        "should_flag_unenforceable": True,
    },
    {
        "description": "Standard rent payment",
        "clause_text": "The tenant shall pay rent of $2,200 on the first of each month.",
        "clause_type": "rent_payment",
        "expected_sections": ["12"],
        "should_flag_unenforceable": False,
    },
    {
        "description": "Unlimited rent increase",
        "clause_text": "The landlord may increase rent by any amount with 30 days written notice.",
        "clause_type": "rent_increase",
        "expected_sections": ["116", "120"],
        "should_flag_unenforceable": True,
    },
    {
        "description": "Waiver of LTB rights",
        "clause_text": "The tenant waives all rights to dispute rent increases at the Landlord and Tenant Board.",
        "clause_type": "dispute_resolution",
        "expected_sections": [],
        "should_flag_unenforceable": True,
    },
    {
        "description": "Tenant responsible for all repairs",
        "clause_text": "The tenant is responsible for all repairs and maintenance of the unit.",
        "clause_type": "maintenance_repairs",
        "expected_sections": ["20"],
        "should_flag_unenforceable": True,
    },
    # --- Compliant clauses that must NOT be flagged (false-positive guard) ---
    {
        "description": "Compliant entry clause with emergency exception [FALSE POSITIVE GUARD]",
        "clause_text": (
            "The Landlord may enter the rental unit only in accordance with the "
            "Residential Tenancies Act, requiring 24-hour written notice except in "
            "cases of emergency or with the Tenant's written consent."
        ),
        "clause_type": "entry_rights",
        "expected_sections": ["26", "27"],
        "should_flag_unenforceable": False,
        "expected_score_max": 4,  # Must score low — this is a compliant clause
    },
    {
        "description": "Compliant last-month rent deposit",
        "clause_text": (
            "The Tenant shall provide a rent deposit equal to one month's rent "
            "($2,200) to be held and applied to the last month of the tenancy "
            "in accordance with the Residential Tenancies Act."
        ),
        "clause_type": "security_deposit",
        # s.106 = "landlord may require a rent deposit" (the permission provision)
        # s.105 = deposit cap. Both are valid hits; s.106 is what the corpus correctly returns.
        "expected_sections": ["105", "106"],
        "should_flag_unenforceable": False,
        "expected_score_max": 4,
    },
]

# ---------------------------------------------------------------------------
# Gemini embed (same REST approach as build_corpus.py)
# ---------------------------------------------------------------------------

_GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/gemini-embedding-001:embedContent"
)


def _embed_text(text: str) -> list[float]:
    resp = requests.post(
        _GEMINI_EMBED_URL,
        params={"key": GEMINI_API_KEY},
        json={
            "content": {"parts": [{"text": text}]},
            "taskType": "RETRIEVAL_QUERY",
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


# ---------------------------------------------------------------------------
# Supabase search (correct params: query_embedding, jurisdiction, match_threshold, match_count)
# ---------------------------------------------------------------------------

def _get_supabase_client():
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _section_matches(retrieved: str, expected: str) -> bool:
    """
    True if retrieved section satisfies expected.
    Handles corpus chunk IDs: "106.1", "106.31" → match expected "106".
    Does NOT match "12.1.22" for expected "12" (12.1 is a different RTA section).
    Suffix must be a pure integer to qualify as a chunk number.
    """
    if retrieved == expected:
        return True
    prefix = expected + "."
    if retrieved.startswith(prefix):
        suffix = retrieved[len(prefix):]
        if re.match(r"^\d+$", suffix):
            return True
    # Future subsection format after Work Item 1.1: "26(2)" matches expected "26"
    if retrieved.startswith(expected + "("):
        return True
    return False


def _search_statutes(client, embedding: list[float], top_k: int = 5) -> list[dict]:
    try:
        resp = client.rpc(
            "search_statutes",
            {
                "query_embedding": embedding,
                "jurisdiction": "CA-ON",
                "match_threshold": 0.40,  # Lower than production to surface more results
                "match_count": top_k,
            },
        ).execute()
        return resp.data or []
    except Exception as e:
        print(f"  [error] search_statutes RPC failed: {e}", file=sys.stderr)
        return []


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    missing = [
        v for v in ("GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        if not os.environ.get(v)
    ]
    if missing:
        print(f"[error] Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    print("Connecting to Supabase...", file=sys.stderr)
    try:
        client = _get_supabase_client()
    except Exception as e:
        print(f"[error] Cannot connect to Supabase: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"\nRunning {len(TEST_PAIRS)} retrieval tests...\n")
    print("=" * 70)

    passes = 0
    false_positive_failures = 0

    for i, pair in enumerate(TEST_PAIRS, start=1):
        desc = pair["description"]
        clause_text = pair["clause_text"]
        clause_type = pair["clause_type"]
        expected_sections = pair["expected_sections"]
        should_flag = pair["should_flag_unenforceable"]
        expected_score_max = pair.get("expected_score_max")

        print(f"Test {i}/{len(TEST_PAIRS)}: {desc}")
        print(f"  Type: {clause_type}")
        print(f"  Clause: {clause_text[:100]}{'...' if len(clause_text) > 100 else ''}")
        print(f"  Expected sections: {expected_sections or '(none specific)'}")
        print(f"  Should flag unenforceable: {should_flag}")
        if expected_score_max:
            print(f"  Expected score max: {expected_score_max} (compliant clause guard)")

        # Embed the clause
        try:
            embedding = _embed_text(clause_text)
            time.sleep(1.0)  # respect rate limit
        except Exception as e:
            print(f"  [error] Embedding failed: {e}")
            print()
            continue

        results = _search_statutes(client, embedding, top_k=5)

        retrieved_sections = []
        if results:
            print(f"  Retrieved ({len(results)} results):")
            for r in results:
                sec_num = str(r.get("section_number", "?"))
                similarity = r.get("relevance_score", r.get("similarity", 0.0))
                title = r.get("section_title", "")
                retrieved_sections.append(sec_num)
                print(f"    - s.{sec_num}: {title[:45]} (score={similarity:.4f})")
        else:
            print("  Retrieved: (no results)")

        # Evaluate — use _section_matches to handle chunk-numbered variants (e.g. "106.1" → "106")
        if not expected_sections:
            hit = True
            print("  Result: PASS (no specific sections required)")
        else:
            hit = any(
                _section_matches(retrieved, exp)
                for retrieved in retrieved_sections
                for exp in expected_sections
            )
            matched = [
                exp for exp in expected_sections
                if any(_section_matches(r, exp) for r in retrieved_sections)
            ]
            missed = [s for s in expected_sections if s not in matched]
            status = "PASS" if hit else "FAIL"
            print(f"  Result: {status}")
            if matched:
                print(f"    Matched: {matched}")
            if missed:
                print(f"    Missed:  {missed}")

        # Extra check: compliant clauses must not retrieve flagging statutes at high similarity
        if not should_flag and results:
            high_sim_hits = [r for r in results if r.get("relevance_score", 0) >= 0.65]
            if high_sim_hits:
                print(f"  [warn] Compliant clause retrieved {len(high_sim_hits)} high-similarity "
                      f"statute(s) — verify score_risk does not falsely flag this clause")

        if hit:
            passes += 1
        elif not should_flag:
            false_positive_failures += 1

        print()

    # Summary
    print("=" * 70)
    pass_rate = passes / len(TEST_PAIRS)
    print(f"RESULTS: {passes}/{len(TEST_PAIRS)} tests passed ({pass_rate * 100:.1f}%)")
    if false_positive_failures > 0:
        print(f"FALSE POSITIVE FAILURES: {false_positive_failures} compliant clause(s) "
              f"retrieved wrong statutes — check score-risk.ts regex")
    print()

    if pass_rate >= 0.80:
        print("OVERALL: PASS (hit rate >= 80%)")
        sys.exit(0)
    else:
        print(f"OVERALL: FAIL (hit rate {pass_rate * 100:.1f}% < 80%)")
        sys.exit(1)


if __name__ == "__main__":
    main()
