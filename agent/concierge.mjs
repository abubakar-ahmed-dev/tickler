// Concierge — Tickler's conversational agent. Tool loop over gpt-oss-20b with
// native function calling; every substantive answer must cite its lineage.
// CLI: node --env-file=.env agent/concierge.mjs ask "question" [--lease id]
//      node --env-file=.env agent/concierge.mjs chat
import { createInterface } from 'node:readline';
import { MODEL_FAST } from '../shared/config.mjs';
import { groqChat } from '../shared/groq.mjs';
import { TOOL_SPECS, runTool } from './tools.mjs';
import { graph, db } from '../pipeline/graph-write.mjs';

const SESSION_USER = 'demo-user';
const MAX_TOOL_ROUNDS = 8;

const SYSTEM = `You are the Tickler assistant, a helper for a lease-deadline tool used by small landlords.

Non-negotiable rules:
1. Before ANY substantive answer, call at least one tool. Never answer lease questions from memory.
2. Every claim about lease content must carry its source: cite the verbatim document quote and page number from the lineage tool's evidence entries, formatted as (source, page N: "quoted sentence"). Chain steps that merely restate the deadline (e.g. "notice on 2027-12-02") are computed values, NOT document quotes — label them "(computed)" if you reference them, and never present them as quotations.
3. If a tool returns nothing or 'unknown', say so plainly. Never invent a date, clause, name, or preference.
4. You draft documents, never give legal advice. If asked for legal advice, say you can't and suggest a professional.
5. When the user states a durable fact or preference, save it with the remember tool.
6. Write in simple, plain English. Use short sentences. Never use em dashes.

Tool discipline: usually 1–2 calls are enough. As soon as the tool results cover the question, STOP calling tools and write your final answer. Never call the same tool twice with the same arguments.`;

const wireSpecs = TOOL_SPECS.map(s => ({
  type: 'function',
  function: { name: s.name, description: s.description, parameters: s.parameters },
}));

async function persistSession({ question, answer, toolsUsed, leaseId }) {
  const g = await graph();
  const s = await g.query(
    `CREATE (se:Session {userId:$u, startedAt:$now}) RETURN id(se) AS sid`,
    { params: { u: SESSION_USER, now: new Date().toISOString() } });
  const sid = s.data[0].sid;
  await g.query(
    `MATCH (se) WHERE id(se)=$sid
     CREATE (se)-[:HAS_TURN]->(:Memory {kind:'episodic', content:$turn, aboutLease:$lease, updatedAt:$now})`,
    { params: { sid, turn: `Q: ${question}\nA: ${String(answer).slice(0, 400)}`, lease: leaseId ?? null, now: new Date().toISOString() } });
  if (leaseId) {
    await g.query(
      `MATCH (se) WHERE id(se)=$sid MATCH (l:Lease {id:$lease}) CREATE (se)-[:ABOUT]->(l)`,
      { params: { sid, lease: leaseId } });
  }
}

export async function ask(question, { leaseId, onEvent } = {}) {
  const g = await graph();
  const prior = await g.query(
    `MATCH (m:Memory) WHERE m.aboutLease = $lease OR $lease IS NULL
     RETURN m.kind AS kind, m.content AS content ORDER BY m.updatedAt DESC LIMIT 5`,
    { params: { lease: leaseId ?? null } });

  const messages = [
    { role: 'system', content: SYSTEM + (leaseId ? `\nCurrent lease in focus: ${leaseId}.` : '') +
      (prior.data.length ? `\nRelevant memory:\n${prior.data.map(m => `- [${m.kind}] ${m.content}`).join('\n')}` : '') },
    { role: 'user', content: question },
  ];
  const toolsUsed = [];
  const citations = [];
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { message: msg } = await groqChat(messages, { model: MODEL_FAST, tools: wireSpecs });
    messages.push(msg);
    if (!msg.tool_calls?.length) {
      await persistSession({ question, answer: msg.content, toolsUsed, leaseId });
      return { answer: msg.content, toolsUsed, citations };
    }
    for (const tc of msg.tool_calls) {
      const name = tc.function.name;
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* empty args */ }
      onEvent?.({ type: 'tool', name, args });
      toolsUsed.push(name);
      const result = await runTool(name, args);
      if (name === 'lineage' && result?.chain) citations.push(result);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 6000) });
    }
  }
  return { answer: 'Tool loop hit its round limit before producing an answer.', toolsUsed };
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('concierge.mjs')) {
  const mode = process.argv[2];
  const leaseIdx = process.argv.indexOf('--lease');
  const leaseId = leaseIdx >= 0 ? process.argv[leaseIdx + 1] : undefined;

  if (mode === 'ask') {
    const question = process.argv[3];
    if (!question) { console.error('usage: concierge.mjs ask "question" [--lease id]'); process.exit(1); }
    const r = await ask(question, {
      leaseId,
      onEvent: e => console.error(`  → tool: ${e.name}(${JSON.stringify(e.args).slice(0, 80)})`),
    });
    console.log('\n' + r.answer);
    console.error(`\n[tools used: ${r.toolsUsed.join(', ') || 'none'}]`);
    await (await db()).close();
    process.exit(0);
  } else if (mode === 'chat') {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(`Tickler assistant — chat mode${leaseId ? ` (lease: ${leaseId})` : ''}. Empty line quits.`);
    const prompt = () => rl.question('you> ', async line => {
      if (!line.trim()) { rl.close(); await (await db()).close(); process.exit(0); }
      try {
        const r = await ask(line, { leaseId, onEvent: e => console.error(`  → ${e.name}`) });
        console.log(`tickler> ${r.answer}`);
      } catch (e) { console.error('error:', e.message); }
      prompt();
    });
    prompt();
  } else {
    console.error('usage: concierge.mjs ask "question" [--lease id] | chat');
    process.exit(1);
  }
}
