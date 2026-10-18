// Phase 7 — the sealed hold-out run. Execute ONCE, record, no retuning.
// Usage: node --env-file=.env eval/run-holdout.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestLease } from '../pipeline/ingest.mjs';
import { extractLease } from '../pipeline/extract.mjs';
import { db } from '../pipeline/graph-write.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gold = JSON.parse(readFileSync(join(ROOT, 'eval', 'holdout', 'gold-holdout.json'), 'utf8')).leases;
const results = {};

for (const g of gold) {
  const pdf = join(ROOT, 'eval', 'holdout', 'pdfs', `${g.id}.pdf`);
  console.log(`— holdout ${g.id}: ingest + extract (once)`);
  await ingestLease(pdf, g.id);
  const r = await extractLease(g.id);
  results[g.id] = r;
  console.log(`  ${r.latencyMs}ms, ungrounded: ${r.validation.length ? r.validation.join(',') : 'none'}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(ROOT, 'eval', 'runs', `holdout-${stamp}`);
mkdirSync(runDir, { recursive: true });
writeFileSync(join(runDir, 'extracted.json'), JSON.stringify(results, null, 2));
writeFileSync(join(ROOT, 'eval', 'holdout', 'extracted.json'), JSON.stringify(results, null, 2));
console.log('extracted.json written:', runDir);
await (await db()).close();
process.exit(0);
