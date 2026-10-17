"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageSquare, ListChecks, CalendarClock, Bell, Upload, Sparkles,
  ArrowRight, Check, Quote, Zap, ShieldCheck, FileText, Paperclip,
  PanelLeftClose, PanelLeftOpen,
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
  extracting: { label: "reading your lease", cls: "" },
  awaiting_review: { label: "waiting for your review", cls: "warn" },
  armed: { label: "reminders on", cls: "ok" },
  rejected: { label: "rejected", cls: "bad" },
};

const STARTERS = [
  { icon: CalendarClock, text: "What deadlines are coming up?" },
  { icon: Quote, text: "Why does this lease have a term end deadline?" },
  { icon: FileText, text: "Write the renewal notice for this lease." },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const [collapsed, setCollapsed] = useState(false);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseId, setLeaseId] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([
    { who: "bot", text: "Hi! I read your leases and answer questions about them — and every answer shows the exact sentence it came from. Load a sample lease to try it." },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [state, setState] = useState<LeaseState | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [armMode, setArmMode] = useState<"demo" | "real">("demo");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("tickler-rail");
    if (saved === "collapsed") setCollapsed(true);
  }, []);
  const toggleRail = () => {
    setCollapsed(c => {
      window.localStorage.setItem("tickler-rail", c ? "open" : "collapsed");
      return !c;
    });
  };

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
    { done: !!state && unapproved.length === 0, label: "Check the details" },
    { done: state?.lease?.status === "armed", label: "Turn on reminders" },
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
    setBusy("reading the sample lease");
    try {
      const r = await fetch("/api/sample", { method: "POST" });
      const j = await r.json();
      if (j.error) say(`Couldn't load the sample: ${j.error}`);
      else {
        await refreshLeases();
        setLeaseId(j.leaseId);
        say(`Sample loaded — ${j.deadlines} deadline(s) found. Open Check details to look them over, then approve to turn on reminders.`);
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
    setBusy("reading your lease — up to a minute");
    await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leaseId: j.leaseId }) });
    setBusy("");
    refreshLeases(); refreshState(j.leaseId!);
    say(`"${file.name}" processed. Open Check details to look things over, then approve to turn on reminders.`);
  };

  const submitReview = async () => {
    if (!state) return;
    const corrections = Object.entries(edits).map(([key, newValue]) => ({ key, newValue }));
    setBusy("turning reminders on");
    try {
      const r = await fetch("/api/review", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaseId, corrections, mode: armMode }),
      });
      const j = await r.json();
      if (j.error) say(`Couldn't turn reminders on: ${j.error}`);
      else say(`Approved with ${corrections.length} change(s). ${j.armed} deadline(s) armed` +
        (j.mode === "demo" ? ` — first alert lands in about ${j.firstFireSec} seconds. Watch Alerts.` : " on the real 90/30/7-day schedule."));
      setTab("deadlines");
    } catch (e) { say(`Connection problem: ${(e as Error).message}`); }
    setBusy("");
    refreshState(leaseId); refreshLeases();
  };

  const decideDraft = async (draftId: number, action: "approve" | "discard") => {
    await fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draftId, action }) });
    say(action === "approve" ? "Letter approved — ready to send." : "Letter thrown away.");
    refreshState(leaseId);
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof MessageSquare; badge?: number }> = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "review", label: "Check details", icon: ListChecks, badge: unapproved.length || undefined },
    { id: "deadlines", label: "Deadlines", icon: CalendarClock },
    { id: "alerts", label: "Alerts", icon: Bell, badge: pendingDrafts.length || undefined },
  ];

  return (
    <div className={`app ${collapsed ? "railcollapsed" : ""}`}>
      <aside className="rail">
        <div className="railtop">
          <Link href="/" className="brand" title="Back to home">
            <svg viewBox="0 0 64 64" width="24" height="24" aria-hidden>
              <rect width="64" height="64" rx="14" fill="#1f2830" />
              <path d="M32 12c-8.3 0-14 6.2-14 14v9l-4 7h36l-4-7v-9c0-7.8-5.7-14-14-14z" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinejoin="round" />
              <path d="M26 46a6 6 0 0 0 12 0" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinecap="round" />
              <path d="M24 28l6 6 11-11" fill="none" stroke="#e6edf3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Tickler</span>
          </Link>
          <button className="iconbtn" onClick={toggleRail} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label="Toggle sidebar">
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav className="railnav">
          {tabs.map(t => (
            <button key={t.id} className={`railitem ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}
              title={t.label}>
              <t.icon size={17} strokeWidth={1.8} />
              {!collapsed && <span>{t.label}</span>}
              {t.badge ? <em>{collapsed ? "•" : t.badge}</em> : null}
            </button>
          ))}
        </nav>

        {!collapsed && (
          <div className="railfoot">
            <div className="progress">
              <div className="progress-label"><span>Setup</span><b>{doneCount}/4</b></div>
              <div className="progress-track"><div style={{ width: `${(doneCount / 4) * 100}%` }} /></div>
              {(() => {
                const next = steps.findIndex(s => !s.done);
                return next === -1
                  ? <p className="nextdone">all set ✓</p>
                  : <p className="next">next: {steps[next].label.toLowerCase()}</p>;
              })()}
            </div>
          </div>
        )}
      </aside>

      <div className="work">
        <div className="contextbar">
          <span className="viewing">Viewing:</span>
          <select value={leaseId} onChange={e => setLeaseId(e.target.value)} aria-label="Switch between loaded leases">
            <option value="">{leases.length ? "Pick a lease to view" : "No leases yet — load a sample or upload a PDF"}</option>
            {leases.filter(l => l.title.startsWith("Sample")).length > 0 && (
              <optgroup label="Sample leases">
                {leases.filter(l => l.title.startsWith("Sample")).map(l => (
                  <option key={l.id} value={l.id}>
                    {l.id} · {STATUS_LABEL[l.status]?.label ?? l.status}{l.needsReview ? ` (${l.needsReview})` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            {leases.filter(l => !l.title.startsWith("Sample")).length > 0 && (
              <optgroup label="Your uploads">
                {leases.filter(l => !l.title.startsWith("Sample")).map(l => (
                  <option key={l.id} value={l.id}>
                    {l.id} · {STATUS_LABEL[l.status]?.label ?? l.status}{l.needsReview ? ` (${l.needsReview})` : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {current && <span className={`badge ${STATUS_LABEL[current.status]?.cls ?? ""}`}>{STATUS_LABEL[current.status]?.label ?? current.status}</span>}
          <span className="spacer" />
          {busy && <span className="badge warn">{busy}…</span>}
        </div>

        {unapproved.length > 0 && leaseId && tab !== "review" && (
          <button className="nudge" onClick={() => setTab("review")}>
            <Zap size={14} /> {unapproved.length} details need your review — reminders stay off until you approve. <b>Open Check details <ArrowRight size={12} /></b>
          </button>
        )}

        {tab === "chat" && (
          <section className="stage chatstage">
            <div className="log" ref={logRef}>
              {chat.map((m, i) => (
                <div key={i} className={`msg ${m.who}`}>
                  {m.who === "bot" && m.tools && <div className="tools">steps taken: {m.tools.join(" → ")}</div>}
                  {m.text}
                  {m.citations?.map((c, k) => (
                    <span className="cite" key={k}>
                      <b>where it came from: </b>{c.chain.map(s => s.detail).join("  →  ")}
                    </span>
                  ))}
                </div>
              ))}
              {thinking && <div className="msg bot tools">thinking…</div>}
            </div>
            {chat.length <= 1 && !thinking && (
              <div className="empty">
                <Sparkles size={26} />
                <p>Ask about deadlines, request a letter, or tell me how you like things done —<br />I&apos;ll answer with the lease sentence in hand.</p>
                <div className="startergrid">
                  {STARTERS.map(s => (
                    <button key={s.text} className="startercard" onClick={() => send(s.text)} disabled={!leaseId}>
                      <s.icon size={16} />
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
                {!leaseId && <p className="hint">load a lease first — the sample works great</p>}
              </div>
            )}
            <div className="askbar">
              <label className="btn icon" title="Upload a lease PDF">
                <Upload size={16} />
                <input type="file" accept="application/pdf" style={{ display: "none" }} aria-label="Upload a lease PDF"
                  onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              <button className="btn icon" onClick={loadSample} disabled={!!busy} title="Load a sample lease">
                <Sparkles size={16} />
              </button>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
                placeholder="Ask about your leases…"
                aria-label="Ask about your leases"
              />
              <button className="btn primary" onClick={() => send()} disabled={thinking || !input.trim()}>Send</button>
            </div>
          </section>
        )}

        {tab === "review" && (
          <section className="stage">
            <div className="stagehead">
              <div>
                <h2>Check the details</h2>
                <p className="hint">Each detail shows the sentence it came from. Fix anything wrong — your fixes are remembered. Reminders only start after you approve.</p>
              </div>
              {unapproved.length > 0 && <span className="badge warn">{unapproved.length} waiting on you</span>}
              {unapproved.length === 0 && <span className="badge ok">approved</span>}
            </div>
            <div className="scroller">
              {!state && <div className="empty"><ListChecks size={26} /><p>select a lease to check its details</p></div>}
              {state && unapproved.length === 0 && (
                <div className="empty">
                  <ShieldCheck size={26} />
                  <p>everything approved{state.lease?.status === "armed" ? " — reminders are running." : " — turn reminders on to finish setup."}</p>
                  {state.lease?.status !== "armed" && (
                    <button className="btn primary" onClick={submitReview} disabled={!!busy}>Turn on reminders</button>
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
                    placeholder={f.value === "unknown" ? "not written in the lease" : f.value} />
                  {f.quote
                    ? <div className="fsource"><Quote size={12} /> “{f.quote.slice(0, 170)}” <span>— page {(f.page ?? 0) + 1}</span></div>
                    : <div className="fsource none">no source sentence — {f.value === "unknown" ? "not written in the lease" : "set by you"}</div>}
                </div>
              ))}
              {unapproved.length > 0 && (
                <div className="armbox">
                  <div className="armmodes">
                    <label className={armMode === "demo" ? "on" : ""}>
                      <input type="radio" name="arm" checked={armMode === "demo"} onChange={() => setArmMode("demo")} />
                      <div><b>Demo speed</b><span>alerts land in about 24 seconds — watch them live</span></div>
                    </label>
                    <label className={armMode === "real" ? "on" : ""}>
                      <input type="radio" name="arm" checked={armMode === "real"} onChange={() => setArmMode("real")} />
                      <div><b>Real schedule</b><span>90 / 30 / 7 days before each deadline</span></div>
                    </label>
                  </div>
                  <button className="btn primary big" onClick={submitReview} disabled={!!busy}>
                    Approve &amp; turn on reminders <ArrowRight size={15} />
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
                <p className="hint">These come straight from the details you approved. Reminders fire on their own — nothing for you to do once they&apos;re on.</p>
              </div>
              {scheduledCount > 0 && <span className="badge ok">{scheduledCount} reminders running</span>}
            </div>
            <div className="scroller">
              {!state && <div className="empty"><CalendarClock size={26} /><p>select a lease to see its deadlines</p></div>}
              {state?.deadlines.length === 0 && <div className="empty"><CalendarClock size={26} /><p>no deadlines yet — check the details first</p></div>}
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
                        ? <span className="badge ok">{d.reminders.filter(Boolean).length} reminders on</span>
                        : state.lease?.status === "armed"
                          ? <span className="badge">on</span>
                          : <span className="badge">not on yet</span>}
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
                <p className="hint">When a reminder fires, the helper decides: wait, give a heads-up, or draft a letter. Letters always wait for your approval.</p>
              </div>
              {pendingDrafts.length > 0 && <span className="badge warn">{pendingDrafts.length} letter{pendingDrafts.length > 1 ? "s" : ""} waiting</span>}
            </div>
            <div className="scroller">
              {!state && <div className="empty"><Bell size={26} /><p>select a lease to see its alerts</p></div>}
              {state && state.alerts.length === 0 && (
                <div className="empty">
                  <Bell size={26} />
                  <p>{scheduledCount > 0
                    ? `${scheduledCount} reminders running — the first alert lands shortly (demo speed). This page updates by itself.`
                    : "No alerts yet. Turn reminders on and they show up here as they fire."}</p>
                </div>
              )}
              {state?.alerts.map(a => (
                <div className={`alertcard ${a.action}`} key={a.alertId}>
                  <div className="alerttop">
                    <span className={`badge ${a.action === "escalate" ? "bad" : a.action === "alert" ? "warn" : ""}`}>
                      {a.action === "escalate" ? "urgent → letter written" : a.action === "alert" ? "heads up" : "waited"}
                    </span>
                    <span className="when">{new Date(a.at).toLocaleTimeString()}</span>
                  </div>
                  <p className="amsg">{a.message}</p>
                  {a.reason && <p className="areason">why: {a.reason}</p>}
                  {a.draftId && a.draftStatus === "pending" && (
                    <div className="draftrow">
                      <span className="badge warn">letter waiting — your call</span>
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
