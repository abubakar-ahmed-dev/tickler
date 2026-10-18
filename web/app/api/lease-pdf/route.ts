// GET /api/lease-pdf?leaseId=x → the original PDF bytes for the evidence viewer.
// Lease ids are filename stems, so the file is looked up where ingest left it.
import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

const TMP = process.env.UPLOAD_DIR ?? join(process.cwd(), "..", "tmp-uploads");
const CORPUS = join(process.cwd(), "..", "corpus", "pdfs");
const HOLDOUT = join(process.cwd(), "..", "eval", "holdout", "pdfs");

export async function GET(req: Request) {
  const leaseId = new URL(req.url).searchParams.get("leaseId") ?? "";
  if (!/^[a-z0-9-]+$/i.test(leaseId)) {
    return NextResponse.json({ error: "leaseId required" }, { status: 400 });
  }
  // uploads were slugified at save time; the "lease-" prefix is added by the id
  // builder, so the raw file may exist under either spelling
  const bare = leaseId.replace(/^lease-/, "");
  const candidates = [
    join(TMP, `${leaseId}.pdf`),
    join(TMP, `${bare}.pdf`),
    join(CORPUS, `${leaseId}.pdf`),
    join(HOLDOUT, `${leaseId}.pdf`),
  ];
  const hit = candidates.find(existsSync);
  if (!hit) {
    return NextResponse.json({ error: "the PDF file for this lease is not on disk" }, { status: 404 });
  }
  return new NextResponse(readFileSync(hit), {
    headers: { "content-type": "application/pdf", "cache-control": "no-store" },
  });
}
