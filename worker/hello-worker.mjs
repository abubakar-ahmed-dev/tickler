// Runs the hello worker against the local Temporal dev server.
import { Worker, NativeConnection } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';

const connection = await NativeConnection.connect({ address: 'localhost:7233' });
const worker = await Worker.create({
  connection,
  taskQueue: 'tickler-hello',
  workflowsPath: fileURLToPath(new URL('./hello-workflow.ts', import.meta.url)),
});
console.log('hello worker up on taskQueue=tickler-hello — Ctrl+C to stop');
await worker.run();
