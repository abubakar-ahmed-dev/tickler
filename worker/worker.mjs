// The Tickler worker: runs workflows + activities on taskQueue 'tickler'.
// Kill it mid-timer; restart; durable timers resume — that's the product.
import { Worker, NativeConnection } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
import * as activities from './activities.mjs';

const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
const worker = await Worker.create({
  connection,
  taskQueue: 'tickler',
  workflowsPath: fileURLToPath(new URL('./workflows.ts', import.meta.url)),
  activities,
});
console.log('tickler worker up — taskQueue=tickler');
await worker.run();
