// The four golden questions — the Concierge's acceptance bar.
// Usage: node --env-file=.env eval/golden.mjs
import { ask } from '../agent/concierge.mjs';
import { remember } from '../agent/tools.mjs';
import { db } from '../pipeline/graph-write.mjs';

// seed procedural memory from the recorded human correction (lease-05, Phase 4)
const seeded = await remember({
  kind: 'procedural',
  content: 'Landlord corrected notice_days on lease-05 from "unknown" to 60 — prefers explicit 60-day renewal windows recorded even when the lease clause is ambiguous.',
  about_lease_id: 'lease-05',
});
console.error(`[seeded procedural memory: ${JSON.stringify(seeded)}]`);

const GOLDEN = [
  {
    q: 'What deadlines are coming up in the next two years?',
    opts: {},
    must: ['tool:next_deadlines', /\d{4}-\d{2}-\d{2}/],
  },
  {
    q: 'Why does lease-05 have a term end deadline, and what does the lease actually say about it?',
    opts: { leaseId: 'lease-05' },
    must: ['tool:lineage', /page/i],
  },
  {
    q: 'Draft the renewal notice letter for lease-05.',
    opts: { leaseId: 'lease-05' },
    must: ['tool:request_draft', /pending|draft/i],
  },
  {
    q: 'How does this landlord usually handle renewal notice windows?',
    opts: { leaseId: 'lease-05' },
    must: ['tool:recall', /60/i],
  },
];

const clean = s => String(s).replace(/[‐-―]/g, '-'); // model outputs fancy hyphens
let pass = 0;
for (const [i, g] of GOLDEN.entries()) {
  console.log(`\n=== Q${i + 1}: ${g.q}`);
  const r = await ask(g.q, {
    ...g.opts,
    onEvent: e => console.log(`  → ${e.name}`),
  });
  const answer = clean(r.answer);
  const checks = g.must.map(m => {
    if (typeof m === 'string') return { m, ok: r.toolsUsed.includes(m.replace('tool:', '')) };
    return { m: String(m), ok: m.test(answer) };
  });
  const ok = checks.every(c => c.ok);
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'} (tools: ${r.toolsUsed.join(',') || 'none'})`);
  for (const c of checks) if (!c.ok) console.log(`  missed: ${c.m}`);
  console.log(`  answer: ${r.answer.slice(0, 400).replace(/\n+/g, ' ')}`);
}
console.log(`\n=== GOLDEN: ${pass}/${GOLDEN.length} passed`);
await (await db()).close();
process.exit(0);
