// Phase 0 gate: start the helloTimer workflow with a 5s durable sleep.
// Expect: result arrives ~5s later. Kill the hello-worker mid-wait and
// restart it — the workflow still completes. That is the whole point.
import { Client } from '@temporalio/client';

const client = new Client({ address: 'localhost:7233' });
const started = Date.now();
const result = await client.workflow.execute('helloTimer', {
  taskQueue: 'tickler-hello',
  workflowId: `hello-${Date.now()}`,
  args: [5000],
});
console.log(`Temporal OK — "${result}" after ${Date.now() - started}ms (expected ~5000ms)`);
