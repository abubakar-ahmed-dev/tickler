// Phase 0 gate: a durable timer. If the worker dies mid-wait and restarts,
// this still completes — that guarantee is the product's spine.
import { sleep } from '@temporalio/workflow';

export async function helloTimer(sleepMs: number): Promise<string> {
  await sleep(sleepMs);
  return 'timer fired';
}
