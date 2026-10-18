// GET/POST /api/settings — reminder email for the instance owner
import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "../../../../worker/email.mjs";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function POST(req: Request) {
  const { email } = await req.json();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "that doesn't look like an email address" }, { status: 400 });
  return NextResponse.json(await saveSettings({ email }));
}
