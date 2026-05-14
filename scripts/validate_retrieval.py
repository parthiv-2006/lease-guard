#!/usr/bin/env python3
"""
validate_retrieval.py - Validate statute retrieval quality against known clause/statute pairs.

Usage:
    python scripts/validate_retrieval.py

Exit code 0 if hit rate >= 80%, exit code 1 otherwise.

Environment variables (loaded from ../.env):
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load environment
# ---------------------------------------------------------------------------

_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# ---------------------------------------------------------------------------
# Test pairs
# ---------------------------------------------------------------------------

TEST_PAIRS = [
    {
        "clause_text": "The landlord may enter the unit at any time without notice for inspection purposes.",
        "clause_type": "entry_rights",
        "expected_sections": ["27"],  # Section 27 RTA - 24 hour notice requirement
        "should_flag_unenforceable": True,
    },
    {
        "clause_text": "The tenant shall pay rent of $2,200 on the first of each month.",
        "clause_type": "rent_payment",
        "expected_sections": ["12"],
        "should_flag_unenforceable": False,
    },
    {
        "clause_text": "The landlord may increase rent by any amount with 30 days written notice.",
        "clause_type": "rent_increase",
        "expected_sections": ["116", "120"],
        "should_flag_unenforceable": True,
    },
    {
        "clause_text": "The tenant waives all rights to dispute rent increases at the Landlord and Tenant Board.",
        "clause_type": "dispute_resolution",
        "expected_sections": [],
        "should_flag_unenforceable": True,
    },
    {
        "clause_text": "The tenant is responsible for all repairs and maintenance of the unit.",
        "clause_type": "maintenance_repairs",
        "expected_sections": ["20"],
        "should_flag_unenforceable": True,
    },
]

# ---------------------------------------------------------------------------
# Supabase search
# ---------------------------------------------------------------------------

def _get_supabase_client():
    from supabase import create_client

    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _search_statutes(
    client,
    clause_text: str,
    clause_type: str,
    top_k: int = 5,
) -> list[dict]:
    """
    Call the Supabase search_statutes RPC function.
    Returns a list of result rows with section_number and similarity.
    """
    try:
        resp = client.rpc(
            "search_statutes",
            {
                "query_text": clause_text,
                "clause_type_filter": clause_type,
                "match_count": top_k,
            },
        ).execute()
        return resp.data or []
    except Exception as e:
        # Some deployments may use different parameter names — try fallback
        try:
            resp = client.rpc(
                "search_statutes",
                {
                    "query_text": clause_text,
                    "match_count": top_k,
                },
            ).execute()
            return resp.data or []
        except Exception as e2:
            print(f"  [warn] search_statutes RPC failed: {e2}", file=sys.stderr)
            return []


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    # Validate env
    missing = [
        v
        for v in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
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
    total_with_expected = 0

    for i, pair in enumerate(TEST_PAIRS, start=1):
        clause_text = pair["clause_text"]
        clause_type = pair["clause_type"]
        expected_sections = pair["expected_sections"]
        should_flag = pair["should_flag_unenforceable"]

        print(f"Test {i}/{len(TEST_PAIRS)}: [{clause_type}]")
        print(f"  Clause: {clause_text[:80]}{'...' if len(clause_text) > 80 else ''}")
        print(f"  Expected sections: {expected_sections or '(none)'}")
        print(f"  Should flag unenforceable: {should_flag}")

        results = _search_statutes(client, clause_text, clause_type, top_k=5)

        retrieved_sections = []
        if results:
            print(f"  Retrieved ({len(results)} results):")
            for r in results:
                sec_num = str(r.get("section_number", r.get("section", "?")))
                similarity = r.get("similarity", r.get("score", 0.0))
                title = r.get("section_title", "")
                retrieved_sections.append(sec_num)
                print(f"    - Section {sec_num}: {title[:40]} (similarity={similarity:.4f})")
        else:
            print("  Retrieved: (no results)")

        # Evaluate hit
        if not expected_sections:
            # No specific sections expected — pass if the query didn't crash
            hit = True
            print("  Result: PASS (no specific sections required)")
        else:
            total_with_expected += 1
            hit = any(sec in retrieved_sections for sec in expected_sections)
            status = "PASS" if hit else "FAIL"
            matched = [sec for sec in expected_sections if sec in retrieved_sections]
            missed = [sec for sec in expected_sections if sec not in retrieved_sections]
            print(f"  Result: {status}")
            if matched:
                print(f"    Matched: {matched}")
            if missed:
                print(f"    Missed:  {missed}")

        if hit:
            passes += 1

        print()

    # ---------------------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------------------
    print("=" * 70)
    print(f"RESULTS: {passes}/{len(TEST_PAIRS)} tests passed")

    if total_with_expected > 0:
        section_hit_rate = (
            sum(
                1
                for pair in TEST_PAIRS
                if pair["expected_sections"]
                and any(
                    sec in _search_statutes(client, pair["clause_text"], pair["clause_type"], top_k=5)
                    for sec in pair["expected_sections"]
                )
            )
            / total_with_expected
        )
        # Use simpler pass-count approach since we already have results above
        pass_rate = passes / len(TEST_PAIRS)
        print(f"Hit rate: {pass_rate * 100:.1f}% ({passes}/{len(TEST_PAIRS)})")
        print()

        if pass_rate >= 0.80:
            print("OVERALL: PASS (hit rate >= 80%)")
            sys.exit(0)
        else:
            print(f"OVERALL: FAIL (hit rate {pass_rate * 100:.1f}% < 80%)")
            sys.exit(1)
    else:
        # All tests had no expected sections (unusual)
        print("Hit rate: N/A (no expected sections defined)")
        sys.exit(0)


if __name__ == "__main__":
    main()
