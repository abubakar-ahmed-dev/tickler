// Temporal activities — every side effect lives here; workflows stay pure.
// Reuses pipeline modules so the graph-write logic has exactly one home.
import { GROQ_BASE, GROQ_KEY, MODEL_FAST } from '../shared/config.mjs';
import { ingestLease } from '../pipeline/ingest.mjs';
import { extractLease, computeDeadlines } from '../pipeline/extract.mjs';
import { graph, db } from '../pipeline/graph-write.mjs';

export async function ingestLeaseActivity({ pdfPath, title }) {
  return ingestLease(pdfPath, title);
}

export async function extractLeaseActivity(leaseId) {
  return extractLease(leaseId);
}

async function groqChat(messages, { jsonSchema } = {}) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: MODEL_FAST,
        temperature: 0,
        ...(jsonSchema ? { response_format: { type: 'json_schema', json_schema: jsonSchema } } : {}),
        messages,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const content = data.choices[0].message.content;
      return jsonSchema ? JSON.parse(content) : content;
    }
    const text = await res.text();
    if (res.status === 429 && attempt < 6) {
      const m = text.match(/try again in ([\d.]+)s/i);
      await new Promise(r => setTimeout(r, ((m ? parseFloat(m[1]) : 20) + 2) * 1000));
      continue;
    }
    throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
  }
}

/** Human approved the abstract: apply corrections, mark fields approved, recompute deadlines in code. */
export async function applyApprovalActivity({ leaseId, corrections = [] }) {
  const g = await graph();
  for (const c of corrections) {
    await g.query(
      `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[:YIELDS]->(f:Field {key:$key})
       SET f.value = $val, f.correctedByHuman = true
       CREATE (:Correction {before: f.value, after:$val, at:$now})-[:EDITS]->(f)`,
      { params: { id: leaseId, key: c.key, val: String(c.newValue), now: new Date().toISOString() } });
  }
  await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[:YIELDS]->(f:Field) SET f.approved = true`,
    { params: { id: leaseId } });

  // recompute deadlines from the approved field set — same pure function as extraction
  const res = await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[:YIELDS]->(f:Field)
     RETURN f.key AS key, f.value AS value`,
    { params: { id: leaseId } });
  const fields = {};
  for (const r of res.data) fields[r.key] = { value: r.value };
  const deadlines = computeDeadlines(fields);
  await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[e:DERIVES]->(d:Deadline) DETACH DELETE d`,
    { params: { id: leaseId } });
  for (const d of deadlines) {
    const ct = d.type === 'term_end' ? 'term' : d.type === 'notice' ? 'renewal_notice'
      : d.type === 'escalation' ? 'escalation' : 'deposit';
    await g.query(
      `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(c:Clause {type:$ct})
       CREATE (c)-[:DERIVES]->(:Deadline {type:$type, date:$date, needsReview:$nr, reason:$reason})`,
      { params: { id: leaseId, ct, type: d.type, date: d.date ?? 'unknown', nr: d.needs_review, reason: d.reason ?? '' } });
  }
  return { leaseId, deadlines: deadlines.length, correctionsApplied: corrections.length };
}

const DEFAULT_LEADS_MS = [90, 30, 7].map(d => d * 86400000); // 90/30/7 days

/** Create :Reminder nodes (state=scheduled) per deadline×lead; return specs for child workflows.
 * Real mode: fires leadMs before the deadline date (09:00 UTC).
 * Demo mode (TICKLER_LEADS_MS set): fires leadMs from NOW — for live demos/tests. */
export async function armLeaseActivity({ leaseId, leadsMs }) {
  const g = await graph();
  const envLeads = process.env.TICKLER_LEADS_MS ? process.env.TICKLER_LEADS_MS.split(',').map(Number) : null;
  const leads = leadsMs ?? envLeads ?? DEFAULT_LEADS_MS;
  const demoMode = Boolean(envLeads || leadsMs);
  // wipe any prior reminders for this lease (re-arm = idempotent)
  await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[:DERIVES]->(d:Deadline)-[:SCHEDULED]->(r:Reminder)
     DETACH DELETE r`,
    { params: { id: leaseId } });
  const dl = await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[:DERIVES]->(d:Deadline)
     WHERE d.needsReview = false AND d.date <> 'unknown'
     RETURN d.type AS type, d.date AS date`,
    { params: { id: leaseId } });
  const specs = [];
  const now = Date.now();
  for (const row of dl.data) {
    const fireAtMs = new Date(row.date + 'T09:00:00Z').getTime();
    const steps = [];
    const sorted = [...leads].sort((a, b) => b - a); // longest lead first
    for (const leadMs of sorted) {
      const reminderId = `${leaseId}-${row.type}-${leadMs}`;
      const at = demoMode ? now + leadMs : Math.max(fireAtMs - leadMs, now);
      await g.query(
        `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[:DERIVES]->(d:Deadline {type:$type, date:$date})
         CREATE (d)-[:SCHEDULED]->(:Reminder {id:$rid, leadMs:$lead, fireAt:$at, state:'scheduled'})`,
        { params: { id: leaseId, type: row.type, date: row.date, rid: reminderId, lead: leadMs, at: new Date(at).toISOString() } });
      steps.push({ reminderId, leadMs, delayMs: Math.max(at - now, 0) });
    }
    specs.push({ leaseId, deadlineType: row.type, deadlineDate: row.date, steps });
  }
  return specs;
}

export async function setStatusActivity({ leaseId, status }) {
  const g = await graph();
  await g.query(`MATCH (l:Lease {id:$id}) SET l.status=$s`, { params: { id: leaseId, s: status } });
  return { leaseId, status };
}

/** Timer fired: mark reminder, let the Watcher agent decide, maybe hand off to the Drafter.
 * isFinal=true on the shortest lead — code forces escalate regardless of model choice. */
export async function reminderFiredActivity({ reminderId, leaseId, deadlineType, deadlineDate, leadMs, isFinal }) {
  const g = await graph();
  await g.query(`MATCH (r:Reminder {id:$rid}) SET r.state='fired'`, { params: { rid: reminderId } });

  const ctx = await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(c:Clause)-[:DERIVES]->(d:Deadline {type:$type, date:$date})
     OPTIONAL MATCH (c)-[:GROUNDS]->(q:Quote)
     RETURN l.title AS title, c.type AS clauseType, d.reason AS reason,
            collect(q.text)[0..3] AS quotes, d.needsReview AS nr`,
    { params: { id: leaseId, type: deadlineType, date: deadlineDate } });
  const row = ctx.data[0] ?? {};
  const decision = await groqChat([
    { role: 'system', content: `You are the Watcher agent for Tickler, a lease-deadline tool. Given a fired reminder's context, decide the action.
Rules: "alert" = notify the user now. "snooze" = genuinely not urgent yet, skip this lead. "escalate" = urgent: hand off to the Drafter agent to prepare the notice letter. If finalLead is true this is the LAST reminder before the deadline — you must escalate.
Respond ONLY as JSON: {action: "alert"|"snooze"|"escalate", reason: string, alert_message: string}. The alert_message is one human sentence.` },
    { role: 'user', content: JSON.stringify({ lease: row.title, deadlineType, deadlineDate, clauseType: row.clauseType, quotes: row.quotes ?? [], leadMs, finalLead: Boolean(isFinal) }) },
  ], { jsonSchema: { name: 'watcher_decision', schema: { type: 'object', properties: { action: { type: 'string', enum: ['alert', 'snooze', 'escalate'] }, reason: { type: 'string' }, alert_message: { type: 'string' } }, required: ['action', 'reason', 'alert_message'] } } });
  // code guardrail: the final lead always escalates, whatever the model said
  if (isFinal && decision.action !== 'escalate') {
    decision.action = 'escalate';
    decision.reason = 'final lead — escalated by rule (model said: ' + decision.action + ')';
  }

  const level = decision.action === 'escalate' ? 'urgent' : decision.action === 'snooze' ? 'info' : 'notice';
  const alert = await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[:DERIVES]->(d:Deadline {type:$type, date:$date})
     CREATE (a:Alert {level:$level, message:$msg, reason:$reason, action:$action, createdAt:$now})-[:ABOUT]->(d)
     RETURN id(a) AS aid`,
    { params: { id: leaseId, type: deadlineType, date: deadlineDate, level, msg: decision.alert_message, reason: decision.reason, action: decision.action, now: new Date().toISOString() } });

  let draft = null;
  if (decision.action === 'escalate') {
    const quotes = row.quotes?.filter(Boolean) ?? [];
    const letter = await groqChat([
      { role: 'system', content: `You draft a short, professional notice letter for a landlord, grounded ONLY in the provided lease quotes and deadline. Do not invent dates or terms. 150 words max. Plain text.` },
      { role: 'user', content: JSON.stringify({ lease: row.title, deadlineType, deadlineDate, clauseQuotes: quotes }) },
    ], {});
    const r = await g.query(
      `MATCH (a) WHERE id(a)=$aid
       CREATE (d:Draft {kind:'notice_letter', body:$body, status:'pending', createdAt:$now})
       CREATE (a)-[:TRIGGERED]->(d)
       WITH d
       UNWIND $quotes AS qtext
       MATCH (q:Quote {text: qtext}) CREATE (d)-[:CITES]->(q)
       RETURN d.status AS status`,
      { params: { aid: alert.data[0].aid, body: typeof letter === 'string' ? letter : letter.body ?? JSON.stringify(letter), quotes, now: new Date().toISOString() } });
    draft = r.data[0]?.status ?? 'pending';
  }
  return { action: decision.action, reason: decision.reason, draft };
}
