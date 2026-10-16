// POST /api/drafts {draftId, action: approve|discard}
import { NextResponse } from "next/server";
import { graph } from "../../../../pipeline/graph-write.mjs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { draftId, action } = await req.json();
  if (!draftId || !["approve", "discard"].includes(action))
    return NextResponse.json({ error: "draftId + action(approve|discard) required" }, { status: 400 });
  const g = await graph();
  const status = action === "approve" ? "approved" : "discarded";
  const r = await g.query(
    `MATCH (d:Draft) WHERE id(d)=$id SET d.status=$status, d.decidedAt=$now RETURN d.status AS status`,
    { params: { id: draftId, status, now: new Date().toISOString() } });
  return NextResponse.json(r.data[0] ?? {});
}
