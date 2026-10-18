"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MessageSquare, ListChecks, CalendarClock, Bell, Upload, Sparkles,
  ArrowRight, Check, Quote, Zap, ShieldCheck, FileText, Paperclip,
  PanelLeftClose, PanelLeftOpen, Plus, CircleDot, ChevronDown, Folder, User,
  ScanSearch,
} from "lucide-react";
import PdfPeek from "./pdf-peek";

type Lease = { id: string; title: string; status: string; deadlines: number; needsReview: number };
type Citation = { deadline: { type: string; date: string; needsReview?: boolean }; clause?: string; chain: Array<{ step: string; detail: string }> };
type ChainStep = { step: string; detail: string };
type ChatMsg = { who: "you" | "bot" | "system"; text: string; tools?: string[]; citations?: Citation[] };
type Field = { clause: string; key: string; value: string; confidence: number; approved: boolean; corrected: boolean; quote: string | null; page: number | null };
type Deadline = { type: string; date: string; needsReview: boolean; reason: string; reminders: string[] };
type Alert = { alertId: number; action: string; level: string; message: string; reason: string; at: string; emailed?: boolean; draftId: number | null; draftStatus: string | null };
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

const STATUS_DOT: Record<string, string> = { armed: "ok", awaiting_review: "warn", rejected: "bad" };

const STARTERS = [
  { icon: CalendarClock, text: "What deadlines are coming up?" },
  { icon: Quote, text: "Why does this lease have a term end deadline?" },
  { icon: FileText, text: "Write the renewal notice for this lease." },
];

const firstPage = (c: Citation): number | null => {
  for (const s of c.chain) {
    const m = s.detail.match(/page (\d+)\)?$/i);
    if (s.step === "quote" && m) return Number(m[1]) + 1;
  }
  return null;
};
const stripPage = (d: string) => d.replace(/\s*\(page \d+\)\s*$/i, "");

function MiniBell() {
  return (
    <svg viewBox="0 0 64 64" width="15" height="15" aria-hidden>
      <path d="M32 12c-8.3 0-14 6.2-14 14v9l-4 7h36l-4-7v-9c0-7.8-5.7-14-14-14z" fill="none" stroke="#4cc38a" strokeWidth="5" strokeLinejoin="round" />
      <path d="M24 28l6 6 11-11" fill="none" stroke="#e6edf3" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 64 64" width="24" height="24" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#1f2830" />
      <path d="M32 12c-8.3 0-14 6.2-14 14v9l-4 7h36l-4-7v-9c0-7.8-5.7-14-14-14z" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinejoin="round" />
      <path d="M26 46a6 6 0 0 0 12 0" fill="none" stroke="#4cc38a" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 28l6 6 11-11" fill="none" stroke="#e6edf3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const [collapsed, setCollapsed] = useState(false);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leasesLoaded, setLeasesLoaded] = useState(false);
  const [leaseId, setLeaseId] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([
    { who: "bot", text: "Hi! I read your leases and answer questions about them, and every answer shows the exact sentence it came from. Load a sample lease to try it." },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [state, setState] = useState<LeaseState | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [armMode, setArmMode] = useState<"demo" | "real">("demo");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaved, setEmailSaved] = useState("");
  const [menuWhere, setMenuWhere] = useState<"none" | "ask" | "side">("none");
  const [leasesOpen, setLeasesOpen] = useState(true);
  const [openCites, setOpenCites] = useState<Record<number, number | undefined>>({});
  // evidence peek: one shared PDF viewer; opening another card swaps its content
  const [peek, setPeek] = useState<{ quote: string; page: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.localStorage.getItem("tickler-rail") === "collapsed") setCollapsed(true);
    if (window.localStorage.getItem("tickler-leases") === "closed") setLeasesOpen(false);
  }, []);
  const toggleRail = () => {
    setCollapsed(c => {
      window.localStorage.setItem("tickler-rail", c ? "open" : "collapsed");
      return !c;
    });
  };
  const toggleLeases = () => {
    setLeasesOpen(o => {
      window.localStorage.setItem("tickler-leases", o ? "closed" : "open");
      return !o;
    });
  };

  useEffect(() => {
    if (menuWhere === "none") return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".attachwrap") && !t.closest(".addwrap")) setMenuWhere("none");
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuWhere]);

  const say = useCallback((text: string) => setChat(c => [...c, { who: "system", text }]), []);

  const refreshLeases = useCallback(async () => {
    const r = await fetch("/api/leases");
    setLeases(await r.json());
    setLeasesLoaded(true);
  }, []);

  const refreshState = useCallback(async (id: string) => {
    if (!id) return setState(null);
    const r = await fetch(`/api/state?leaseId=${id}`);
    if (r.ok) setState(await r.json());
    setEdits({});
  }, []);

  useEffect(() => { refreshLeases(); }, [refreshLeases]);
  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(j => j.email && setEmailDraft(j.email)).catch(() => {});
  }, []);
  const saveEmail = async () => {
    const r = await fetch("/api/settings", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailDraft.trim() }),
    });
    const j = await r.json();
    setEmailSaved(j.error ? `couldn't save: ${j.error}` : "saved ✓, alerts will be emailed here");
    setTimeout(() => setEmailSaved(""), 4000);
  };
  useEffect(() => { refreshState(leaseId); }, [leaseId, refreshState]);
  useEffect(() => {
    if (!leaseId) return;
    const t = setInterval(() => refreshState(leaseId), 5000);
    return () => clearInterval(t);
  }, [leaseId, refreshState]);
  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [chat, thinking]);

  // seed a greeting when a lease is picked; reset when cleared
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!leaseId) {
      if (seededRef.current) {
        seededRef.current = null;
        setChat([{ who: "bot", text: "Hi! I read your leases and answer questions about them, and every answer shows the exact sentence it came from. Load a sample lease to try it." }]);
      }
      return;
    }
    if (seededRef.current === leaseId) return;
    seededRef.current = leaseId;
    // fresh seed replaces the greeting; a real conversation keeps its history
    setChat(c => (c.length <= 1
      ? [{ who: "bot", text: `We are now talking about ${leaseId}. Ask me anything about it, such as deadlines, the renewal notice, or deposit terms. I will answer with the exact sentence from the lease.` }]
      : [...c, { who: "bot", text: `We are now talking about ${leaseId}.` }]));
  }, [leaseId]);

  const current = leases.find(l => l.id === leaseId);
  const unapproved = state?.fields.filter(f => !f.approved) ?? [];
  const scheduledCount = state?.deadlines.reduce((n, d) => n + d.reminders.filter(Boolean).length, 0) ?? 0;
  const pendingDrafts = state?.alerts.filter(a => a.draftId && a.draftStatus === "pending") ?? [];

  const steps = [
    { done: leases.length > 0, label: "Load" },
    { done: !!state && unapproved.length === 0, label: "Check" },
    { done: state?.lease?.status === "armed", label: "Remind" },
    { done: (state?.alerts.length ?? 0) > 0, label: "Alerts" },
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
    setMenuWhere("none");
    try {
      const r = await fetch("/api/sample", { method: "POST" });
      const j = await r.json();
      if (j.error) say(`Couldn't load the sample: ${j.error}`);
      else {
        await refreshLeases();
        setLeaseId(j.leaseId);
        say(`Sample loaded, ${j.deadlines} deadline(s) found. Open Check details to look them over, then approve to turn on reminders.`);
      }
    } catch (e) { say(`Connection problem: ${(e as Error).message}`); }
    setBusy("");
  };

  const upload = async (file: File) => {
    setBusy("reading your PDF");
    setMenuWhere("none");
    const form = new FormData();
    form.set("file", file);
    let j: { leaseId?: string; error?: string };
    try {
      j = await (await fetch("/api/upload", { method: "POST", body: form })).json();
    } catch (e) { setBusy(""); say(`Connection problem: ${(e as Error).message}`); return; }
    if (j.error) { setBusy(""); say(`That PDF didn't work: ${j.error}`); return; }
    await refreshLeases();
    setLeaseId(j.leaseId!);
    setBusy("reading your lease, this can take up to a minute");
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
        (j.mode === "demo" ? `, first alert lands in about ${j.firstFireSec} seconds. Watch Alerts.` : " on the real 90/30/7-day schedule."));
      setTab("deadlines");
    } catch (e) { say(`Connection problem: ${(e as Error).message}`); }
    setBusy("");
    refreshState(leaseId); refreshLeases();
  };

  const decideDraft = async (draftId: number, action: "approve" | "discard") => {
    await fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draftId, action }) });
    say(action === "approve" ? "Letter approved, ready to send." : "Letter thrown away.");
    refreshState(leaseId);
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof MessageSquare; badge?: number }> = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "review", label: "Check details", icon: ListChecks, badge: unapproved.length || undefined },
    { id: "deadlines", label: "Deadlines", icon: CalendarClock },
    { id: "alerts", label: "Alerts", icon: Bell, badge: pendingDrafts.length || undefined },
  ];

  const attachMenu = (
    <div className="attachmenu">
      <button onClick={() => fileInputRef.current?.click()}>
        <Upload size={15} /> Upload a lease PDF
      </button>
      <button onClick={loadSample}>
        <Sparkles size={15} /> Try a sample lease
      </button>
      <input ref={fileInputRef} type="file" accept="application/pdf"
        style={{ display: "none" }} aria-label="Upload a lease PDF"
        onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
    </div>
  );

  return (
    <div className={`app ${collapsed ? "railcollapsed" : ""}`}>
      <aside className="rail">
        <div className="railtop">
          {!collapsed && (
            <Link href="/" className="brand" title="Back to home">
              <BrandMark />
              <span>Tickler</span>
            </Link>
          )}
          <button className={`iconbtn ${collapsed ? "solo" : ""}`} onClick={toggleRail}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label="Toggle sidebar">
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav className="railnav">
          {tabs.map(t => (
            <button key={t.id} className={`railitem ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)} title={t.label}>
              <t.icon size={17} strokeWidth={1.8} />
              {!collapsed && <span>{t.label}</span>}
              {t.badge ? <em>{collapsed ? "•" : t.badge}</em> : null}
            </button>
          ))}
        </nav>

        <div className="leases">
          {!collapsed && (
            <button className="leaseshead" onClick={toggleLeases} title={leasesOpen ? "Hide the lease list" : "Show the lease list"}>
              <span>Your leases</span>
              {leases.some(l => l.needsReview) && (
                <em title={`${leases.reduce((n, l) => n + l.needsReview, 0)} deadline(s) need your review across these leases`}>
                  {leases.reduce((n, l) => n + l.needsReview, 0)}
                </em>
              )}
              <ChevronDown size={13} className={`chev ${leasesOpen ? "" : "closed"}`} />
            </button>
          )}
          {collapsed && (
            <button className="railitem" title={`Your leases (${leases.length}), click to expand`} onClick={toggleRail}>
              <Folder size={17} strokeWidth={1.8} />
              {leases.some(l => l.needsReview) ? <em>•</em> : null}
            </button>
          )}
          {!collapsed && leasesOpen && (
            <>
              {!leasesLoaded ? (
                <div className="leaselist" aria-hidden>
                  {[0, 1, 2].map(i => <div key={i} className="skeleton row" />)}
                </div>
              ) : leases.length === 0 && <p className="leasesempty">nothing here yet</p>}
              {leasesLoaded && leases.length > 0 && (
                <div className="leaselist">
                {leases.map(l => (
                  <button key={l.id} className={`leaserow ${leaseId === l.id ? "active" : ""}`}
                    onClick={() => setLeaseId(l.id)}
                    title={`${l.id}, ${STATUS_LABEL[l.status]?.label ?? l.status}${l.needsReview ? ` · ${l.needsReview} deadline(s) need review` : ""}`}>
                    <CircleDot size={12} className={`dot ${STATUS_DOT[l.status] ?? ""}`} />
                    <span className="leasename">
                      {l.id}
                      {l.needsReview ? <em title={`${l.needsReview} deadline(s) need your review`}>{l.needsReview}</em> : null}
                    </span>
                  </button>
                ))}
                </div>
              )}
              <div className="addwrap">
                <button className="railitem addlease" onClick={() => setMenuWhere(w => (w === "side" ? "none" : "side"))}>
                  <Plus size={15} /> <span>Add lease</span>
                </button>
                {menuWhere === "side" && attachMenu}
              </div>
            </>
          )}
        </div>

        {!collapsed && (
          <div className="railfoot">
            <p className="stepperscope" title={leaseId ? `Progress for ${leaseId}` : "Load a lease to track its progress"}>
              {leaseId ? `Progress · ${leaseId}` : "Progress"}
            </p>
            <div className="stepper">
              {steps.map((s, i) => (
                <div className={`step ${s.done ? "done" : ""} ${i === steps.findIndex(x => !x.done) ? "next" : ""}`} key={s.label} title={s.label}>
                  <div className="stepline" />
                  <div className="stepdot">{s.done ? <Check size={10} /> : i + 1}</div>
                  <div className="steplabel">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      <div className="work">
        {busy && <div className="workingline"><span className="badge warn">{busy}…</span></div>}
        {unapproved.length > 0 && leaseId && tab !== "chat" && tab !== "review" && (
          <button className="nudge" onClick={() => setTab("review")}>
            <Zap size={14} /> {unapproved.length} details need your review, and reminders stay off until you approve. <b>Open Check details <ArrowRight size={12} /></b>
          </button>
        )}

        {/* ============ CHAT ============ */}
        {tab === "chat" && (
          <section className="stage chatstage">
            <header className="pagehead">
              <div className="pht">
                <h2>{leaseId ? `Talking About ${leaseId.replace(/^lease-/i, "Lease ")}` : "Ask About Your Leases"}</h2>
                {!leaseId && (
                  <p className="hint">
                    {!leases.length && "Load a sample or your own PDF to begin, then ask me anything about it."}
                    {leases.length > 0 && "Pick one of your leases in the sidebar, then ask me anything about it."}
                  </p>
                )}
              </div>
              <div className="ph-badges">
                {leaseId && state && <span className={`badge ${STATUS_LABEL[state.lease.status]?.cls ?? ""}`}>{STATUS_LABEL[state.lease.status]?.label}</span>}
                {busy && <span className="badge warn">{busy}…</span>}
              </div>
            </header>
            <div className="log" ref={logRef}>
              {!leasesLoaded ? (
                <div className="empty" aria-hidden>
                  <div className="skeleton circle" />
                  <div className="skeleton line" style={{ width: "60%" }} />
                  <div className="skeleton line" style={{ width: "42%" }} />
                </div>
              ) : chat.length > 1 && chat.map((m, i) =>
                m.who === "system" ? (
                  <div key={i} className="msg system">{m.text}</div>
                ) : (
                  <div key={i} className={`msgrow ${m.who}`}>
                    {m.who === "bot" && <div className="avatar bot" title="Tickler"><MiniBell /></div>}
                    <div className="msgcol">
                      <div className={`bubble ${m.who}`}>
                        {m.who === "bot" && m.tools && <div className="tools">steps taken: {m.tools.join(" → ")}</div>}
                        {m.who === "bot"
                          ? <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></div>
                          : m.text}
                      </div>
                      {m.who === "bot" && m.citations && m.citations.length > 0 && (
                        <>
                          <div className="citepills">
                            {m.citations.map((c, k) => (
                              <button key={k} className={`citepill ${openCites[i] === k ? "open" : ""}`}
                                onClick={() => setOpenCites(s => ({ ...s, [i]: s[i] === k ? undefined : k }))}
                                title="Show where this came from">
                                <Quote size={10} />
                                {c.deadline.type.replace(/_/g, " ")}
                                {firstPage(c) != null ? ` · page ${firstPage(c)}` : " · computed"}
                              </button>
                            ))}
                          </div>
                          {openCites[i] !== undefined && m.citations[openCites[i]!] && (
                            <div className="citecard">
                              {(() => {
                                const c = m.citations![openCites[i]!];
                                const quotes = c.chain.filter(s => s.step === "quote");
                                return (
                                  <>
                                    <div className="cd-top">
                                      <span className="cd-label">Sources</span>
                                      {c.clause && <span className="clausechip">{c.clause.replace(/_/g, " ")}</span>}
                                      <span className="badge">{c.deadline.date}</span>
                                      {c.deadline.needsReview && <span className="badge bad">needs your review</span>}
                                    </div>
                                    {quotes.length > 0 ? quotes.map((s, k) => {
                                      const pageM = s.detail.match(/page (\d+)\)?$/i);
                                      const pg = pageM ? Number(pageM[1]) : null;
                                      return (
                                        <div className="cd-quote" key={k}>
                                          <Quote size={11} />
                                          <span>“{stripPage(s.detail)}”</span>
                                          {pg != null && (
                                            <button className="pg pgbtn" title="Open the lease PDF with this sentence highlighted"
                                              onClick={() => setPeek({ quote: stripPage(s.detail), page: pg })}>
                                              <ScanSearch size={11} /> page {pg + 1}
                                            </button>
                                          )}
                                        </div>
                                      );
                                    }) : (
                                      <p className="cd-step">no quoted sentence. This value came from your own edit, or it is not written in the lease.</p>
                                    )}
                                    <p className="cd-foot">The date is calculated automatically from the details you approved.</p>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {m.who === "you" && <div className="avatar you" title="You"><User size={13} /></div>}
                  </div>
                )
              )}
              {thinking && <div className="msgrow bot"><div className="avatar bot" />
                <div className="msgcol"><div className="bubble bot tools">thinking…</div></div></div>}
            </div>
            {leasesLoaded && chat.length <= 1 && !thinking && (
              <div className="empty">
                <div className="avatar bot big"><MiniBell /></div>
                <h3 className="heroline">Hi! I read your leases and answer questions about them.</h3>
                <p>Every answer shows the exact sentence it came from.</p>
                {leases.length === 0 ? (
                  <div className="herosteps">
                    <button className="btn primary" onClick={loadSample} disabled={!!busy}>Load a sample lease</button>
                    <label className="btn ghost">
                      <Upload size={15} /> Upload your PDF
                      <input type="file" accept="application/pdf" style={{ display: "none" }} aria-label="Upload a lease PDF"
                        onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
                    </label>
                  </div>
                ) : !leaseId ? (
                  <div className="herosteps">
                    <p className="hint" style={{ width: "100%" }}>pick a lease to start:</p>
                    {leases.slice(0, 6).map(l => (
                      <button key={l.id} className="startercard" onClick={() => setLeaseId(l.id)}>
                        <CircleDot size={14} className={`dot ${STATUS_DOT[l.status] ?? ""}`} />
                        <span>{l.id}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="startergrid">
                    {STARTERS.map(s => (
                      <button key={s.text} className="startercard" onClick={() => send(s.text)}>
                        <s.icon size={16} />
                        <span>{s.text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="askbar">
              <div className="attachwrap">
                <button className={`btn icon ${menuWhere === "ask" ? "open" : ""}`} onClick={() => setMenuWhere(w => (w === "ask" ? "none" : "ask"))}
                  title="Add a lease: upload your own or try a sample" aria-label="Add a lease">
                  <Paperclip size={16} />
                </button>
                {menuWhere === "ask" && attachMenu}
              </div>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
                placeholder={busy ? `working, ${busy}…` : leaseId ? `Ask about ${leaseId}…` : "Ask about your leases…"}
                aria-label="Ask about your leases"
                readOnly={!!busy}
              />
              <button className="btn primary" onClick={() => send()} disabled={thinking || !input.trim() || !!busy}>Send</button>
            </div>
          </section>
        )}

        {/* ============ CHECK DETAILS ============ */}
        {tab === "review" && (
          <section className="stage page">
            <header className="pagehead">
              <div className="pht">
                <h2>Check The Details</h2>
                <p className="hint">Each detail shows the sentence it came from. Fix anything wrong, and your changes are saved. Reminders only start after you approve.</p>
              </div>
              <div className="ph-badges">
                {leaseId && <span className="leasetag">{leaseId}</span>}
                {state && unapproved.length === 0 && <span className="badge ok">approved</span>}
                {unapproved.length > 0 && <span className="badge warn">{unapproved.length} waiting on you</span>}
              </div>
            </header>
            {!leaseId ? (
              <div className="empty"><ListChecks size={26} /><p>no lease selected, use <b>📎 Add lease</b> in the sidebar</p></div>
            ) : (
              <div className="scroller">
                {unapproved.length === 0 && (
                  <div className="empty">
                    <ShieldCheck size={26} />
                    <p>everything approved{state?.lease?.status === "armed" ? ". Reminders are running." : ". Turn reminders on to finish setup."}</p>
                    {state?.lease?.status !== "armed" && (
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
                      ? (
                        <div className="fsource">
                          <Quote size={12} /> <span>“{f.quote.slice(0, 170)}”</span> <span className="pg">page {(f.page ?? 0) + 1}</span>
                          <button className="fsbtn" onClick={() => setPeek({ quote: f.quote!, page: f.page ?? 0 })}
                            title="Open the lease PDF with this sentence highlighted">
                            <ScanSearch size={13} /> View in PDF
                          </button>
                        </div>
                      )
                      : <div className="fsource none">no source sentence: {f.value === "unknown" ? "not written in the lease" : "set by you"}</div>}
                  </div>
                ))}
                {unapproved.length > 0 && (
                  <div className="armbox">
                    <div className="armmodes">
                      <label className={armMode === "demo" ? "on" : ""}>
                        <input type="radio" name="arm" checked={armMode === "demo"} onChange={() => setArmMode("demo")} />
                        <div><b>Demo speed</b><span>alerts arrive in about 24 seconds so you can watch them live</span></div>
                      </label>
                      <label className={armMode === "real" ? "on" : ""}>
                        <input type="radio" name="arm" checked={armMode === "real"} onChange={() => setArmMode("real")} />
                        <div><b>Real schedule</b><span>90, 30 and 7 days before each deadline</span></div>
                      </label>
                    </div>
                    <button className="btn primary big" onClick={submitReview} disabled={!!busy}>
                      Approve and turn on reminders <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ============ DEADLINES ============ */}
        {tab === "deadlines" && (
          <section className="stage page">
            <header className="pagehead">
              <div className="pht">
                <h2>Deadlines</h2>
                <p className="hint">These dates come from the details you approved. Reminders fire on their own, so there is nothing for you to do once they are on.</p>
              </div>
              <div className="ph-badges">
                {leaseId && <span className="leasetag">{leaseId}</span>}
                {scheduledCount > 0 && <span className="badge ok">{scheduledCount} reminders running</span>}
              </div>
            </header>
            {!leaseId ? (
              <div className="empty"><CalendarClock size={26} /><p>no lease selected, use <b>📎 Add lease</b> in the sidebar</p></div>
            ) : (
              <div className="scroller">
                {state?.deadlines.length === 0 && <div className="empty"><CalendarClock size={26} /><p>no deadlines yet, check the details first</p></div>}
                {state?.deadlines.map(d => (
                  <div className="deadlinecard" key={d.type + d.date}>
                    <div className="dl-left">
                      <span className="dl-type">{d.type.replace(/_/g, " ")}</span>
                      <b className={d.date === "unknown" ? "dim" : ""}>{d.date === "unknown" ? "date unknown" : d.date}</b>
                      {d.needsReview && d.reason && <span className="dl-reason">{d.reason}</span>}
                    </div>
                    <div className="dl-right">
                      {d.needsReview
                        ? <span className="badge bad">needs your review</span>
                        : d.reminders.filter(Boolean).length > 0
                          ? <span className="badge ok">{d.reminders.filter(Boolean).length} reminders on</span>
                          : state.lease?.status === "armed"
                            ? <span className="badge">on</span>
                            : <span className="badge">reminders off</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ============ ALERTS ============ */}
        {tab === "alerts" && (
          <section className="stage page">
            <header className="pagehead">
              <div className="pht">
                <h2>Alerts &amp; Letters</h2>
                <p className="hint">When a reminder goes out, the helper decides whether to wait, give you a heads-up, or write a letter. Letters always wait for your approval.</p>
              </div>
              <div className="ph-badges">
                {leaseId && <span className="leasetag">{leaseId}</span>}
                {pendingDrafts.length > 0 && <span className="badge warn">{pendingDrafts.length} letter{pendingDrafts.length > 1 ? "s" : ""} waiting</span>}
              </div>
            </header>
            <div className="emailrow">
              <span className="hint">Email the alerts to:</span>
              <input className="fieldinput" type="email" placeholder="you@example.com" value={emailDraft}
                onChange={e => setEmailDraft(e.target.value)} aria-label="Reminder email address" />
              <button className="btn ghost" onClick={saveEmail} disabled={!!busy}>Save</button>
              {emailSaved && <span className="badge ok">{emailSaved}</span>}
            </div>
            {!leaseId ? (
              <div className="empty"><Bell size={26} /><p>no lease selected, use <b>📎 Add lease</b> in the sidebar</p></div>
            ) : (
              <div className="scroller">
                {state && state.alerts.length === 0 && (
                  <div className="empty">
                    <Bell size={26} />
                    <p>{scheduledCount > 0
                      ? `${scheduledCount} reminders running, the first alert lands shortly (demo speed). This page updates by itself.`
                      : "No alerts yet. Turn reminders on, and they will show up here as they fire."}</p>
                  </div>
                )}
                {state?.alerts.map(a => (
                  <div className={`alertcard ${a.action}`} key={a.alertId}>
                    <div className="alerttop">
                      <span className={`badge ${a.action === "escalate" ? "bad" : a.action === "alert" ? "warn" : ""}`}>
                        {a.action === "escalate" ? "urgent, letter ready" : a.action === "alert" ? "heads up" : "waited"}
                      </span>
                      <span className="when">{new Date(a.at).toLocaleTimeString()}{a.emailed ? " · ✉ emailed" : ""}</span>
                    </div>
                    <p className="amsg">{a.message}</p>
                    {a.reason && <p className="areason">why: {a.reason}</p>}
                    {a.draftId && a.draftStatus === "pending" && (
                      <div className="draftrow">
                        <span className="badge warn">letter waiting, your call</span>
                        <button className="btn ghost" onClick={() => decideDraft(a.draftId!, "approve")}>Approve letter</button>
                        <button className="btn ghost" onClick={() => decideDraft(a.draftId!, "discard")}>Discard</button>
                      </div>
                    )}
                    {a.draftStatus && a.draftStatus !== "pending" && <p className="areason">letter {a.draftStatus}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* evidence peek: single shared PDF viewer */}
        {peek && leaseId && (
          <PdfPeek leaseId={leaseId} target={peek} onClose={() => setPeek(null)} />
        )}
      </div>
    </div>
  );
}
