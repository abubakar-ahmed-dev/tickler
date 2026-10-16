// POST /api/ask {question, leaseId?} → Concierge answer + tools used + citations
import { NextResponse } from "next/server";
import { ask } from "../../../../agent/concierge.mjs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { question, leaseId } = await req.json();
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });
  try {
    const r = await ask(question, { leaseId: leaseId || undefined });
    return NextResponse.json(r);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
