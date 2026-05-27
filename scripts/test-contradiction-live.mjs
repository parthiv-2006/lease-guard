/**
 * Live LLM Contradiction Detection Verification
 * Tests 5 cases: 2 should flag, 3 should not.
 * Loads env from .env.local, then calls detect-contradiction tool directly.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Resolve Anthropic credentials — same logic as lib/anthropic.ts
// Mode A: real ANTHROPIC_API_KEY in .env.local
// Mode B: Claude Code OAuth token from ~/.claude/.credentials.json
function resolveAnthropicKey() {
  // Try .env.local first
  try {
    const envLines = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/);
    for (const line of envLines) {
      const m = line.match(/^([A-Z_]+)\s*=\s*(.+?)\s*$/);
      if (m && m[1] === "ANTHROPIC_API_KEY" && m[2].length > 20) return m[2];
    }
  } catch {}

  // Fallback: Claude Code OAuth credentials
  const credPaths = [
    resolve(os.homedir(), ".claude", ".credentials.json"),
    resolve(os.homedir(), ".claude", "credentials.json"),
  ];
  for (const p of credPaths) {
    try {
      const creds = JSON.parse(readFileSync(p, "utf8"));
      const token =
        creds?.claudeAiOauth?.accessToken ??
        creds?.access_token ??
        creds?.apiKey;
      if (token) return token;
    } catch {}
  }
  return null;
}

const apiKey = resolveAnthropicKey();
if (!apiKey) {
  console.error("No Anthropic credentials found. Set ANTHROPIC_API_KEY or run `claude auth login`.");
  process.exit(1);
}
process.env.ANTHROPIC_API_KEY = apiKey;
// Windows SSL fix — government CAs not trusted by Node.js default trust store.
// Same fix as instrumentation.ts, applied here for standalone script execution.
if (process.platform === "win32") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
console.log(`Credentials resolved (len=${apiKey.length}, prefix=${apiKey.slice(0, 8)})`);

// Import the tool execute function from compiled MCP server
import { pathToFileURL } from "url";
const { execute } = await import(
  pathToFileURL(resolve(root, "mcp-server/dist/tools/detect-contradiction.js")).href
);

// ─── Test Cases ───────────────────────────────────────────────────────────────

const CASES = [
  {
    id: "T1-SHOULD-FLAG",
    desc: "Unrestricted entry vs quiet enjoyment",
    a: {
      id: "clause-entry-unrestricted",
      text: "The landlord may enter the rental unit at any time without notice for any reason.",
      type: "entry_rights",
    },
    b: {
      id: "clause-quiet-enjoyment",
      text: "The tenant shall have quiet enjoyment of the rental unit for all purposes.",
      type: "quiet_enjoyment",
    },
    statutes_a: [
      "s.26: A landlord may enter a rental unit only in accordance with s.26 and s.27.",
      "s.27: Before entering, the landlord shall provide at least 24 hours written notice.",
    ],
    statutes_b: [
      "s.22: A landlord shall not substantially interfere with the reasonable enjoyment of a rental unit.",
    ],
    expectFlag: true,
  },
  {
    id: "T2-SHOULD-FLAG",
    desc: "Tenant bears all repairs + landlord fully indemnified",
    a: {
      id: "clause-repairs",
      text: "The tenant is responsible for all repairs and maintenance of the rental unit, including structural repairs, plumbing, and electrical systems.",
      type: "maintenance_repairs",
    },
    b: {
      id: "clause-indemnify",
      text: "The tenant shall indemnify and hold harmless the landlord from any and all claims arising from the condition of the rental unit.",
      type: "liability_indemnification",
    },
    statutes_a: [
      "s.20: A landlord is responsible for providing and maintaining a residential complex in a good state of repair.",
      "s.29: A landlord shall maintain the rental unit in a good state of repair.",
    ],
    statutes_b: [
      "s.20: A landlord is responsible for maintaining the residential complex in good state of repair.",
    ],
    expectFlag: true,
  },
  {
    id: "T3-SHOULD-NOT-FLAG",
    desc: "Compliant 24h entry notice + quiet enjoyment — standard and lawful",
    a: {
      id: "clause-entry-24h",
      text: "The landlord shall provide at least 24 hours written notice before entering the rental unit, except in case of emergency.",
      type: "entry_rights",
    },
    b: {
      id: "clause-quiet-2",
      text: "The tenant shall have quiet enjoyment of the rental unit for all purposes.",
      type: "quiet_enjoyment",
    },
    statutes_a: [
      "s.27: Before entering a rental unit, the landlord shall provide at least 24 hours written notice.",
    ],
    statutes_b: [
      "s.22: A landlord shall not substantially interfere with the reasonable enjoyment of a rental unit.",
    ],
    expectFlag: false,
  },
  {
    id: "T4-SHOULD-NOT-FLAG",
    desc: "Standard rent payment + last-month deposit — separate topics",
    a: {
      id: "clause-rent",
      text: "The tenant shall pay rent of $1,800 per month on the first day of each month.",
      type: "rent_payment",
    },
    b: {
      id: "clause-deposit",
      text: "The tenant has paid a last month's rent deposit of $1,800 to be held by the landlord.",
      type: "security_deposit",
    },
    statutes_a: [
      "s.12: Rent is due on the date specified in the tenancy agreement.",
    ],
    statutes_b: [
      "s.105: A landlord may require a tenant to pay a rent deposit of no more than one month's rent.",
    ],
    expectFlag: false,
  },
  {
    id: "T5-SHOULD-NOT-FLAG",
    desc: "Subletting restriction alone — no conflicting clause present",
    a: {
      id: "clause-sublet",
      text: "The tenant shall not sublet the rental unit or assign this lease without the prior written consent of the landlord.",
      type: "subletting_assignment",
    },
    b: {
      id: "clause-boilerplate",
      text: "This lease constitutes the entire agreement between the parties and supersedes all prior discussions.",
      type: "standard_boilerplate",
    },
    statutes_a: [
      "s.97: A tenant may sublet a rental unit with the consent of the landlord.",
    ],
    statutes_b: [],
    expectFlag: false,
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

console.log("\n══════════════════════════════════════════════════════");
console.log("  LeaseGuard — Live LLM Contradiction Detection Test  ");
console.log("══════════════════════════════════════════════════════\n");

for (const tc of CASES) {
  process.stdout.write(`[${tc.id}] ${tc.desc} ... `);
  const t0 = Date.now();

  try {
    const output = await execute({
      clause_a: tc.a,
      clause_b: tc.b,
      statutes_a: tc.statutes_a,
      statutes_b: tc.statutes_b,
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const didFlag = output.has_contradiction === true;
    const ok = didFlag === tc.expectFlag;

    if (ok) {
      passed++;
      console.log(
        `PASS (${elapsed}s) — flagged=${didFlag}, method=${output.detection_method ?? "unknown"}, confidence=${output.confidence ?? "n/a"}`
      );
    } else {
      failed++;
      console.log(
        `FAIL (${elapsed}s) — expected flagged=${tc.expectFlag}, got flagged=${didFlag}, method=${output.detection_method ?? "unknown"}`
      );
      if (output.explanation) console.log(`   explanation: ${output.explanation}`);
    }

    results.push({ id: tc.id, ok, output, elapsed });
  } catch (err) {
    failed++;
    console.log(`ERROR — ${err.message}`);
    results.push({ id: tc.id, ok: false, error: err.message });
  }
}

console.log("\n──────────────────────────────────────────────────────");
console.log(`  Results: ${passed}/${CASES.length} passed`);

if (failed === 0) {
  console.log("  ✅  ALL CASES PASSED — LLM contradiction detection verified");
} else {
  console.log(`  ❌  ${failed} case(s) failed`);
}
console.log("──────────────────────────────────────────────────────\n");

// Show detail for flagged cases
for (const r of results.filter((x) => x.output?.has_contradiction)) {
  console.log(`[${r.id}] contradiction detail:`);
  console.log(`  type:    ${r.output.contradiction_type}`);
  console.log(`  statute: ${r.output.statute_cited}`);
  console.log(`  governs: ${r.output.which_governs}`);
  console.log(`  explanation: ${r.output.explanation}`);
  console.log();
}

process.exit(failed > 0 ? 1 : 0);
