// POST /api/review {leaseId, corrections, arm, mode: "demo"|"real"}
// Applies the human approval (corrections + recompute), optionally arms reminders
// as Temporal child workflows (same path as the CLI).
// mode "demo": reminders fire in ~24s/12s/5s from now (for live evaluation).
// mode "real": 90/30/7 days before each deadline date.
import { NextResponse } from "next/server";
import { applyApprovalActivity, armLeaseActivity, setStatusActivity } from "../../../../worker/activities.mjs";
import { Client, Connection } from "@temporalio/client";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEMO_LEADS = [24000, 12000, 5000];
const REAL_LEADS = [90, 30, 7].map(d => d * 86400000);

export async function POST(req: Request) {
  const { leaseId, corrections = [], arm = true, mode = "real" } = await req.json();
  let connection: Connection | null = null;
  if (!leaseId) return NextResponse.json({ error: "leaseId required" }, { status: 400 });
  try {
    const applied = await applyApprovalActivity({ leaseId, corrections });
    let armed = 0;
    let firstFireSec: number | null = null;
    if (arm) {
      const leadsMs = mode === "demo" ? DEMO_LEADS : REAL_LEADS;
      const specs = (await armLeaseActivity({ leaseId, leadsMs })) as Array<{
        leaseId: string; deadlineType: string; deadlineDate: string;
        steps: Array<{ reminderId: string; leadMs: number; delayMs: number }>;
      }>;
      connection = await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
      });
      const client = new Client({ connection });
      for (const spec of specs) {
        await client.workflow.start("DeadlineReminderWorkflow", {
          taskQueue: "tickler",
          workflowId: `reminder-${spec.leaseId}-${spec.deadlineType}-${spec.deadlineDate}`,
          args: [spec],
        });
        armed++;
      }
      const minDelay = Math.min(...specs.flatMap(s => s.steps.map(st => st.delayMs)));
      firstFireSec = Math.round(minDelay / 1000);
      await setStatusActivity({ leaseId, status: "armed" });
    }
    return NextResponse.json({ ...applied, armed, firstFireSec, mode });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  } finally {
    connection?.close().catch(() => {});
  }
}
