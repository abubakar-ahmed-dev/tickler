// POST /api/upload (multipart file) → ingest PDF into the graph (parse only)
import { NextResponse } from "next/server";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ingestLease } from "../../../../pipeline/ingest.mjs";

export const runtime = "nodejs";
export const maxDuration = 120;

// lease PDFs live on one store: UPLOAD_DIR (a mounted disk in production),
// falling back to the local dev folder
const TMP = process.env.UPLOAD_DIR ?? join(process.cwd(), "..", "tmp-uploads");

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const title = (form.get("title") as string) || undefined;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  mkdirSync(TMP, { recursive: true });
  // save under the slugified stem so the lease id matches the file name
  // (the evidence viewer looks PDFs up by id)
  const stem = file.name.replace(/\.pdf$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "lease";
  const dest = join(TMP, `${stem}.pdf`);
  writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
  try {
    const r = await ingestLease(dest, title ?? file.name.replace(/\.pdf$/i, ""));
    return NextResponse.json(r);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
