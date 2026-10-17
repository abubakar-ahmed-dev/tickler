"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Lease = { id: string; title: string; status: string; deadlines: number; needsReview: number };
type Citation = { deadline: { type: string; date: string }; chain: Array<{ step: string; detail: string }> };
type ChatMsg = {
  who: "you" | "bot" | "system";
  text: string;
  tools?: string[];
  citations?: Citation[];
};
type Field = { clause: string; key: string; value: string; confidence: number; approved: boolean; corrected: boolean; quote: string | null; page: number | null };
type Deadline = { type: string; date: string; needsReview: boolean; reason: string; reminders: string[] };
type Alert = { alertId: number; action: string; level: string; message: string; reason: string; draftId: number | null; draftStatus: string | null };
type LeaseState = { lease: { id: string; title: string; status: string; extractClean: boolean }; fields: Field[]; deadlines: Deadline[]; alerts: Alert[] };

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  parsing: { label: "reading PDF", cls: "" },
  parsed: { label: "parsed", cls: "" },
  extracting: { label: "extracting terms", cls: "" },
  awaiting_review: { label: "needs your review", cls: "warn" },
  armed: { label: "reminders running", cls: "ok" },
  rejected: { label: "rejected", cls: "bad" },
};

const STARTERS = [
  "What deadlines are coming up?",
  "Why does this lease have a term end deadline?",
  "Draft the renewal notice for this lease.",
];

export default function Home() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseId, setLeaseId] = useState<string>("");
  const [chat, setChat] = useState<ChatMsg[]>([
    { who: "bot", text: "I'm the Concierge. I answer from your leases — and every answer shows the exact sentence it came from. Load a sample lease to see it work, or upload your own PDF." },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [state, setState] = useState<LeaseState | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [armMode, setArmMode] = useState<"demo" | "real">("demo");
  const logRef = useRef<HTMLDivElement>(null);

  const say = useCallback((text: string) => setChat(c => [...c, { who: "system", text }]), []);

  const refreshLeases = useCallback(async () => {
    setLeases(await (await fetch("/api/leases")).json());
  }, []);

  const refreshState = useCallback(async (id: string) => {
    if (!id) return setState(null);
    const r = await fetch(`/api/state?leaseId=${id}`);
    if (r.ok) setState(await r.json());
    setEdits({});
  }, []);

  useEffect(() => { refreshLeases(); }, [refreshLeases]);
  useEffect(() => { refreshState(leaseId); }, [leaseId, refreshState]);

  // live polling: alerts + reminder states update on their own schedule
  useEffect(() => {
    if (!leaseId) return;
    const t = setInterval(() => refreshState(leaseId), 5000);
    return () => clearInterval(t);
  }, [leaseId, refreshState]);

  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [chat, thinking]);

  const current = leases.find(l => l.id === leaseId);
  const unapproved = state?.fields.filter(f => !f.approved) ?? [];
  const scheduledCount = state?.deadlines.reduce((n, d) => n + d.reminders.filter(Boolean).length, 0) ?? 0;
  const firedCount = state?.alerts.length ?? 0;

  // onboarding checklist state
  const steps = [
    { done: leases.length > 0, label: "Load a lease", hint: "sample or your own PDF" },
    { done: !!state && unapproved.length === 0, label: "Review & approve the terms", hint: "edit anything the model got wrong, then approve" },
    { done: state?.lease?.status === "armed", label: "Arm the reminders", hint: "durable timers — they survive restarts" },
    { done: firedCount > 0, label: "See the alerts land", hint: "watcher decisions appear here, live" },
  ];
  const nextStep = steps.findIndex(s => !s.done);

  const send = async (raw?: string) => {
    const q = (raw ?? input).trim();
    if (!q || thinking) return;
    setInput(""); setThinking(true);
    setChat(c => [...c, { who: "you", text: q }]);
    try {
      const r = await fetch("/api/ask", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, leaseId: leaseId || undefined }),
      });
      const j = await r.json();
      setChat(c => [...c, { who: "bot", text: j.answer ?? `Something went wrong: ${j.error}`, tools: j.toolsUsed, citations: j.citations }]);
      refreshState(leaseId);
    } catch (e) {
      setChat(c => [...c, { who: "system", text: `Connection problem: ${(e as Error).message}` }]);
    }
    setThinking(false);
  };

  const loadSample = async () => {
    setBusy("loading sample lease (reading + extracting terms)");
    try {
      const r = await fetch("/api/sample", { method: "POST" });
      const j = await r.json();
      if (j.error) say(`Couldn't load the sample: ${j.error}`);
      else {
        await refreshLeases();
        setLeaseId(j.leaseId);
        say(`Sample lease loaded — ${j.deadlines} deadline(s) extracted, ${j.validation?.length ? `${j.validation.length} quote(s) failed grounding` : "every quote grounded"}. Review the terms on the right, then approve to arm reminders.`);
      }
    } catch (e) { say(`Connection problem: ${(e as Error).message}`); }
    setBusy("");
  };

  const upload = async (file: File) => {
    setBusy("reading your PDF");
    const form = new FormData();
    form.set("file", file);
    let j: { leaseId?: string; error?: string };
    try {
      j = await (await fetch("/api/upload", { method: "POST", body: form })).json();
    } catch (e) { setBusy(""); say(`Connection problem: ${(e as Error).message}`); return; }
    if (j.error) { setBusy(""); say(`That PDF didn't work: ${j.error}`); return; }
    await refreshLeases();
    setLeaseId(j.leaseId!);
    setBusy("extracting terms (a model call — up to a minute)");
    await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leaseId: j.leaseId }) });
    setBusy("");
    refreshLeases(); refreshState(j.leaseId!);
    say(`"${file.name}" parsed and its terms extracted. Check them on the right — edit anything wrong, then approve to arm reminders.`);
  };

  const submitReview = async () => {
    if (!state) return;
    const corrections = Object.entries(edits).map(([key, newValue]) => ({ key, newValue }));
    setBusy(armMode === "demo" ? "approving + arming (demo speed)" : "approving + arming (real schedule)");
    try {
      const r = await fetch("/api/review", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaseId, corrections, mode: armMode }),
      });
      const j = await r.json();
      if (j.error) say(`Arm failed: ${j.error}`);
      else say(
        `Approved with ${corrections.length} correction(s). ${j.armed} deadline(s) armed on Temporal durable timers` +
        (j.mode === "demo"
          ? ` — demo speed: first alert lands in ~${j.firstFireSec}s, watch the Alerts panel.`
          : ` — real schedule: reminders will fire 90/30/7 days before each date.`));
    } catch (e) { say(`Connection problem: ${(e as Error).message}`); }
    setBusy("");
    refreshState(leaseId); refreshLeases();
  };

  const decideDraft = async (draftId: number, action: "approve" | "discard") => {
    await fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draftId, action }) });
    say(action === "approve" ? "Letter approved — it's ready to send." : "Letter discarded.");
    refreshState(leaseId);
  };

  return (
    <>
      <header className="appbar">
        <div className="shell">
          <Link href="/" className="brand" style={{ textDecoration: "none" }}>
            <svg viewBox="0 0 64 64" width="24" height="24" aria-hidden>
              <rect width="64" height="64" rx="14" fill="#1f2830" />
              <path d="M32 12c-8.3 0-14 6.2-14 14v9l-4 7h36l-4-7v-9c0-7.8-5.7-14-14-14z" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinejoin="round" />
              <path d="M26 46a6 6 0 0 0 12 0" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinecap="round" />
              <path d="M24 28l6 6 11-11" fill="none" stroke="#e6edf3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Tickler
          </Link>
          <span className="divider" />
          <span className="tag">the workspace — ask anything, approve what matters</span>
          <div className="techbadges">
            <span className="badge">graph: FalkorDB</span>
            <span className="badge">timers: Temporal</span>
            <span className="badge">models: open weights</span>
            <a href="https://github.com/abubakar-ahmed-dev/tickler" target="_blank" rel="noreferrer" className="tag" style={{ color: "var(--dim)" }}>GitHub ↗</a>
          </div>
        </div>
      </header>
      <main className="shell">
        <section className="panel" id="chat">
          <h2>Concierge<span className="sub">every answer cites the lease sentence it came from · tool calls show as chips</span></h2>
          <div id="log" ref={logRef}>
            {chat.map((m, i) => (
              <div key={i} className={`msg ${m.who}`}>
                {m.who === "bot" && m.tools && <div className="tools">tools: {m.tools.join(" → ")}</div>}
                {m.text}
                {m.citations?.map((c, k) => (
                  <span className="cite" key={k}>
                    <b>why: </b>{c.chain.map(s => s.detail).join("  →  ")}
                  </span>
                ))}
              </div>
            ))}
            {thinking && <div className="msg bot tools">thinking…</div>}
          </div>
          {chat.length <= 1 && !thinking && (
            <div className="pad starters">
              {STARTERS.map(s => (
                <button key={s} className="ghost starter" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}
          <div id="askbar">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Ask about deadlines, why a reminder exists, request a letter…"
              aria-label="Ask the Concierge"
            />
            <button onClick={() => send()} disabled={thinking || !input.trim()}>send</button>
          </div>
        </section>

        <div className="col">
          <section className="panel">
            <h2>Getting started<span className="sub">{`step ${Math.min(nextStep + 1, 4)} of 4`}</span></h2>
            <div className="list">
              {steps.map((s, i) => (
                <div className={`item step ${s.done ? "done" : ""} ${i === nextStep ? "next" : ""}`} key={s.label}>
                  <span className="stepnum">{s.done ? "✓" : i + 1}</span>
                  <div>
                    <div className={i === nextStep ? "strong" : ""}>{s.label}</div>
                    {!s.done && <div className="k">{s.hint}</div>}
                  </div>
                </div>
              ))}
              <div className="row" style={{ marginTop: 4 }}>
                <button onClick={loadSample} disabled={!!busy}>Load a sample lease</button>
                <label className="button ghost" style={{ padding: "9px 14px", borderRadius: 6, cursor: "pointer" }}>
                  Upload your PDF
                  <input type="file" accept="application/pdf" style={{ display: "none" }} aria-label="Upload a lease PDF"
                    onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
                </label>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Portfolio</h2>
            <div className="subhint" style={{ padding: "8px 14px 0" }}>select a lease to see its terms, deadlines and live alerts</div>
            <div className="pad row">
              <select value={leaseId} onChange={e => setLeaseId(e.target.value)} aria-label="Select a lease">
                <option value="">{leases.length ? "— select a lease —" : "no leases yet"}</option>
                {leases.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.id} · {STATUS_LABEL[l.status]?.label ?? l.status}{l.needsReview ? ` · ${l.needsReview} to review` : ""}
                  </option>
                ))}
              </select>
              {current && <span className={`badge ${STATUS_LABEL[current.status]?.cls ?? ""}`}>{STATUS_LABEL[current.status]?.label ?? current.status}</span>}
            </div>
          </section>

          {state && (
            <section className="panel">
              <h2>
                Review the terms {unapproved.length > 0
                  ? <span className="badge warn">{unapproved.length} waiting on you</span>
                  : <span className="badge ok">approved</span>}
              </h2>
              <div className="list">
                {unapproved.length > 0 && (
                  <div className="hint">
                    Each term shows the sentence it came from. Edit anything wrong — your fixes are remembered —
                    then approve. Reminders arm only after you approve.
                  </div>
                )}
                {unapproved.map(f => (
                  <div className="item" key={`${f.clause}-${f.key}-${f.page ?? "x"}`}>
                    <div className="row">
                      <span className="k">{f.key}</span>
                      <input className="field-edit" aria-label={`value for ${f.key}`}
                        value={f.value === "unknown" && edits[f.key] === undefined ? "" : edits[f.key] ?? f.value}
                        onChange={e => setEdits(s => ({ ...s, [f.key]: e.target.value }))}
                        placeholder={f.value === "unknown" ? "not found in lease" : f.value} />
                      <span className="badge">{Math.round((f.confidence ?? 0) * 100)}% sure</span>
                    </div>
                    {f.quote
                      ? <div className="q">“{f.quote.slice(0, 150)}” — page {(f.page ?? 0) + 1}</div>
                      : <div className="q">no source sentence — {f.value === "unknown" ? "not stated in the lease" : "set by you"}</div>}
                  </div>
                ))}
                {unapproved.length > 0 && (
                  <div className="row">
                    <div className="row" style={{ gap: 12 }}>
                      <label className="row" style={{ gap: 4, cursor: "pointer" }}>
                        <input type="radio" name="arm" checked={armMode === "demo"} onChange={() => setArmMode("demo")} />
                        <span>demo speed <span className="k">(fires in ~24s)</span></span>
                      </label>
                      <label className="row" style={{ gap: 4, cursor: "pointer" }}>
                        <input type="radio" name="arm" checked={armMode === "real"} onChange={() => setArmMode("real")} />
                        <span>real schedule <span className="k">(90/30/7 days before)</span></span>
                      </label>
                    </div>
                    <button onClick={submitReview} disabled={!!busy}>Approve{edits && ` (${Object.keys(edits).length} edited)`} &amp; arm reminders</button>
                  </div>
                )}
              </div>
            </section>
          )}

          {state && (
            <section className="panel">
              <h2>Deadlines</h2>
              <div className="list">
                {unapproved.length > 0 && (
                  <div className="hint">nothing arms until you approve the terms above{state.deadlines.some(d => d.needsReview) ? " — including the deadline that needs your look:" : "."}</div>
                )}
                {state.deadlines.map(d => (
                  <div className="item" key={d.type + d.date}>
                    <div className="row">
                      <span className="badge ok">{d.type.replace("_", " ")}</span>
                      <b>{d.date === "unknown" ? "—" : d.date}</b>
                      {d.needsReview
                        ? <span className="badge bad" title={d.reason}>needs your look</span>
                        : d.reminders.filter(Boolean).length > 0
                          ? <span className="badge ok">{d.reminders.filter(Boolean).length} reminders armed</span>
                          : state.lease?.status === "armed" ? <span className="badge">armed</span> : null}
                    </div>
                    {d.needsReview && d.reason && <div className="k">{d.reason}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {state && (
            <section className="panel">
              <h2>Alerts &amp; letters</h2>
              <div className="list">
                {scheduledCount > 0 && firedCount === 0 && (
                  <div className="hint">{scheduledCount} reminder timers running — first alert lands shortly (demo mode), this panel updates live.</div>
                )}
                {state.alerts.length === 0 && scheduledCount === 0 && (
                  <div className="hint">No alerts yet. Arm reminders and they appear here as they fire.</div>
                )}
                {state.alerts.map(a => (
                  <div className={`item alert ${a.action}`} key={a.alertId}>
                    <div className="row">
                      <span className={`badge ${a.action === "escalate" ? "bad" : a.action === "alert" ? "warn" : ""}`}>
                        {a.action === "escalate" ? "urgent → letter drafted" : a.action === "alert" ? "heads up" : "snoozed"}
                      </span>
                      <span>{a.message}</span>
                    </div>
                    {a.reason && <div className="k">watcher: {a.reason}</div>}
                    {a.draftId && a.draftStatus === "pending" && (
                      <div className="row" style={{ marginTop: 6 }}>
                        <span className="badge warn">letter pending — your call</span>
                        <button className="ghost" onClick={() => decideDraft(a.draftId!, "approve")}>approve letter</button>
                        <button className="ghost" onClick={() => decideDraft(a.draftId!, "discard")}>discard</button>
                      </div>
                    )}
                    {a.draftStatus && a.draftStatus !== "pending" && <div className="k">letter {a.draftStatus}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
