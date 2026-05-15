"""Quick smoke test: fetch + parse only, no embedding or DB writes."""
import truststore; truststore.inject_into_ssl()
import sys
sys.path.insert(0, __file__.rsplit("scripts", 1)[0])

from scripts.build_corpus import _fetch_html, _parse_rta_sections, _chunk_section, RTA_FETCH_URL

print("Fetching...", flush=True)
html = _fetch_html(RTA_FETCH_URL)
print(f"Fetched {len(html):,} bytes")

sections = _parse_rta_sections(html)
print(f"Parsed {len(sections)} sections")

if not sections:
    print("ERROR: no sections found")
    sys.exit(1)

# Show first 5 and a few key sections
for s in sections[:5]:
    print(f"  s.{s['section_number']:>6}  title={s['section_title'][:40]!r}  chars={len(s['full_text'])}")

for target in ["105", "27", "116"]:
    hit = next((s for s in sections if s["section_number"] == target), None)
    if hit:
        print(f"  s.{target}: {hit['section_title']!r} — {hit['full_text'][:80]}")
    else:
        print(f"  s.{target}: NOT FOUND")

chunks = []
for s in sections:
    chunks.extend(_chunk_section(s))
print(f"\nTotal chunks after splitting: {len(chunks)}")
print("Parse test PASSED")
