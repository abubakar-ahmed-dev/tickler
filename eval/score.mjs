// Score extraction runs against gold answers.
// Usage: node --env-file=.env eval/score.mjs [runDir] [--gold <path>] [--extracted <path>]
//   defaults: latest eval/runs/<ts> vs eval/gold.json (dev set)
//   holdout:  --gold eval/holdout/gold-holdout.json --extracted eval/holdout/extracted.json
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const goldPath = opt('gold') ?? join(ROOT, 'eval', 'gold.json');
const gold = JSON.parse(readFileSync(resolve(goldPath), 'utf8')).leases;

const norm = s => String(s ?? '').trim();
const num = v => { const n = parseFloat(String(v ?? '').replace(/[$,%\s,]/g, '')); return Number.isFinite(n) ? n : null; };
const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);

const FIELD_CMP = {
  term_start: [date], term_end: [date],
  monthly_rent: [num], deposit: [num], deposit_return_days: [num],
  notice_days: [num, v => (v == null ? null : 'has-value')], // gold null must match 'unknown'
  escalation_type: [norm], escalation_pct: [num],
  late_fee_amount: [num], late_grace_days: [num],
};
// gold profile keys → extraction field keys
const GOLD_KEY = { escalation_type: 'esc_variant', escalation_pct: 'esc_pct' };

function fieldScore(out, g) {
  let ok = 0, total = 0; const misses = [];
  for (const [key, fns] of Object.entries(FIELD_CMP)) {
    total++;
    const gv = g.fields[GOLD_KEY[key] ?? key];
    const ov = out.fields?.[key]?.value;
    let goldV = gv, gotV = ov;
    for (const fn of fns) { goldV = fn(goldV); gotV = fn(gotV); }
    const match = goldV === gotV || (goldV == null && gotV == null) ||
                  (goldV == null && norm(ov) === 'unknown');
    if (match) ok++; else misses.push({ key, gold: gv, got: ov });
  }
  // escalation_date: gold lives in the deadlines array (absent when no in-term escalation)
  total++;
  const goldEsc = g.deadlines.find(d => d.type === 'escalation' && !d.needs_review);
  const goldDate = goldEsc?.date ?? null;
  const gotRaw = out.fields?.escalation_date?.value;
  const gotDate = date(gotRaw);
  const match = (goldDate && gotDate === goldDate) || (!goldDate && (gotDate == null || norm(gotRaw) === 'unknown'));
  if (match) ok++; else misses.push({ key: 'escalation_date', gold: goldDate, got: gotRaw });
  return { ok, total, misses };
}

function deadlineScore(out, g) {
  const od = out.deadlines ?? [];
  let ok = 0; const detail = [];
  for (const gd of g.deadlines) {
    const match = od.find(d => d.type === gd.type);
    let hit = false;
    if (gd.needs_review) hit = match?.needs_review === true;
    else hit = match && !match.needs_review && date(match.date) === gd.date;
    if (hit) ok++; else detail.push({ type: gd.type, gold: gd, got: match ?? null });
  }
  // penalize hallucinated deadline types
  const extra = od.filter(d => !g.deadlines.some(gd => gd.type === d.type && !gd.needs_review));
  return { ok, total: g.deadlines.length, misses: detail, extra: extra.map(e => e.type) };
}

const runsDir = join(ROOT, 'eval', 'runs');
const extractedPath = opt('extracted');
let runDir;
let extracted;
if (extractedPath) {
  runDir = dirname(resolve(extractedPath));
  extracted = JSON.parse(readFileSync(resolve(extractedPath), 'utf8'));
} else {
  let runArg = argv.find(a => !a.startsWith('--') && a !== opt('gold'));
  if (!runArg) {
    const runs = readdirSync(runsDir).filter(d => existsSync(join(runsDir, d, 'extracted.json'))).sort();
    if (!runs.length) { console.error('no runs found in eval/runs — run pipeline/extract.mjs --all-dev first'); process.exit(1); }
    runArg = runs.at(-1);
  }
  runDir = existsSync(runArg) && !runArg.includes('json') ? runArg : join(runsDir, runArg);
  extracted = JSON.parse(readFileSync(join(runDir, 'extracted.json'), 'utf8'));
}

let fOk = 0, fTotal = 0, dOk = 0, dTotal = 0, latency = 0, tokens = 0;
const perLease = [];
for (const g of gold) {
  const out = extracted[g.id];
  if (!out) { perLease.push({ id: g.id, error: 'missing' }); continue; }
  const f = fieldScore(out, g), d = deadlineScore(out, g);
  fOk += f.ok; fTotal += f.total; dOk += d.ok; dTotal += d.total;
  latency += out.latencyMs ?? 0; tokens += (out.usage?.completion_tokens ?? 0) + (out.usage?.prompt_tokens ?? 0);
  perLease.push({ id: g.id, fields: `${f.ok}/${f.total}`, deadlines: `${d.ok}/${d.total}`, fieldMisses: f.misses, deadlineMisses: d.misses, ungrounded: out.validation });
}

const report = {
  run: runDir,
  fieldAccuracy: `${fOk}/${fTotal} = ${(100 * fOk / fTotal).toFixed(1)}%`,
  deadlineAccuracy: `${dOk}/${dTotal} = ${(100 * dOk / dTotal).toFixed(1)}%`,
  avgLatencyMs: Math.round(latency / gold.length),
  avgTokensPerLease: Math.round(tokens / gold.length),
  perLease,
};
console.log(JSON.stringify(report, null, 2));
mkdirSync(runDir, { recursive: true });
writeFileSync(join(runDir, 'score.json'), JSON.stringify(report, null, 2));
