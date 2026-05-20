import assert from "assert";

async function testCopilotAPI() {
  console.log("Starting Negotiation Copilot integration smoke tests...");

  const base = "http://localhost:3000";

  // Test 1: Malformed UUID validation
  console.log("Running Test 1: Malformed UUID validation...");
  const res1 = await fetch(`${base}/api/negotiation/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leaseId: "not-a-uuid",
      tenantName: "Jane Doe",
      landlordName: "Mapleleaf Properties",
      tone: "cooperative",
      selectedClauseIds: ["befb17c3-7753-49d4-89cb-0b79119e8322"]
    })
  });
  const body1 = await res1.json();
  assert.strictEqual(res1.status, 400);
  assert.strictEqual(body1.error, "invalid_lease_id");
  console.log("  ✅ Test 1 Passed!");

  // Test 2: Missing Tenant Name
  console.log("Running Test 2: Missing Tenant Name...");
  const res2 = await fetch(`${base}/api/negotiation/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leaseId: "befb17c3-7753-49d4-89cb-0b79119e8322",
      tenantName: "",
      landlordName: "Mapleleaf Properties",
      tone: "cooperative",
      selectedClauseIds: ["befb17c3-7753-49d4-89cb-0b79119e8322"]
    })
  });
  const body2 = await res2.json();
  assert.strictEqual(res2.status, 400);
  assert.strictEqual(body2.error, "missing_tenant_name");
  console.log("  ✅ Test 2 Passed!");

  // Test 3: Invalid tone
  console.log("Running Test 3: Invalid Tone...");
  const res3 = await fetch(`${base}/api/negotiation/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leaseId: "befb17c3-7753-49d4-89cb-0b79119e8322",
      tenantName: "Jane Doe",
      landlordName: "Mapleleaf Properties",
      tone: "angry",
      selectedClauseIds: ["befb17c3-7753-49d4-89cb-0b79119e8322"]
    })
  });
  const body3 = await res3.json();
  assert.strictEqual(res3.status, 400);
  assert.strictEqual(body3.error, "invalid_tone");
  console.log("  ✅ Test 3 Passed!");

  console.log("All local mock response validation checks passed successfully! 🚀");
}

testCopilotAPI().catch((err) => {
  console.error("❌ Integration test failed:", err);
  process.exit(1);
});
