// POST /api/sample → load a synthetic sample lease (ingest + extract in one call).
// Demo/onboarding path; uses the synthetic corpus, never real documents.
import { NextResponse } from "next/server";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ingestLease } from "../../../../pipeline/ingest.mjs";
import { extractLease } from "../../../../pipeline/extract.mjs";

export const runtime = "nodejs";
export const maxDuration = 300;

const CORPUS = join(process.cwd(), "..", "corpus", "pdfs");
const TMP = process.env.UPLOAD_DIR ?? join(process.cwd(), "..", "tmp-uploads");
const SAMPLES = ["lease-01", "lease-03", "lease-06"]; // anniversary+leap, fixed-escalation, 5% anniversary

export async function POST() {
  mkdirSync(TMP, { recursive: true });
  const id = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
  const src = join(CORPUS, `${id}.pdf`);
  if (!existsSync(src)) return NextResponse.json({ error: "sample corpus missing — run node corpus/generate.mjs" }, { status: 500 });
  const dest = join(TMP, `${id}.pdf`);
  copyFileSync(src, dest);
  try {
    const ingested = await ingestLease(dest, `Sample ${id}`);
    const ex = await extractLease(ingested.leaseId);
    return NextResponse.json({ leaseId: ingested.leaseId, deadlines: ex.deadlines.length, validation: ex.validation });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
