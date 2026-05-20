/**
 * Unit tests for extractLeaseAddress() — the regex-based address extractor
 * added to lib/agent.ts.
 *
 * Duplicates the function here for standalone testing (no transpile needed).
 * Run: node scripts/test-address-extraction.mjs
 */

// ── Inline copy of extractLeaseAddress (keep in sync with lib/agent.ts) ──────

function extractLeaseAddress(rawText) {
  const empty = { address: "", unit: "", city: "", postal_code: "" };
  if (!rawText || rawText.length < 20) return empty;

  const text = rawText.replace(/[ \t]+/g, " ").replace(/\r\n/g, "\n");
  let raw = "";

  // Pattern 1 — Ontario Standard Form
  const stdForm = text.match(
    /full address of (?:the )?rental unit[^\n:]*:?[ \t]*\n?[ \t]*([^\n]{10,120})/i
  );
  if (stdForm) raw = stdForm[1].trim();

  // Pattern 2 — labelled field
  if (!raw) {
    const label = text.match(
      /(?:^|\n)[ \t]*(?:rental unit|premises|rental premises|property address|unit address)[ \t]*:[ \t]*([^\n]{10,120})/im
    );
    if (label) raw = label[1].trim();
  }

  // Pattern 3 — "located at" / "situate at" / "known as"
  if (!raw) {
    const locAt = text.match(
      /(?:located at|situate(?:d)? at|known as|being and described as)\s+([^\n]{10,120})/i
    );
    if (locAt) raw = locAt[1].trim();
  }

  // Pattern 4 — street-number + street-suffix in first 3000 chars
  if (!raw) {
    const topHalf = text.slice(0, Math.min(text.length, 3000));
    const street = topHalf.match(
      /(?:^|\n)\s*(\d{1,5}[- ]?[A-Za-z0-9]?[,\s]+[A-Za-z][A-Za-z\s.'‑-]{3,50}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Way|Crescent|Cres|Court|Ct|Lane|Ln|Place|Pl)[^\n]{0,60})/i
    );
    if (street) raw = street[1].trim();
  }

  if (!raw) return empty;

  const postalMatch = raw.match(/([A-Z]\d[A-Z][ -]?\d[A-Z]\d)/i);
  const postal_code = postalMatch
    ? postalMatch[1].toUpperCase().replace(/^(.{3})[ -]?(.{3})$/, "$1 $2")
    : "";

  const unitMatch = raw.match(/\b(?:unit|apt\.?|apartment|suite|#)\s*([0-9A-Za-z-]+)/i);
  const unit = unitMatch
    ? `${unitMatch[0].split(/\s+/)[0]} ${unitMatch[1]}`.trim()
    : "";

  const cityMatch = raw.match(/,\s*([A-Za-z][A-Za-z\s]{1,30}?)(?:,\s*|\s+)(?:ON|Ontario)\b/i);
  const city = cityMatch ? cityMatch[1].trim() : "";

  const address = raw
    .replace(/,\s*Ontario\b/gi, "")
    .replace(/,?\s*\bON\b/g, "")
    .replace(/[A-Z]\d[A-Z][ -]?\d[A-Z]\d/gi, "")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*$/, "")
    .trim()
    .slice(0, 120);

  return { address, unit, city, postal_code };
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label, detail = "") {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}${detail ? " -- " + detail : ""}`);
    failed++;
  }
}

function assertField(result, field, expected, label) {
  const actual = result[field];
  const ok = expected === ""
    ? actual === ""
    : actual.toLowerCase().includes(expected.toLowerCase());
  assert(ok, label, `expected "${expected}" in ${field}="${actual}"`);
}

console.log("\n=== extractLeaseAddress() unit tests ===\n");

// ── Test 1: Ontario Standard Form layout ──────────────────────────────────────
console.log("Test 1: Ontario Standard Form");
{
  const text = `
3. RENTAL UNIT
Full Address of Rental Unit (including unit number, street number and name, municipality, province, and postal code):
Unit 4, 123 Main Street, Toronto, Ontario, M5V 1A1

4. CONTACT INFORMATION
`;
  const r = extractLeaseAddress(text);
  assertField(r, "address", "123 Main Street", "street in address");
  assertField(r, "city",    "Toronto",         "city extracted");
  assertField(r, "postal_code", "M5V 1A1",     "postal code extracted");
  assertField(r, "unit",    "Unit 4",           "unit extracted");
}

// ── Test 2: Labelled "Rental Unit:" field ─────────────────────────────────────
console.log("\nTest 2: Labelled 'Rental Unit:' field");
{
  const text = `
TENANCY AGREEMENT

Rental Unit: 456 King Street West, Unit 2B, Toronto, ON M5V 2Z3

Landlord: John Smith
`;
  const r = extractLeaseAddress(text);
  assertField(r, "address", "456 King Street West", "street in address");
  assertField(r, "postal_code", "M5V 2Z3", "postal code");
}

// ── Test 3: "located at" pattern ──────────────────────────────────────────────
console.log("\nTest 3: 'located at' pattern");
{
  const text = `This Agreement is for the residential premises located at 789 Queen Street East, Toronto, Ontario.`;
  const r = extractLeaseAddress(text);
  assertField(r, "address", "789 Queen Street East", "street in address");
  assertField(r, "city",    "Toronto",               "city extracted");
}

// ── Test 4: "Premises:" label ─────────────────────────────────────────────────
console.log("\nTest 4: 'Premises:' label");
{
  const text = `
RESIDENTIAL LEASE AGREEMENT

Premises: Apartment 3, 321 Bloor Street West, Toronto, ON M6G 1M7
`;
  const r = extractLeaseAddress(text);
  assertField(r, "address", "Bloor Street West", "street in address");
  assertField(r, "postal_code", "M6G 1M7",       "postal code");
}

// ── Test 5: Street-number pattern fallback ────────────────────────────────────
console.log("\nTest 5: Street-number pattern fallback");
{
  const text = `
BETWEEN:

The Tenant: Jane Doe

The Property:
50 Wellington Avenue, Hamilton, Ontario L8P 2B2
`;
  const r = extractLeaseAddress(text);
  assertField(r, "address", "Wellington Avenue", "street in address");
  assertField(r, "city",    "Hamilton",          "city");
  assertField(r, "postal_code", "L8P 2B2",       "postal code");
}

// ── Test 6: No address present → all empty ────────────────────────────────────
console.log("\nTest 6: No address pattern present");
{
  const text = `This is a standard agreement between the landlord and tenant for the provision of housing services.`;
  const r = extractLeaseAddress(text);
  assert(r.address === "" && r.city === "" && r.postal_code === "",
    "all fields empty when no address found");
}

// ── Test 7: Empty / short input ───────────────────────────────────────────────
console.log("\nTest 7: Empty input");
{
  const r1 = extractLeaseAddress("");
  const r2 = extractLeaseAddress("short");
  assert(r1.address === "", "empty string → empty address");
  assert(r2.address === "", "short string → empty address");
}

// ── Test 8: "known as" pattern ────────────────────────────────────────────────
console.log("\nTest 8: 'known as' pattern");
{
  const text = `The Landlord agrees to rent to the Tenant the residential premises known as 1001 Bay Street, Suite 12, Toronto, Ontario.`;
  const r = extractLeaseAddress(text);
  assertField(r, "address", "Bay Street", "street in address");
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed}/${passed + failed} passed`);
if (failed === 0) {
  console.log("ALL TESTS PASSED");
} else {
  console.log(`${failed} test(s) FAILED`);
}
console.log("");
process.exit(failed > 0 ? 1 : 0);
