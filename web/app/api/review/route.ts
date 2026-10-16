// POST /api/review {leaseId, corrections, arm, leadsMs?}
// Applies the human approval (corrections + recompute), optionally arms reminders
// as Temporal child workflows (same path as the CLI).
import { NextResponse } from "next/server";
import { applyApprovalActivity, armLeaseActivity, setStatusActivity } from "../../../../worker/activities.mjs";
import { Client } from "@temporalio/client";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const { leaseId, corrections = [], arm = true, leadsMs } = await req.json();
  if (!leaseId) return NextResponse.json({ error: "leaseId required" }, { status: 400 });
  try {
    const applied = await applyApprovalActivity({ leaseId, corrections });
    let armed = 0;
    if (arm) {
      const specs = (await armLeaseActivity({ leaseId, leadsMs })) as Array<{
        leaseId: string; deadlineType: string; deadlineDate: string;
        steps: Array<{ reminderId: string; leadMs: number; delayMs: number }>;
      }>;
      const client = new Client({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" });
      for (const spec of specs) {
        await client.workflow.start("DeadlineReminderWorkflow", {
          taskQueue: "tickler",
          workflowId: `reminder-${spec.leaseId}-${spec.deadlineType}-${spec.deadlineDate}`,
          args: [spec],
        });
        armed++;
      }
      await setStatusActivity({ leaseId, status: "armed" });
    }
    return NextResponse.json({ ...applied, armed });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
