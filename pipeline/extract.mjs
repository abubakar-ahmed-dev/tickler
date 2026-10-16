// Extraction: lease pages (from the graph) → structured clauses with verbatim
// quotes → computed deadlines → graph writes. Model = Groq gpt-oss-120b,
// temperature 0, JSON-schema output. "unknown" is a valid, preferred answer.
// Deadlines are computed IN CODE from extracted values — never by the model.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROQ_BASE, GROQ_KEY, MODEL_STRONG } from '../shared/config.mjs';
import { graph, db } from './graph-write.mjs';

const FIELD_KEYS = [
  'term_start', 'term_end', 'monthly_rent', 'deposit', 'deposit_return_days',
  'notice_days', 'escalation_type', 'escalation_pct', 'escalation_date',
  'escalation_new_rent', 'late_fee_amount', 'late_fee_pct', 'late_grace_days',
  'landlord_name', 'tenant_name',
];

const SYSTEM = `You extract structured facts from residential lease documents for a deadline-tracking tool.

Rules:
1. Every non-unknown fact MUST include quote_text: an EXACT character-for-character copy of the supporting text as it appears in the provided page content (whitespace may differ, wording may not).
2. If a fact is not stated in the document, set value to "unknown" and quote_text to "". Never infer, never compute, never guess.
3. Normalize values: dates as YYYY-MM-DD; money as plain digits without symbols/commas; percentages as plain digits (2.5 not "two and one-half percent"); durations as plain digit count of days.
4. escalation_type must be exactly one of: "anniversary", "fixed", "cpi", "none", "unknown". "none" means the lease explicitly says rent stays constant.
5. quote_page = the 0-based index of the page the quote came from.
6. confidence = 0..1, your honest certainty that the quote supports the value.`;

const USER_TMPL = (pages) =>
  pages.map((t, i) => `===== PAGE ${i} =====\n${t}`).join('\n\n') +
  `\n\nExtract every field listed in the schema from this lease.`;

function buildSchema() {
  const fieldShape = {
    type: 'object',
    properties: {
      value: { type: 'string' },
      quote_text: { type: 'string' },
      quote_page: { type: 'number' },
      confidence: { type: 'number' },
    },
    required: ['value', 'quote_text', 'quote_page', 'confidence'],
  };
  const properties = {}, required = [];
  for (const k of FIELD_KEYS) { properties[k] = fieldShape; required.push(k); }
  return {
    type: 'object',
    properties: { fields: { type: 'object', properties, required } },
    required: ['fields'],
  };
}

/** Whitespace-insensitive verbatim check — the grounding invariant. */
export function groundingOk(pageText, quoteText) {
  const norm = s => s.replace(/\s+/g, ' ').trim();
  return norm(pageText).includes(norm(quoteText));
}

async function callModel(pages) {
  const body = JSON.stringify({
    model: MODEL_STRONG,
    temperature: 0,
    response_format: { type: 'json_schema', json_schema: { name: 'lease_extraction', schema: buildSchema() } },
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER_TMPL(pages) }],
  });
  // Free-tier TPM limit: retry with the server-suggested backoff.
  for (let attempt = 1; attempt <= 6; attempt++) {
    const attemptStart = Date.now();
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${GROQ_KEY}` },
      body,
    });
    if (res.ok) {
      const data = await res.json();
      return { content: JSON.parse(data.choices[0].message.content), usage: data.usage ?? {}, model: data.model, apiLatencyMs: Date.now() - attemptStart };
    }
    const text = await res.text();
    if (res.status === 429 && attempt < 6) {
      const m = text.match(/try again in ([\d.]+)s/i);
      const wait = m ? parseFloat(m[1]) + 2 : 25 * attempt;
      console.error(`  rate-limited, waiting ${wait.toFixed(1)}s (attempt ${attempt}/6)`);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`);
  }
}

// --- value parsing (code-side, for deadline computation) -----------------
const parseDate = v => {
  if (!v || v === 'unknown') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) { const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const mi = months.indexOf(m[1]); if (mi >= 0) return `${m[3]}-${String(mi+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`; }
  return null;
};
const parseNum = v => {
  if (!v || v === 'unknown') return null;
  const n = parseFloat(String(v).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const addDays = (iso, days) => new Date(new Date(iso + 'T00:00:00Z').getTime() + days * 86400000).toISOString().slice(0, 10);
const addYears = (iso, y) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + y); return d.toISOString().slice(0, 10); };

/** Deadlines computed from extracted fields — mirrors corpus/generate.mjs gold logic. */
export function computeDeadlines(f) {
  const out = [];
  const termEnd = parseDate(f.term_end?.value);
  const termStart = parseDate(f.term_start?.value);
  if (termEnd) out.push({ type: 'term_end', date: termEnd, needs_review: false });

  const noticeDays = parseNum(f.notice_days?.value);
  if (termEnd && noticeDays != null && noticeDays > 0) {
    out.push({ type: 'notice', date: addDays(termEnd, -noticeDays), needs_review: false });
  } else {
    out.push({ type: 'notice', date: null, needs_review: true,
      reason: 'Notice window not stated or not quantified' });
  }

  const escType = (f.escalation_type?.value ?? 'unknown').toLowerCase();
  if (escType === 'fixed') {
    const d = parseDate(f.escalation_date?.value);
    if (d && termEnd && d <= termEnd) out.push({ type: 'escalation', date: d, needs_review: false });
    else out.push({ type: 'escalation', date: null, needs_review: true, reason: 'Fixed escalation date missing/outside term' });
  } else if (escType === 'anniversary') {
    if (termStart && termEnd) {
      const anniv = addYears(termStart, 1);
      if (anniv <= termEnd) out.push({ type: 'escalation', date: anniv, needs_review: false });
      // anniversary after term end → no in-term deadline (gold logic agrees)
    }
  } else if (escType === 'cpi') {
    out.push({ type: 'escalation', date: null, needs_review: true, reason: 'Escalation unquantified (CPI-indexed)' });
  }
  // escType 'none' or 'unknown' → no escalation deadline

  const depDays = parseNum(f.deposit_return_days?.value);
  if (termEnd && depDays != null) out.push({ type: 'deposit_return', date: addDays(termEnd, depDays), needs_review: false });
  return out;
}

/** Extract one lease (by id) using its pages already stored in the graph. */
export async function extractLease(leaseId) {
  const g = await graph();
  const pagesRes = await g.query(
    'MATCH (:Lease {id:$id})-[:HAS_PAGE]->(p:Page) RETURN p.idx AS idx, p.text AS text ORDER BY p.idx',
    { params: { id: leaseId } });
  if (!pagesRes.data.length) throw new Error(`No pages in graph for ${leaseId} — ingest first.`);
  const pages = pagesRes.data.map(r => r.text);

  await g.query(`MATCH (l:Lease {id:$id}) SET l.status='extracting'`, { params: { id: leaseId } });
  const t0 = Date.now();
  const { content, usage, model, apiLatencyMs } = await callModel(pages);
  const latencyMs = apiLatencyMs ?? (Date.now() - t0); // pure API time, excludes rate-limit backoff

  const fields = content.fields;
  // grounding validation at write time — the model's quotes are never trusted
  const validation = [];
  for (const k of FIELD_KEYS) {
    const f = fields[k];
    f.key = k;
    if (f.value !== 'unknown' && f.quote_text) {
      const page = pages[f.quote_page] ?? '';
      f.grounded = groundingOk(page, f.quote_text);
    } else f.grounded = null;
    if (f.grounded === false) validation.push(k);
  }
  const deadlines = computeDeadlines(fields);

  await writeExtraction(leaseId, fields, deadlines, validation);
  return { leaseId, fields, deadlines, validation, usage, model, latencyMs };
}

// --- graph writes (the only place Clause/Quote/Field/Deadline are created)
async function writeExtraction(leaseId, fields, deadlines, failedValidation) {
  const g = await graph();
  // wipe prior extraction subtree
  await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(c:Clause)
     OPTIONAL MATCH (c)-[:GROUNDS]->(q:Quote)
     OPTIONAL MATCH (c)-[:YIELDS]->(fl:Field)
     OPTIONAL MATCH (c)-[:DERIVES]->(d:Deadline)
     DETACH DELETE q, fl, d, c WITH 1 AS x
     MATCH (l:Lease {id:$id}) OPTIONAL MATCH (l)-[:HAS_PARTY]->(pa:Party) DETACH DELETE pa`,
    { params: { id: leaseId } });

  const mkClause = async (type) => {
    await g.query(
      `MATCH (l:Lease {id:$id}) CREATE (l)-[:HAS_CLAUSE]->(:Clause {type:$type, status:'extracted'})`,
      { params: { id: leaseId, type } });
    const c = await g.query(
      `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(c:Clause {type:$type}) RETURN id(c) AS cid`,
      { params: { id: leaseId, type } });
    return c.data[0].cid;
  };
  const addField = async (cid, key, value, confidence, approved) => {
    await g.query(
      `MATCH (c) WHERE id(c)=$cid
       CREATE (c)-[:YIELDS]->(:Field {key:$key, value:$value, confidence:$conf, approved:$approved})`,
      { params: { cid, key, value: String(value), conf: confidence ?? 0, approved } });
  };

  const groups = {
    term: ['term_start', 'term_end'],
    rent: ['monthly_rent'],
    escalation: ['escalation_type', 'escalation_pct', 'escalation_date', 'escalation_new_rent'],
    deposit: ['deposit', 'deposit_return_days'],
    renewal_notice: ['notice_days'],
    late_fee: ['late_fee_amount', 'late_fee_pct', 'late_grace_days'],
    parties: ['landlord_name', 'tenant_name'],
  };
  for (const [clauseType, keys] of Object.entries(groups)) {
    const cid = await mkClause(clauseType);
    for (const k of keys) {
      const f = fields[k];
      if (!f) continue;
      const known = f.value !== 'unknown';
      if (known && f.quote_text && f.grounded !== false) {
        // reuse the lease's real Page node instead of creating a duplicate
        await g.query(
          `MATCH (c) WHERE id(c)=$cid
           MATCH (:Lease {id:$lease})-[:HAS_PAGE]->(p:Page {idx:$page})
           CREATE (c)-[:GROUNDS]->(:Quote {text:$text, pageIdx:$page})-[:FROM_PAGE]->(p)`,
          { params: { cid, lease: leaseId, page: f.quote_page, text: f.quote_text } });
      }
      await addField(cid, k, f.value, f.confidence, false);
    }
  }

  for (const d of deadlines) {
    const clauseType = d.type === 'term_end' ? 'term' : d.type === 'notice' ? 'renewal_notice'
      : d.type === 'escalation' ? 'escalation' : 'deposit';
    await g.query(
      `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(c:Clause {type:$ct})
       CREATE (c)-[:DERIVES]->(:Deadline {type:$type, date:$date, needsReview:$nr, reason:$reason})`,
      { params: { id: leaseId, ct: clauseType, type: d.type, date: d.date ?? 'unknown',
                  nr: d.needs_review, reason: d.reason ?? '' } });
  }

  const anyFailed = failedValidation.length > 0;
  await g.query(
    `MATCH (l:Lease {id:$id}) SET l.status='awaiting_review', l.extractClean=$clean`,
    { params: { id: leaseId, clean: !anyFailed } });
}

// CLI: node pipeline/extract.mjs <leaseId> | --all-dev
if (process.argv[1] && process.argv[1].endsWith('extract.mjs')) {
  const arg = process.argv[2];
  const allDev = arg === '--all-dev';
  const ids = allDev
    ? JSON.parse(readFileSync(new URL('../eval/gold.json', import.meta.url), 'utf8')).leases.map(l => l.id)
    : [arg];
  const results = {};
  for (const id of ids) {
    try {
      const r = await extractLease(id);
      results[id] = r;
      console.log(`${id}: ${r.latencyMs}ms, in=${r.usage.prompt_tokens ?? '?'} out=${r.usage.completion_tokens ?? '?'} — validation failures: ${r.validation.length ? r.validation.join(',') : 'none'}`);
    } catch (e) {
      console.error(`${id} FAILED: ${e.message}`);
    }
  }
  if (allDev) {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const runDir = new URL(`../eval/runs/${new Date().toISOString().replace(/[:.]/g, '-')}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'extracted.json'), JSON.stringify(results, null, 2));
    console.log('run saved:', runDir);
  }
  await (await db()).close();
  process.exit(0);
}
