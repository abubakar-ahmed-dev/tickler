// CLI for the workflow layer.
//   node worker/cli.mjs ingest <pdfPath> [title]   start ingestion (waits for approval signal)
//   node worker/cli.mjs approve <leaseId> [correctionsJSON]
//   node worker/cli.mjs arm <leaseId>              standalone: arm reviewed lease (demo path)
//   node worker/cli.mjs status <leaseId>           graph status: lease, deadlines, reminders, alerts, drafts
import { Client } from '@temporalio/client';
import { readFileSync } from 'node:fs';
import { armLeaseActivity } from './activities.mjs';
import { db, graph } from '../pipeline/graph-write.mjs';

const [cmd, ...args] = process.argv.slice(2);
const client = new Client({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });

if (cmd === 'ingest') {
  const [pdfPath, title] = args;
  if (!pdfPath) { console.error('usage: cli.mjs ingest <pdfPath> [title]'); process.exit(1); }
  const leaseId = pdfPath.split(/[\\/]/).pop().replace(/\.pdf$/i, '').toLowerCase();
  const handle = await client.workflow.start('LeaseIngestionWorkflow', {
    taskQueue: 'tickler',
    workflowId: `ingestion-${leaseId}`,
    args: [{ leaseId, pdfPath, title: title ?? leaseId }],
  });
  console.log(`ingestion started: ${handle.workflowId} (${handle.runId}) — awaiting approval signal`);
} else if (cmd === 'approve') {
  const [leaseId, correctionsJson] = args;
  const corrections = correctionsJson ? JSON.parse(correctionsJson) : [];
  const handle = client.workflow.getHandle(`ingestion-${leaseId}`);
  await handle.signal('approve', { corrections, approved: true });
  console.log(`approval signaled for ${leaseId} (${corrections.length} corrections)`);
} else if (cmd === 'arm') {
  const leaseId = args[0];
  const leadsIdx = args.indexOf('--leads');
  const leadsMs = leadsIdx >= 0 ? args[leadsIdx + 1].split(',').map(Number) : undefined;
  if (!leaseId) { console.error('usage: cli.mjs arm <leaseId> [--leads ms1,ms2,...]'); process.exit(1); }
  const specs = await armLeaseActivity({ leaseId, leadsMs });
  for (const spec of specs) {
    await client.workflow.start('DeadlineReminderWorkflow', {
      taskQueue: 'tickler',
      workflowId: `reminder-${spec.leaseId}-${spec.deadlineType}-${spec.deadlineDate}`,
      args: [spec],
    });
  }
  console.log(`armed ${specs.length} deadlines for ${leaseId}:`, specs.map(s => s.deadlineType).join(', '));
} else if (cmd === 'status') {
  const [leaseId] = args;
  const g = await graph();
  const q = async (name, query) => {
    try { return (await g.query(query, { params: { id: leaseId } })).data; }
    catch (e) { console.error(`[${name}] query failed:`, e.message); return []; }
  };
  const l = await q('lease', `MATCH (l:Lease {id:$id}) RETURN l.status AS status`);
  const d = await q('deadlines', `
    MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[:DERIVES]->(x:Deadline)
    OPTIONAL MATCH (x)-[:SCHEDULED]->(r:Reminder)
    RETURN x.type AS type, x.date AS date, x.needsReview AS nr, r.id AS reminder ORDER BY x.type`);
  const a = await q('alerts', `
    MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[:DERIVES]->(:Deadline)<-[:ABOUT]-(al:Alert)
    OPTIONAL MATCH (al)-[:TRIGGERED]->(dr:Draft)
    RETURN al.action AS action, al.message AS message, dr.status AS draft ORDER BY al.createdAt`);
  console.log('lease:', l[0]?.status);
  console.log('deadlines:', JSON.stringify(d, null, 1));
  console.log('alerts:', JSON.stringify(a, null, 1));
  await (await db()).close();
} else {
  console.error('commands: ingest | approve | arm | status');
  process.exit(1);
}
process.exit(0);
