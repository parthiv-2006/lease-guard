/**
 * eval-accuracy.mjs — LeaseGuard Accuracy Evaluation Script (ROADMAP 5.2)
 *
 * Runs all labelled test cases from scripts/test-leases/labels.json through
 * the score_risk MCP tool and computes precision, recall, and FP rate.
 *
 * Does NOT require Supabase or Gemini API keys — score_risk is
 * deterministic TypeScript. The script provides pre-built mock statutes so
 * the retrieval step is bypassed.
 *
 * Usage:
 *   node scripts/eval-accuracy.mjs
 *
 * Prerequisites:
 *   cd mcp-server && npm run build    (must be done first)
 *
 * Exit code 0 if precision >= 0.85 and FP rate <= 0.10, 1 otherwise.
 */

import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── Risk level ordering ───────────────────────────────────────────────────────

const RISK_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

function riskDiff(a, b) {
  return Math.abs((RISK_ORDER[a] ?? 0) - (RISK_ORDER[b] ?? 0));
}

// ── Inline minimal MCP client ─────────────────────────────────────────────────

class MiniMcpClient {
  constructor(proc) {
    this.proc = proc;
    this.buffer = "";
    this.nextId = 1;
    this.pending = new Map();

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (t) this._dispatch(t);
      }
    });

    proc.stderr.on("data", (chunk) => {
      // Suppress MCP server startup noise unless DEBUG=1
      if (process.env.DEBUG) process.stderr.write(`[mcp] ${chunk}`);
    });

    proc.on("error", (err) => this._rejectAll(new Error(`MCP error: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0 && code !== null) {
        this._rejectAll(new Error(`MCP exited with code ${code}`));
      }
    });
  }

  _dispatch(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id == null) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
    else p.resolve(msg.result);
  }

  _rejectAll(err) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }

  _write(msg) {
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  _request(method, params, timeoutMs = 30_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this._write({ jsonrpc: "2.0", id, method, params });
    });
  }

  async initialize() {
    await this._request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "eval-accuracy", version: "1.0.0" },
    }, 20_000);
    this._write({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async callTool(name, args) {
    const result = await this._request("tools/call", { name, arguments: args });
    const text = result?.content?.[0]?.text;
    if (!text) throw new Error(`Tool ${name} returned empty content`);
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && typeof parsed.error === "string") {
      throw new Error(`Tool ${name} failed: ${parsed.error}${parsed.details ? " — " + JSON.stringify(parsed.details) : ""}`);
    }
    return parsed;
  }

  close() {
    try { this.proc.stdin?.end(); } catch {}
    setTimeout(() => { if (!this.proc.killed) this.proc.kill("SIGKILL"); }, 2000).unref();
  }
}

async function spawnMcpClient(serverPath) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.PORT;
  const proc = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: cleanEnv,
  });
  const client = new MiniMcpClient(proc);
  await client.initialize();
  return client;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Check built server exists
  const serverPath = resolve(root, "mcp-server/dist/start.js");
  if (!existsSync(serverPath)) {
    console.error("[error] mcp-server/dist/start.js not found.");
    console.error("  Run: cd mcp-server && npm run build");
    process.exit(1);
  }

  // Load labels
  const labelsPath = resolve(root, "scripts/test-leases/labels.json");
  if (!existsSync(labelsPath)) {
    console.error("[error] scripts/test-leases/labels.json not found.");
    process.exit(1);
  }
  const labels = JSON.parse(readFileSync(labelsPath, "utf8"));
  const cases = labels.test_cases;

  console.log("\n" + "=".repeat(70));
  console.log("  LeaseGuard — Accuracy Evaluation (ROADMAP 5.2)");
  console.log("  score_risk precision/recall/FP-rate test");
  console.log("=".repeat(70));
  console.log(`\n  Test cases loaded: ${cases.length}`);
  console.log(`  Unenforceable:     ${cases.filter(c => c.expected.is_potentially_unenforceable).length}`);
  console.log(`  Compliant:         ${cases.filter(c => !c.expected.is_potentially_unenforceable).length}`);
  console.log(`\n  Spawning MCP server...`);

  let client;
  try {
    client = await spawnMcpClient(serverPath);
  } catch (err) {
    console.error(`\n[error] Could not start MCP server: ${err.message}`);
    process.exit(1);
  }
  console.log("  MCP server ready.\n");

  // ── Run each test case ──────────────────────────────────────────────────────

  const results = [];

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    process.stdout.write(`  [${String(i+1).padStart(2)}/${cases.length}] ${tc.id}: ${tc.description.slice(0, 55).padEnd(55)} `);

    let scored;
    try {
      scored = await client.callTool("score_risk", {
        clause_id: tc.id,
        clause_text: tc.clause_text,
        clause_type: tc.clause_type,
        retrieved_statutes: tc.mock_statutes,
        retrieved_decisions: [],
        jurisdiction_code: "CA-ON",
      });
    } catch (err) {
      console.log(`ERROR: ${err.message.slice(0, 60)}`);
      results.push({ tc, scored: null, error: err.message });
      continue;
    }

    const actual = {
      is_unenforceable: scored.is_potentially_unenforceable ?? false,
      risk_level: scored.risk_level ?? "low",
      risk_score: scored.risk_score ?? 0,
    };

    const exp = tc.expected;
    const unfEnforceOk = actual.is_unenforceable === exp.is_potentially_unenforceable;
    const riskLevelOk = actual.risk_level === exp.risk_level;
    const riskLevelClose = riskDiff(actual.risk_level, exp.risk_level) <= 1;
    const scoreInRange = actual.risk_score >= exp.risk_score_min && actual.risk_score <= exp.risk_score_max;

    const allOk = unfEnforceOk && riskLevelClose && scoreInRange;
    console.log(allOk ? "PASS" : "FAIL");

    if (!allOk || process.env.VERBOSE) {
      if (!unfEnforceOk) {
        console.log(`       unenforceable: got=${actual.is_unenforceable} expected=${exp.is_potentially_unenforceable}`);
      }
      if (!riskLevelClose) {
        console.log(`       risk_level:    got=${actual.risk_level} expected=${exp.risk_level}`);
      }
      if (!scoreInRange) {
        console.log(`       risk_score:    got=${actual.risk_score.toFixed(1)} expected=[${exp.risk_score_min},${exp.risk_score_max}]`);
      }
    }

    results.push({ tc, scored: actual, unfEnforceOk, riskLevelOk, riskLevelClose, scoreInRange });
  }

  client.close();

  // ── Compute metrics ─────────────────────────────────────────────────────────

  const valid = results.filter(r => r.scored !== null);
  const unenfExpTrue  = valid.filter(r => r.tc.expected.is_potentially_unenforceable);
  const unenfExpFalse = valid.filter(r => !r.tc.expected.is_potentially_unenforceable);

  // True positives: expected unenforceable AND got unenforceable
  const tp = unenfExpTrue.filter(r => r.scored.is_unenforceable).length;
  // False negatives: expected unenforceable but got compliant
  const fn = unenfExpTrue.filter(r => !r.scored.is_unenforceable).length;
  // False positives: expected compliant but got unenforceable
  const fp = unenfExpFalse.filter(r => r.scored.is_unenforceable).length;
  // True negatives: expected compliant AND got compliant
  const tn = unenfExpFalse.filter(r => !r.scored.is_unenforceable).length;

  const precision  = tp + fp > 0 ? tp / (tp + fp) : 1.0;
  const recall     = tp + fn > 0 ? tp / (tp + fn) : 1.0;
  const f1         = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const fpRate     = fp + tn > 0 ? fp / (fp + tn) : 0;

  const riskExact  = valid.filter(r => r.riskLevelOk).length;
  const riskClose  = valid.filter(r => r.riskLevelClose).length;
  const scoreOk    = valid.filter(r => r.scoreInRange).length;
  const overallOk  = valid.filter(r => r.unfEnforceOk && r.riskLevelClose && r.scoreInRange).length;

  console.log("\n" + "=".repeat(70));
  console.log("  RESULTS SUMMARY");
  console.log("=".repeat(70));
  console.log(`\n  Confusion matrix (is_potentially_unenforceable):`);
  console.log(`    TP=${tp}  FP=${fp}  TN=${tn}  FN=${fn}`);
  console.log(`\n  Precision:         ${(precision * 100).toFixed(1)}%  (target >= 85%)`);
  console.log(`  Recall:            ${(recall * 100).toFixed(1)}%  (target >= 80%)`);
  console.log(`  F1 score:          ${(f1 * 100).toFixed(1)}%`);
  console.log(`  False positive rate: ${(fpRate * 100).toFixed(1)}%  (target <= 10%)`);
  console.log(`\n  Risk level exact match:   ${riskExact}/${valid.length}`);
  console.log(`  Risk level within 1 level: ${riskClose}/${valid.length}`);
  console.log(`  Risk score in range:       ${scoreOk}/${valid.length}`);
  console.log(`\n  Overall (all checks):      ${overallOk}/${valid.length} (${(overallOk/valid.length*100).toFixed(1)}%)`);

  // Targets from LEGAL_ACCURACY_ROADMAP: Precision >= 0.85, Recall >= 0.80, FP rate <= 0.10
  const meetsTarget = precision >= 0.85 && recall >= 0.80 && fpRate <= 0.10;

  console.log("\n" + "-".repeat(70));
  if (meetsTarget) {
    console.log("  OVERALL: PASS (meets precision >= 85%, recall >= 80%, FP rate <= 10%)");
  } else {
    console.log("  OVERALL: FAIL");
    if (precision < 0.85) console.log(`    - Precision ${(precision*100).toFixed(1)}% < 85% target`);
    if (recall < 0.80)    console.log(`    - Recall ${(recall*100).toFixed(1)}% < 80% target`);
    if (fpRate > 0.10)    console.log(`    - FP rate ${(fpRate*100).toFixed(1)}% > 10% target`);
  }
  console.log("-".repeat(70) + "\n");

  process.exit(meetsTarget ? 0 : 1);
}

main().catch((err) => {
  console.error("[fatal]", err.message);
  process.exit(1);
});
