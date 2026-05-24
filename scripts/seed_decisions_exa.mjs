#!/usr/bin/env node
/**
 * seed_decisions_exa.mjs
 *
 * Uses Exa REST API to find and fetch real Ontario LTB decisions from canlii.org,
 * then saves them as .txt files in scripts/source-docs/ltb_decisions/ ready for
 * seed_decisions_manual.py to embed and upsert into Supabase.
 *
 * Priority targets (in order):
 *   1. New violation types with zero tribunal decisions:
 *      - early_termination_fee  → clause_type: early_termination
 *      - surveillance_in_unit   → clause_type: quiet_enjoyment
 *      - guest_surcharge        → clause_type: guest_policy
 *      - assignment_fee         → clause_type: subletting_assignment
 *   2. Underrepresented existing types:
 *      - maintenance_repairs (4 decisions), dispute_resolution (3), rent_increase (4), quiet_enjoyment (4)
 *
 * Usage:
 *   node scripts/seed_decisions_exa.mjs
 *   node scripts/seed_decisions_exa.mjs --dry-run   (search + print, no files written)
 *
 * After running, seed new files into Supabase:
 *   python scripts/seed_decisions_manual.py
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DECISIONS_DIR = join(PROJECT_ROOT, 'scripts', 'source-docs', 'ltb_decisions');

// ---------------------------------------------------------------------------
// Load env from .env.local then .env
// ---------------------------------------------------------------------------
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = join(PROJECT_ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}
loadEnv();

const EXA_API_KEY = process.env.EXA_API_KEY;
if (!EXA_API_KEY) {
  console.error('❌  EXA_API_KEY not found. Add it to .env or set it in the environment.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Search targets — ordered by priority
// clause_type must be a VALID_CLAUSE_TYPE recognised by seed_decisions_manual.py
// ---------------------------------------------------------------------------
const SEARCH_TARGETS = [
  // ── NEW violation types (zero decisions currently) ──────────────────────
  {
    clause_type: 'early_termination',
    label: 'early termination fee (new violation — zero decisions)',
    queries: [
      'Ontario Landlord Tenant Board decision lease break fee early termination penalty clause void section 134 RTA fixed term tenancy prohibited charge tenant won',
      'Ontario LTB ruling liquidated damages clause fixed term tenancy unenforceable tenant application T1 section 3 37 134 residential tenancy act',
    ],
    target: 5,
  },
  {
    clause_type: 'quiet_enjoyment',
    label: 'surveillance in unit (new violation — zero decisions)',
    queries: [
      'Ontario Landlord Tenant Board decision landlord installed surveillance camera recording device inside rental unit tenant privacy rights section 22 23 RTA harassment substantial interference',
      'Ontario LTB tenant application T2 landlord camera inside apartment unit substantial interference quiet enjoyment tenant won abatement remedy',
    ],
    target: 5,
  },
  {
    clause_type: 'guest_policy',
    label: 'guest surcharge (new violation — zero decisions)',
    queries: [
      'Ontario Landlord Tenant Board decision landlord charged fee surcharge overnight guests visitors rental unit void section 134 RTA prohibited charge tenant application',
      'Ontario LTB ruling guest fee policy clause lease agreement unenforceable tenant cannot be charged additional money for guests residential tenancy act',
    ],
    target: 5,
  },
  {
    clause_type: 'subletting_assignment',
    label: 'assignment fee (new violation — zero decisions)',
    queries: [
      'Ontario Landlord Tenant Board decision landlord charged assignment fee sublet withheld consent unlawfully section 95 97 RTA tenant application T2',
      'Ontario LTB ruling assignment sublet refused landlord required consent unreasonably withheld fee charged void section 97 134 residential tenancies act',
    ],
    target: 5,
  },
  // ── Underrepresented existing types ─────────────────────────────────────
  {
    clause_type: 'maintenance_repairs',
    label: 'maintenance & repairs (currently 4 decisions)',
    queries: [
      'Ontario Landlord Tenant Board decision landlord failed maintain rental unit good repair section 20 RTA T6 application tenant disrepair uninhabitable ordered remedy',
      'Ontario LTB decision maintenance obligation landlord breach section 20 21 RTA repair order abatement awarded tenant won',
    ],
    target: 5,
  },
  {
    clause_type: 'dispute_resolution',
    label: 'dispute resolution / mandatory arbitration (currently 3 decisions)',
    queries: [
      'Ontario Landlord Tenant Board decision mandatory arbitration clause lease agreement void unenforceable tenant cannot waive right board hearing section 3 RTA',
      'Ontario LTB ruling arbitration clause residential tenancy agreement prohibited waiver of rights section 3 47 tenant right apply board preserved',
    ],
    target: 5,
  },
  {
    clause_type: 'rent_increase',
    label: 'rent increase (expand to 7+)',
    queries: [
      'Ontario Landlord Tenant Board decision rent increase without proper notice section 116 void unenforceable tenant application T1 illegal charge collected',
      'Ontario LTB ruling above guideline rent increase AGI application capital expenditure section 126 RTA tenant objection denied',
    ],
    target: 4,
  },
  {
    clause_type: 'quiet_enjoyment',
    label: 'quiet enjoyment — additional (expand to 7+)',
    queries: [
      'Ontario Landlord Tenant Board decision substantial interference quiet enjoyment section 22 RTA landlord harassment T2 application remedy rent abatement',
      'Ontario LTB ruling noise interference landlord acts substantially interfered tenant enjoyment section 22 23 remedy ordered',
    ],
    target: 3,
  },
  {
    clause_type: 'pets',
    label: 'pets (expand coverage)',
    queries: [
      'Ontario Landlord Tenant Board decision no pets clause lease agreement void unenforceable section 14 RTA tenant kept pet landlord cannot evict',
      'Ontario LTB ruling pet restriction clause residential tenancy void section 14 act tenant right keep pet allergy exception',
    ],
    target: 3,
  },
];

// ---------------------------------------------------------------------------
// Exa REST API
// ---------------------------------------------------------------------------
async function exaSearch(query, numResults = 8) {
  const resp = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': EXA_API_KEY,
    },
    body: JSON.stringify({
      query,
      numResults,
      includeDomains: ['canlii.org', 'tribunalsontario.ca'],
      contents: {
        text: { maxCharacters: 10000 },
        highlights: { numSentences: 5, highlightsPerUrl: 3 },
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Exa search HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------
function slugFromUrl(url) {
  // CanLII: .../2023onltb12345/... → 2023ONLTB12345
  const m = url.match(/\/(\d{4}onltb\d+)\//i);
  if (m) return m[1].toUpperCase();
  // Fallback: sanitise last path segment
  const seg = url.replace(/\/$/, '').split('/').pop() ?? '';
  return seg.replace(/[^a-z0-9]/gi, '-').toUpperCase().slice(0, 40) || `EXA-${Date.now()}`;
}

function extractDate(result) {
  if (result.publishedDate) return result.publishedDate.slice(0, 10);
  const m = result.url?.match(/\/(\d{4})on/);
  return m ? `${m[1]}-01-01` : new Date().toISOString().slice(0, 10);
}

function cleanText(raw = '') {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/\[object Object\]/g, '')
    .trim();
}

function formatDecision(result, clauseType) {
  const date = extractDate(result);
  const url = result.url ?? '';
  const title = (result.title ?? 'Ontario LTB Decision').trim();
  const body = cleanText(result.text ?? result.highlights?.join('\n\n') ?? '');

  const meta = `#meta: date=${date}, clause_types=${clauseType}, url=${url}`;
  const header = `ONTARIO LANDLORD AND TENANT BOARD\n\n${title}`;

  return [meta, '', header, '', body, ''].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const existingFiles = new Set(
    readdirSync(DECISIONS_DIR)
      .filter(f => f.endsWith('.txt'))
      .map(f => f.toLowerCase())
  );

  console.log(`\n📂  Corpus: ${existingFiles.size} decision files already on disk`);
  console.log(`🔑  Exa API key: ${EXA_API_KEY.slice(0, 8)}...`);
  if (DRY_RUN) console.log('⚠️   DRY RUN — files will be printed but not written\n');
  console.log();

  let totalSaved = 0;
  const seenUrls = new Set();

  for (const target of SEARCH_TARGETS) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📌  ${target.label}`);
    console.log(`    clause_type: ${target.clause_type} | target: ${target.target} new files`);

    let savedForTarget = 0;

    for (const query of target.queries) {
      if (savedForTarget >= target.target) break;

      console.log(`\n  🔎  "${query.slice(0, 72)}..."`);

      let results = [];
      try {
        const data = await exaSearch(query, 8);
        results = data.results ?? [];
        console.log(`       → ${results.length} results from Exa`);
      } catch (err) {
        console.log(`  ⚠️   Search error: ${err.message}`);
        await sleep(1000);
        continue;
      }

      for (const result of results) {
        if (savedForTarget >= target.target) break;

        const url = result.url ?? '';

        // Must be an actual LTB decision page
        if (!url.includes('onltb') && !url.match(/ltb.*doc/i)) {
          console.log(`  ⏭   Not LTB decision page: ${url.slice(0, 60)}`);
          continue;
        }
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        const text = result.text ?? '';
        if (text.length < 300) {
          console.log(`  ⚠️   Too short (${text.length} chars): ${url.slice(0, 60)}`);
          continue;
        }

        const slug = slugFromUrl(url);
        const filename = `${slug}.txt`;
        const filepath = join(DECISIONS_DIR, filename);

        if (existingFiles.has(filename.toLowerCase()) || existsSync(filepath)) {
          console.log(`  ⏭   Already exists: ${filename}`);
          continue;
        }

        const content = formatDecision(result, target.clause_type);

        if (!DRY_RUN) {
          writeFileSync(filepath, content, 'utf-8');
          existingFiles.add(filename.toLowerCase()); // prevent double-write within same run
        }

        const dateStr = extractDate(result);
        console.log(`  ✅  ${DRY_RUN ? '[DRY] ' : ''}${filename}  (${text.length} chars, ${dateStr})`);
        savedForTarget++;
        totalSaved++;

        await sleep(350); // polite pacing
      }

      await sleep(600);
    }

    console.log(`\n  → ${savedForTarget} new file(s) saved for "${target.clause_type}"`);
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`✅  Done. ${totalSaved} new decision file(s) ${DRY_RUN ? 'would be ' : ''}written.`);
  console.log(`📂  Output: ${DECISIONS_DIR}`);

  if (!DRY_RUN && totalSaved > 0) {
    console.log(`\nNext step:`);
    console.log(`  python scripts/seed_decisions_manual.py`);
    console.log(`\nThen verify row counts:`);
    console.log(`  node -e "const{createClient}=require('@supabase/supabase-js');require('dotenv').config({path:'.env'});const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);sb.from('tribunal_decisions').select('id',{count:'exact',head:true}).then(r=>console.log('tribunal_decisions:',r.count));"`);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  console.error('\n❌  Fatal:', err.message);
  process.exit(1);
});
