// Workflows — orchestration only. Every side effect is an activity; the
// durable timer sleeps below survive worker crashes and restarts.
import { defineSignal, setHandler, condition, sleep, startChild, proxyActivities } from '@temporalio/workflow';

const act = proxyActivities({
  startToCloseTimeout: '15 minutes',
  retry: { maximumAttempts: 5 },
});

export const approveSignal = defineSignal<[{
  corrections: Array<{ key: string; newValue: string }>;
  approved: boolean;
}]>('approve');

export interface IngestionInput {
  leaseId: string;
  pdfPath?: string;
  title?: string;
}

/**
 * Lease ingestion orchestration:
 * parse+store → extract → WAIT for human approval (durable signal gate)
 * → apply corrections + recompute deadlines → arm reminders as child workflows.
 */
export async function LeaseIngestionWorkflow(input: IngestionInput): Promise<Record<string, unknown>> {
  let approval: { corrections: Array<{ key: string; newValue: string }>; approved: boolean } | null = null;
  setHandler(approveSignal, payload => { approval = payload; });

  if (input.pdfPath) await act.ingestLeaseActivity({ pdfPath: input.pdfPath, title: input.title });
  await act.extractLeaseActivity(input.leaseId);

  // The human gate. This wait can last days — Temporal guarantees it survives restarts.
  await condition(() => approval !== null, '45 days');
  if (!approval) throw new Error('approval window expired');

  await act.applyApprovalActivity({ leaseId: input.leaseId, corrections: approval.corrections });
  const specs = (await act.armLeaseActivity({ leaseId: input.leaseId })) as Array<{
    leaseId: string; deadlineType: string; deadlineDate: string;
    steps: Array<{ reminderId: string; leadMs: number; delayMs: number }>;
  }>;

  for (const spec of specs) {
    await startChild(DeadlineReminderWorkflow, {
      workflowId: `reminder-${spec.leaseId}-${spec.deadlineType}-${spec.deadlineDate}`,
      args: [spec],
    });
  }
  await act.setStatusActivity({ leaseId: input.leaseId, status: 'armed' });
  return { armed: specs.length, deadlines: specs.map(s => s.deadlineType) };
}

export interface ReminderSpec {
  leaseId: string;
  deadlineType: string;
  deadlineDate: string;
  steps: Array<{ reminderId: string; leadMs: number; delayMs: number }>;
}

/**
 * One deadline's reminder chain: durable sleep per lead time, Watcher agent
 * fires at each. Kill the worker mid-sleep, restart it — timers resume exactly.
 */
export async function DeadlineReminderWorkflow(spec: ReminderSpec): Promise<Array<Record<string, unknown>>> {
  const decisions = [];
  for (let i = 0; i < spec.steps.length; i++) {
    const step = spec.steps[i];
    if (step.delayMs > 0) await sleep(step.delayMs);
    decisions.push(await act.reminderFiredActivity({
      reminderId: step.reminderId,
      leaseId: spec.leaseId,
      deadlineType: spec.deadlineType,
      deadlineDate: spec.deadlineDate,
      leadMs: step.leadMs,
      isFinal: i === spec.steps.length - 1,
    }));
  }
  return decisions;
}

/** Standalone arming for leases already reviewed (CLI/demo path). */
export async function ArmWorkflow(leaseId: string): Promise<Array<ReminderSpec>> {
  const specs = (await act.armLeaseActivity({ leaseId })) as ReminderSpec[];
  for (const spec of specs) {
    await startChild(DeadlineReminderWorkflow, {
      workflowId: `reminder-${spec.leaseId}-${spec.deadlineType}-${spec.deadlineDate}`,
      args: [spec],
    });
  }
  await act.setStatusActivity({ leaseId, status: 'armed' });
  return specs;
}

// Phase 0 hello gate — kept as the minimal durable-timer proof.
export async function helloTimer(sleepMs: number): Promise<string> {
  await sleep(sleepMs);
  return 'timer fired';
}
