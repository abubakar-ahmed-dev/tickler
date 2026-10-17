"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageSquare, ListChecks, CalendarClock, Bell, Upload, Sparkles,
  ArrowRight, Check, Quote, Zap, ShieldCheck, FileText,
} from "lucide-react";

type Lease = { id: string; title: string; status: string; deadlines: number; needsReview: number };
type Citation = { deadline: { type: string; date: string }; chain: Array<{ step: string; detail: string }> };
type ChatMsg = { who: "you" | "bot" | "system"; text: string; tools?: string[]; citations?: Citation[] };
type Field = { clause: string; key: string; value: string; confidence: number; approved: boolean; corrected: boolean; quote: string | null; page: number | null };
type Deadline = { type: string; date: string; needsReview: boolean; reason: string; reminders: string[] };
type Alert = { alertId: number; action: string; level: string; message: string; reason: string; at: string; draftId: number | null; draftStatus: string | null };
type LeaseState = { lease: { id: string; title: string; status: string; extractClean: boolean }; fields: Field[]; deadlines: Deadline[]; alerts: Alert[] };
type Tab = "chat" | "review" | "deadlines" | "alerts";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  parsing: { label: "reading PDF", cls: "" },
  parsed: { label: "parsed", cls: "" },
  extracting: { label: "extracting terms", cls: "" },
  awaiting_review: { label: "needs your review", cls: "warn" },
  armed: { label: "reminders running", cls: "ok" },
  rejected: { label: "rejected", cls: "bad" },
};

const STARTERS = [
  { icon: CalendarClock, text: "What deadlines are coming up?" },
  { icon: Quote, text: "Why does this lease have a term end deadline?" },
  { icon: FileText, text: "Draft the renewal notice for this lease." },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseId, setLeaseId] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([
    { who: "bot", text: "I'm the Concierge. I answer from your leases — and every answer shows the exact sentence it came from. Load a sample lease, then ask me anything." },
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
  useEffect(() => {
    if (!leaseId) return;
    const t = setInterval(() => refreshState(leaseId), 5000);
    return () => clearInterval(t);
  }, [leaseId, refreshState]);
  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [chat, thinking]);

  const current = leases.find(l => l.id === leaseId);
  const unapproved = state?.fields.filter(f => !f.approved) ?? [];
  const scheduledCount = state?.deadlines.reduce((n, d) => n + d.reminders.filter(Boolean).length, 0) ?? 0;
  const pendingDrafts = state?.alerts.filter(a => a.draftId && a.draftStatus === "pending") ?? [];

  const steps = [
    { done: leases.length > 0, label: "Load a lease" },
    { done: !!state && unapproved.length === 0, label: "Approve terms" },
    { done: state?.lease?.status === "armed", label: "Arm reminders" },
    { done: (state?.alerts.length ?? 0) > 0, label: "See alerts" },
  ];
  const doneCount = steps.filter(s => s.done).length;

  const send = async (raw?: string) => {
    const q = (raw ?? input).trim();
    if (!q || thinking) return;
    setTab("chat");
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
    setBusy("reading and extracting the sample");
    try {
      const r = await fetch("/api/sample", { method: "POST" });
      const j = await r.json();
      if (j.error) say(`Couldn't load the sample: ${j.error}`);
      else {
        await refreshLeases();
        setLeaseId(j.leaseId);
        say(`Sample loaded — ${j.deadlines} deadline(s) extracted, ${j.validation?.length ? `${j.validation.length} quote(s) failed grounding` : "every quote grounded"}. Open Review to approve the terms.`);
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
    setBusy("extracting terms — up to a minute");
    await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leaseId: j.leaseId }) });
    setBusy("");
    refreshLeases(); refreshState(j.leaseId!);
    say(`"${file.name}" processed. Open Review to check the terms, then approve to arm reminders.`);
  };

  const submitReview = async () => {
    if (!state) return;
    const corrections = Object.entries(edits).map(([key, newValue]) => ({ key, newValue }));
    setBusy("approving + arming");
    try {
      const r = await fetch("/api/review", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaseId, corrections, mode: armMode }),
      });
      const j = await r.json();
      if (j.error) say(`Arm failed: ${j.error}`);
      else say(`Approved with ${corrections.length} correction(s). ${j.armed} deadline(s) armed` +
        (j.mode === "demo" ? ` — first alert lands in ~${j.firstFireSec}s. Watch Alerts.` : " on the real 90/30/7-day schedule."));
      setTab("deadlines");
    } catch (e) { say(`Connection problem: ${(e as Error).message}`); }
    setBusy("");
    refreshState(leaseId); refreshLeases();
  };

  const decideDraft = async (draftId: number, action: "approve" | "discard") => {
    await fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draftId, action }) });
    say(action === "approve" ? "Letter approved — ready to send." : "Letter discarded.");
    refreshState(leaseId);
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof MessageSquare; badge?: number }> = [
    { id: "chat", label: "Concierge", icon: MessageSquare },
    { id: "review", label: "Review", icon: ListChecks, badge: unapproved.length || undefined },
    { id: "deadlines", label: "Deadlines", icon: CalendarClock },
    { id: "alerts", label: "Alerts", icon: Bell, badge: pendingDrafts.length || undefined },
  ];

  return (
    <div className="app">
      <aside className="rail">
        <Link href="/" className="brand">
          <svg viewBox="0 0 64 64" width="24" height="24" aria-hidden>
            <rect width="64" height="64" rx="14" fill="#1f2830" />
            <path d="M32 12c-8.3 0-14 6.2-14 14v9l-4 7h36l-4-7v-9c0-7.8-5.7-14-14-14z" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinejoin="round" />
            <path d="M26 46a6 6 0 0 0 12 0" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinecap="round" />
            <path d="M24 28l6 6 11-11" fill="none" stroke="#e6edf3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Tickler
        </Link>

        <nav className="railnav">
          {tabs.map(t => (
            <button key={t.id} className={`railitem ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <t.icon size={17} strokeWidth={1.8} />
              <span>{t.label}</span>
              {t.badge ? <em>{t.badge}</em> : null}
            </button>
          ))}
        </nav>

        <div className="railfoot">
          <div className="progress">
            <div className="progress-label">
              <span>Setup</span>
              <b>{doneCount}/4</b>
            </div>
            <div className="progress-track"><div style={{ width: `${(doneCount / 4) * 100}%` }} /></div>
            {nextStepHint(steps)}
          </div>
          <div className="railtech">
            <span>graph · FalkorDB</span>
            <span>timers · Temporal</span>
            <span>models · open weights</span>
            <a href="https://github.com/abubakar-ahmed-dev/tickler" target="_blank" rel="noreferrer">GitHub ↗</a>
          </div>
        </div>
      </aside>

      <div className="work">
        <div className="contextbar">
          <select value={leaseId} onChange={e => setLeaseId(e.target.value)} aria-label="Select a lease">
            <option value="">{leases.length ? "Select a lease" : "No leases yet"}</option>
            {leases.map(l => (
              <option key={l.id} value={l.id}>
                {l.id} · {STATUS_LABEL[l.status]?.label ?? l.status}{l.needsReview ? ` (${l.needsReview})` : ""}
              </option>
            ))}
          </select>
          {current && <span className={`badge ${STATUS_LABEL[current.status]?.cls ?? ""}`}>{STATUS_LABEL[current.status]?.label ?? current.status}</span>}
          <span className="spacer" />
          <button className="btn ghost" onClick={loadSample} disabled={!!busy}><Sparkles size={15} /> Sample lease</button>
          <label className="btn ghost">
            <Upload size={15} /> Upload PDF
            <input type="file" accept="application/pdf" style={{ display: "none" }} aria-label="Upload a lease PDF"
              onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          {busy && <span className="badge warn">{busy}…</span>}
        </div>

        {unapproved.length > 0 && leaseId && tab !== "review" && (
          <button className="nudge" onClick={() => setTab("review")}>
            <Zap size={14} /> {unapproved.length} terms waiting on your review — nothing arms until you approve. <b>Open Review <ArrowRight size={12} /></b>
          </button>
        )}

        {tab === "chat" && (
          <section className="stage chatstage">
            <div className="log" ref={logRef}>
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
              <div className="empty">
                <Sparkles size={26} />
                <p>Ask about deadlines, request a letter, or say a preference —<br />I&apos;ll answer with the lease sentence in hand.</p>
                <div className="startergrid">
                  {STARTERS.map(s => (
                    <button key={s.text} className="startercard" onClick={() => send(s.text)} disabled={!leaseId}>
                      <s.icon size={16} />
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
                {!leaseId && <p className="hint">load a lease first — sample works great</p>}
              </div>
            )}
            <div className="askbar">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
                placeholder="Ask about deadlines, why a reminder exists, request a letter…"
                aria-label="Ask the Concierge"
              />
              <button className="btn primary" onClick={() => send()} disabled={thinking || !input.trim()}>Send</button>
            </div>
          </section>
        )}

        {tab === "review" && (
          <section className="stage">
            <div className="stagehead">
              <div>
                <h2>Review the terms</h2>
                <p className="hint">Each term shows the sentence it came from. Edit anything wrong — your fixes are remembered. Reminders arm only after you approve.</p>
              </div>
              {unapproved.length > 0 && <span className="badge warn">{unapproved.length} waiting on you</span>}
              {unapproved.length === 0 && <span className="badge ok">approved</span>}
            </div>
            <div className="scroller">
              {!state && <div className="empty"><ListChecks size={26} /><p>select a lease to review its terms</p></div>}
              {state && unapproved.length === 0 && (
                <div className="empty">
                  <ShieldCheck size={26} />
                  <p>every term approved{state.lease?.status === "armed" ? " — reminders are running." : " — arm them to finish setup."}</p>
                  {state.lease?.status !== "armed" && (
                    <button className="btn primary" onClick={submitReview} disabled={!!busy}>Arm reminders now</button>
                  )}
                </div>
              )}
              {unapproved.map(f => (
                <div className="fieldcard" key={`${f.clause}-${f.key}-${f.page ?? "x"}`}>
                  <div className="fieldtop">
                    <span className="fkey">{f.key.replace(/_/g, " ")}</span>
                    <span className="clausechip">{f.clause.replace(/_/g, " ")}</span>
                    <span className="badge">{Math.round((f.confidence ?? 0) * 100)}% sure</span>
                  </div>
                  <input className="fieldinput" aria-label={`value for ${f.key}`}
                    value={f.value === "unknown" && edits[f.key] === undefined ? "" : edits[f.key] ?? f.value}
                    onChange={e => setEdits(s => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={f.value === "unknown" ? "not stated in the lease" : f.value} />
                  {f.quote
                    ? <div className="fsource"><Quote size={12} /> “{f.quote.slice(0, 170)}” <span>— page {(f.page ?? 0) + 1}</span></div>
                    : <div className="fsource none">no source sentence — {f.value === "unknown" ? "not stated in the lease" : "set by you"}</div>}
                </div>
              ))}
              {unapproved.length > 0 && (
                <div className="armbox">
                  <div className="armmodes">
                    <label className={armMode === "demo" ? "on" : ""}>
                      <input type="radio" name="arm" checked={armMode === "demo"} onChange={() => setArmMode("demo")} />
                      <div><b>Demo speed</b><span>alerts fire in ~24s — watch them land live</span></div>
                    </label>
                    <label className={armMode === "real" ? "on" : ""}>
                      <input type="radio" name="arm" checked={armMode === "real"} onChange={() => setArmMode("real")} />
                      <div><b>Real schedule</b><span>90 / 30 / 7 days before each deadline</span></div>
                    </label>
                  </div>
                  <button className="btn primary big" onClick={submitReview} disabled={!!busy}>
                    Approve &amp; arm reminders <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "deadlines" && (
          <section className="stage">
            <div className="stagehead">
              <div>
                <h2>Deadlines</h2>
                <p className="hint">Computed in code from the approved terms. Reminders fire on their own — no action needed once armed.</p>
              </div>
              {scheduledCount > 0 && <span className="badge ok">{scheduledCount} timers running</span>}
            </div>
            <div className="scroller">
              {!state && <div className="empty"><CalendarClock size={26} /><p>select a lease to see its deadlines</p></div>}
              {state?.deadlines.length === 0 && <div className="empty"><CalendarClock size={26} /><p>no deadlines yet — approve the terms first</p></div>}
              {state?.deadlines.map(d => (
                <div className="deadlinecard" key={d.type + d.date}>
                  <div className="dl-left">
                    <span className="dl-type">{d.type.replace(/_/g, " ")}</span>
                    <b className={d.date === "unknown" ? "dim" : ""}>{d.date === "unknown" ? "date unknown" : d.date}</b>
                    {d.needsReview && d.reason && <span className="dl-reason">{d.reason}</span>}
                  </div>
                  <div className="dl-right">
                    {d.needsReview
                      ? <span className="badge bad">needs your look</span>
                      : d.reminders.filter(Boolean).length > 0
                        ? <span className="badge ok">{d.reminders.filter(Boolean).length} reminders armed</span>
                        : state.lease?.status === "armed"
                          ? <span className="badge">armed</span>
                          : <span className="badge">not armed yet</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "alerts" && (
          <section className="stage">
            <div className="stagehead">
              <div>
                <h2>Alerts &amp; letters</h2>
                <p className="hint">The Watcher decides when each timer fires: snooze, heads-up, or escalate into a drafted letter. Letters wait for your call.</p>
              </div>
              {pendingDrafts.length > 0 && <span className="badge warn">{pendingDrafts.length} letter{pendingDrafts.length > 1 ? "s" : ""} pending</span>}
            </div>
            <div className="scroller">
              {!state && <div className="empty"><Bell size={26} /><p>select a lease to see its alerts</p></div>}
              {state && state.alerts.length === 0 && (
                <div className="empty">
                  <Bell size={26} />
                  <p>{scheduledCount > 0
                    ? `${scheduledCount} reminder timers running — the first alert lands shortly (demo mode). This page updates live.`
                    : "No alerts yet. Arm reminders and they appear here as they fire."}</p>
                </div>
              )}
              {state?.alerts.map(a => (
                <div className={`alertcard ${a.action}`} key={a.alertId}>
                  <div className="alerttop">
                    <span className={`badge ${a.action === "escalate" ? "bad" : a.action === "alert" ? "warn" : ""}`}>
                      {a.action === "escalate" ? "urgent → letter drafted" : a.action === "alert" ? "heads up" : "snoozed"}
                    </span>
                    <span className="when">{new Date(a.at).toLocaleTimeString()}</span>
                  </div>
                  <p className="amsg">{a.message}</p>
                  {a.reason && <p className="areason">watcher: {a.reason}</p>}
                  {a.draftId && a.draftStatus === "pending" && (
                    <div className="draftrow">
                      <span className="badge warn">letter pending — your call</span>
                      <button className="btn ghost" onClick={() => decideDraft(a.draftId!, "approve")}>Approve letter</button>
                      <button className="btn ghost" onClick={() => decideDraft(a.draftId!, "discard")}>Discard</button>
                    </div>
                  )}
                  {a.draftStatus && a.draftStatus !== "pending" && <p className="areason">letter {a.draftStatus}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function nextStepHint(steps: Array<{ done: boolean; label: string }>) {
  const next = steps.findIndex(s => !s.done);
  return next === -1
    ? <p className="nextdone">all set ✓</p>
    : <p className="next">next: {steps[next].label.toLowerCase()}</p>;
}
