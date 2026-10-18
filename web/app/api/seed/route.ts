// POST /api/seed → populate a fresh deployment with three demo leases in three states:
//   lease-04: extracted, awaiting human review
//   lease-05: approved, reminders armed on the real 90/30/7-day schedule (no alerts yet)
//   lease-06: approved, reminders armed in demo speed (alerts + a pending letter within ~30s)
// Idempotent per lease: an existing lease id is skipped, so calling twice is harmless.
// Same pipeline the UI drives — no new state machine.
import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ingestLease } from "../../../../pipeline/ingest.mjs";
import { extractLease } from "../../../../pipeline/extract.mjs";
import { getLease } from "../../../../pipeline/graph-write.mjs";
import {
  applyApprovalActivity, armLeaseActivity, setStatusActivity,
} from "../../../../worker/activities.mjs";
import { Client, Connection } from "@temporalio/client";

export const runtime = "nodejs";
export const maxDuration = 300;

const CORPUS = join(process.cwd(), "..", "corpus", "pdfs");
const DEMO_LEADS = [24000, 12000, 5000];
const REAL_LEADS = [90, 30, 7].map(d => d * 86400000);

type Seeded = { leaseId: string; state: string };

async function bringUp(leaseId: string, leadsMs: number[], connection: Connection) {
  await applyApprovalActivity({ leaseId, corrections: [] });
  const specs = (await armLeaseActivity({ leaseId, leadsMs })) as Array<{
    leaseId: string; deadlineType: string; deadlineDate: string;
    steps: Array<{ reminderId: string; leadMs: number; delayMs: number }>;
  }>;
  const client = new Client({ connection });
  for (const spec of specs) {
    await client.workflow.start("DeadlineReminderWorkflow", {
      taskQueue: "tickler",
      workflowId: `reminder-${spec.leaseId}-${spec.deadlineType}-${spec.deadlineDate}`,
      args: [spec],
    });
  }
  await setStatusActivity({ leaseId, status: "armed" });
}

export async function POST() {
  const out: Seeded[] = [];
  let connection: Connection | null = null;
  try {
    connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    });
    for (const [id, state, leads] of [
      ["lease-04", "awaiting_review", null],
      ["lease-05", "armed_real", REAL_LEADS],
      ["lease-06", "armed_demo", DEMO_LEADS],
    ] as Array<[string, string, number[] | null]>) {
      if (await getLease(id)) {
        out.push({ leaseId: id, state: "already_present_skipped" });
        continue;
      }
      const pdf = join(CORPUS, `${id}.pdf`);
      if (!existsSync(pdf)) throw new Error(`corpus PDF missing: ${id}.pdf`);
      await ingestLease(pdf, `Sample ${id}`);
      await extractLease(id);
      if (leads) await bringUp(id, leads, connection);
      out.push({ leaseId: id, state });
    }
    return NextResponse.json({ seeded: out });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message, seeded: out }, { status: 502 });
  } finally {
    connection?.close().catch(() => {});
  }
}
