// POST /api/extract {leaseId} → grounded extraction (slow: model call)
import { NextResponse } from "next/server";
import { extractLease } from "../../../../pipeline/extract.mjs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { leaseId } = await req.json();
  if (!leaseId) return NextResponse.json({ error: "leaseId required" }, { status: 400 });
  try {
    const r = await extractLease(leaseId);
    return NextResponse.json({ leaseId: r.leaseId, validation: r.validation, deadlines: r.deadlines, latencyMs: r.latencyMs });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
