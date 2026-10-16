// The Concierge's six tools. Each is a Cypher query (or short chain) against
// FalkorDB — the graph decides what the agent knows. Contracts: shared/tools.ts.
// The same implementations are exposed over MCP in agent/mcp-server.mjs.
import { graph } from '../pipeline/graph-write.mjs';
import { groqChat } from '../shared/groq.mjs';
import { MODEL_FAST } from '../shared/config.mjs';

export const TOOL_SPECS = [
  {
    name: 'next_deadlines',
    description: 'Upcoming deadlines across the portfolio within a horizon of days from today.',
    parameters: {
      type: 'object',
      properties: { horizon_days: { type: 'number', description: 'default 30' } },
    },
  },
  {
    name: 'lineage',
    description: 'Why does a deadline/reminder exist? Walks Reminder→Deadline→Clause→Quote→Page and returns the explanation chain ending in the verbatim source text.',
    parameters: {
      type: 'object',
      properties: {
        lease_id: { type: 'string' },
        deadline_type: { type: 'string', enum: ['term_end', 'notice', 'escalation', 'deposit_return'] },
        reminder_id: { type: 'string', description: 'optional, if known' },
      },
      required: ['lease_id', 'deadline_type'],
    },
  },
  {
    name: 'find_lease',
    description: 'Find leases by title, address fragment, or party name (case-insensitive contains).',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'recall',
    description: 'Recall memory: semantic facts, episodic history, or procedural preferences (how this user handled things before).',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['semantic', 'episodic', 'procedural'] },
        about_lease_id: { type: 'string' },
        topic: { type: 'string' },
      },
    },
  },
  {
    name: 'remember',
    description: 'Persist a memory for future sessions (semantic fact, episodic note, procedural preference).',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['semantic', 'episodic', 'procedural'] },
        content: { type: 'string' },
        about_lease_id: { type: 'string' },
      },
      required: ['kind', 'content'],
    },
  },
  {
    name: 'request_draft',
    description: 'Hand off to the Drafter: compose a notice letter for a lease, grounded ONLY in that lease\'s stored clause quotes. Returns the pending draft (human must approve it later).',
    parameters: {
      type: 'object',
      properties: {
        lease_id: { type: 'string' },
        draft_kind: { type: 'string', enum: ['renewal_notice', 'termination_notice'] },
      },
      required: ['lease_id', 'draft_kind'],
    },
  },
];

const today = () => new Date().toISOString().slice(0, 10);

export async function nextDeadlines({ horizon_days = 30 } = {}) {
  const g = await graph();
  // dates stored as ISO strings — lexicographic comparison, end computed in JS
  const end = new Date(Date.now() + Math.round(horizon_days) * 86400000).toISOString().slice(0, 10);
  const r = await g.query(
    `MATCH (l:Lease)-[:HAS_CLAUSE]->(:Clause)-[:DERIVES]->(d:Deadline)
     WHERE d.needsReview = false AND d.date <> 'unknown'
       AND d.date >= $today AND d.date <= $end
     OPTIONAL MATCH (d)-[:SCHEDULED]->(rem:Reminder {state:'scheduled'})
     RETURN l.id AS leaseId, l.title AS lease, d.type AS type, d.date AS date,
            count(rem) AS scheduledReminders
     ORDER BY d.date LIMIT 25`,
    { params: { today: today(), end } });
  return r.data;
}

export async function lineage({ lease_id, deadline_type, reminder_id }) {
  const g = await graph();
  const { q, params } = reminder_id
    ? { q: 'MATCH (r:Reminder {id:$rid})-[:SCHEDULED]-(d:Deadline)', params: { rid: reminder_id } }
    : { q: 'MATCH (l:Lease {id:$lid})-[:HAS_CLAUSE]->(c:Clause)-[:DERIVES]->(d:Deadline {type:$dtype})', params: { lid: lease_id, dtype: deadline_type } };
  const r = await g.query(
    `${q}
     OPTIONAL MATCH (d)-[:DERIVES]-(cl:Clause)-[:GROUNDS]->(q:Quote)-[:FROM_PAGE]->(p:Page)
     RETURN d.type AS deadlineType, d.date AS deadlineDate, d.needsReview AS needsReview, d.reason AS reason,
            cl.type AS clauseType,
            collect(DISTINCT {quote: q.text, page: p.idx})[0..3] AS evidence,
            [(d)-[:SCHEDULED]->(rem:Reminder) | {id: rem.id, state: rem.state}] AS reminders`,
    { params });
  const row = r.data[0];
  if (!row) return { error: 'no deadline found for that lease/type' };
  return {
    deadline: { type: row.deadlineType, date: row.deadlineDate, needsReview: row.needsReview, reason: row.reason },
    clause: row.clauseType,
    chain: [
      { step: 'deadline', detail: `${row.deadlineType} on ${row.deadlineDate}${row.needsReview ? ' (needs review: ' + row.reason + ')' : ''}` },
      { step: 'clause', detail: `clause type "${row.clauseType}"` },
      ...((row.evidence ?? []).filter(e => e.quote).map(e => ({ step: 'quote', detail: `"${e.quote}" (page ${e.page ?? '?'})` }))),
    ],
    reminders: row.reminders,
  };
}

export async function findLease({ query }) {
  const g = await graph();
  const r = await g.query(
    `MATCH (l:Lease) WHERE toLower(l.title) CONTAINS toLower($q) OR l.id CONTAINS toLower($q)
     OPTIONAL MATCH (l)-[:HAS_PARTY]->(pa:Party)
     OPTIONAL MATCH (l)-[:HAS_CLAUSE]->(:Clause)-[:DERIVES]->(d:Deadline {needsReview:true})
     RETURN l.id AS id, l.title AS title, l.status AS status,
            collect(DISTINCT pa.name)[0..4] AS parties,
            count(DISTINCT d) AS needsReviewCount
     ORDER BY l.id LIMIT 10`,
    { params: { q: String(query) } });
  return r.data;
}

export async function recall({ kind, about_lease_id: aboutLease, topic } = {}) {
  const g = await graph();
  const conds = [], params = {};
  if (kind) { conds.push('m.kind = $kind'); params.kind = kind; }
  if (aboutLease) { conds.push('m.aboutLease = $lease'); params.lease = aboutLease; }
  if (topic) { conds.push('toLower(m.content) CONTAINS toLower($topic)'); params.topic = String(topic); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const r = await g.query(
    `MATCH (m:Memory) ${where}
     RETURN m.kind AS kind, m.content AS content, m.aboutLease AS aboutLease, m.updatedAt AS updatedAt
     ORDER BY m.updatedAt DESC LIMIT 10`,
    { params });
  return r.data;
}

export async function remember({ kind, content, about_lease_id: aboutLease }) {
  const g = await graph();
  const r = await g.query(
    `CREATE (m:Memory {kind:$kind, content:$content, aboutLease:$lease, updatedAt:$now})
     RETURN m.kind AS kind, m.content AS content`,
    { params: { kind, content, lease: aboutLease ?? null, now: new Date().toISOString() } });
  return r.data[0];
}

/** Drafter on demand: grounded ONLY in stored quotes; letter is born pending. */
export async function requestDraft({ lease_id, draft_kind }) {
  const g = await graph();
  const ctx = await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(c:Clause)-[:YIELDS]->(f:Field)
     OPTIONAL MATCH (c)-[:GROUNDS]->(q:Quote)
     RETURN l.title AS title, collect({key:f.key, value:f.value})[0..20] AS fields,
            collect(DISTINCT {text:q.text, page:q.pageIdx})[0..8] AS quotes`,
    { params: { id: lease_id } });
  const row = ctx.data[0];
  if (!row) return { error: `no lease ${lease_id}` };
  const letter = await groqChat([
    { role: 'system', content: `You draft a short, professional notice letter for a landlord, grounded ONLY in the provided lease fields and quotes. Do not invent dates, names, or terms. 150 words max. Plain text.` },
    { role: 'user', content: JSON.stringify({ lease: row.title, draftKind: draft_kind, fields: row.fields, quotes: (row.quotes ?? []).filter(q => q.text) }) },
  ], { model: MODEL_FAST });
  const cited = (row.quotes ?? []).filter(q => q.text);
  const r = await g.query(
    `MATCH (l:Lease {id:$id})
     CREATE (d:Draft {kind:$kind, body:$body, status:'pending', requestedBy:'concierge', createdAt:$now})
     CREATE (l)-[:HAS_DRAFT]->(d)
     WITH d UNWIND $cited AS cq
     MATCH (q:Quote {text: cq.text}) CREATE (d)-[:CITES]->(q)
     RETURN d.status AS status, count(d) AS n`,
    { params: { id: lease_id, kind: draft_kind, body: letter, cited, now: new Date().toISOString() } });
  return { leaseId: lease_id, status: 'pending', body: letter, citedQuotes: cited.length };
}

const IMPLEMENTATIONS = {
  next_deadlines: nextDeadlines,
  lineage,
  find_lease: findLease,
  recall,
  remember,
  request_draft: requestDraft,
};

export async function runTool(name, args) {
  const fn = IMPLEMENTATIONS[name];
  if (!fn) return { error: `unknown tool ${name}` };
  try { return await fn(args ?? {}); }
  catch (e) { return { error: e.message }; }
}
