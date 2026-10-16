"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Lease = { id: string; title: string; status: string; deadlines: number; needsReview: number };
type ChatMsg = {
  who: "you" | "bot";
  text: string;
  tools?: string[];
  citations?: Array<{ deadline: { type: string; date: string }; chain: Array<{ step: string; detail: string }> }>;
};
type Field = { clause: string; key: string; value: string; confidence: number; approved: boolean; corrected: boolean; quote: string | null; page: number | null };
type Deadline = { type: string; date: string; needsReview: boolean; reason: string; reminders: string[] };
type Alert = { alertId: number; action: string; level: string; message: string; reason: string; draftId: number | null; draftStatus: string | null };

export default function Home() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseId, setLeaseId] = useState<string>("");
  const [chat, setChat] = useState<ChatMsg[]>([
    { who: "bot", text: "Concierge ready. Ask about deadlines, lineage, letters — or say a preference and I'll remember it." },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [state, setState] = useState<{ lease: Lease; fields: Field[]; deadlines: Deadline[]; alerts: Alert[] } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");
  const logRef = useRef<HTMLDivElement>(null);

  const refreshLeases = useCallback(async () => {
    setLeases(await (await fetch("/api/leases")).json());
  }, []);

  const refreshState = useCallback(async (id: string) => {
    if (!id) return setState(null);
    setState(await (await fetch(`/api/state?leaseId=${id}`)).json());
    setEdits({});
  }, []);

  useEffect(() => { refreshLeases(); }, [refreshLeases]);
  useEffect(() => { refreshState(leaseId); }, [leaseId, refreshState]);
  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [chat, thinking]);

  const send = async () => {
    const q = input.trim();
    if (!q || thinking) return;
    setInput(""); setThinking(true);
    setChat(c => [...c, { who: "you", text: q }]);
    try {
      const r = await fetch("/api/ask", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, leaseId: leaseId || undefined }),
      });
      const j = await r.json();
      setChat(c => [...c, { who: "bot", text: j.answer ?? `error: ${j.error}`, tools: j.toolsUsed, citations: j.citations }]);
      refreshState(leaseId);
    } catch (e) {
      setChat(c => [...c, { who: "bot", text: `error: ${(e as Error).message}` }]);
    }
    setThinking(false);
  };

  const upload = async (file: File) => {
    setBusy("ingesting");
    const form = new FormData();
    form.set("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: form });
    const j = await r.json();
    if (j.error) { setBusy(""); alert(j.error); return; }
    await refreshLeases();
    setBusy("extracting (model call, up to a minute)");
    await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leaseId: j.leaseId }) });
    setBusy("");
    setLeaseId(j.leaseId);
    refreshLeases();
  };

  const submitReview = async () => {
    if (!state) return;
    const corrections = Object.entries(edits).map(([key, newValue]) => ({ key, newValue }));
    setBusy("approving + arming");
    const r = await fetch("/api/review", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ leaseId, corrections }),
    });
    const j = await r.json();
    setBusy("");
    if (j.error) alert(j.error);
    else setChat(c => [...c, { who: "bot", text: `Abstract approved with ${corrections.length} correction(s). ${j.armed} deadline(s) armed — durable reminder workflows are running in Temporal.` }]);
    refreshState(leaseId); refreshLeases();
  };

  const decideDraft = async (draftId: number, action: "approve" | "discard") => {
    await fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draftId, action }) });
    refreshState(leaseId);
  };

  const needsReviewFields = state?.fields.filter(f => !f.approved) ?? [];
  const pendingDrafts = state?.alerts.filter(a => a.draftId && a.draftStatus === "pending") ?? [];

  return (
    <>
      <header>
        <h1>Tickler</h1>
        <span className="tag">your lease&apos;s tickler file — local model, durable timers, graph memory</span>
        {busy && <span className="badge warn">{busy}…</span>}
      </header>
      <main>
        <section className="panel" id="chat">
          <h2>Concierge</h2>
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
          <div id="askbar">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder={leaseId ? `ask about ${leaseId}…` : "ask about your portfolio…"}
            />
            <button onClick={send} disabled={thinking || !input.trim()}>send</button>
          </div>
        </section>

        <div className="col">
          <section className="panel">
            <h2>Portfolio</h2>
            <div className="pad row">
              <select value={leaseId} onChange={e => setLeaseId(e.target.value)}>
                <option value="">— select lease —</option>
                {leases.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.id} · {l.status}{l.needsReview ? ` · ${l.needsReview} review` : ""}
                  </option>
                ))}
              </select>
              <label className="button ghost" style={{ padding: "7px 12px", borderRadius: 6, cursor: "pointer" }}>
                upload PDF
                <input type="file" accept="application/pdf" style={{ display: "none" }}
                  onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
            </div>
          </section>

          {state && (
            <section className="panel">
              <h2>Review {state.lease?.id} · {state.lease?.status}</h2>
              <div className="list">
                {needsReviewFields.length === 0 && <div className="hint">all fields approved.</div>}
                {needsReviewFields.map(f => (
                  <div className="item" key={f.clause + f.key}>
                    <div className="row">
                      <span className="k">{f.key}</span>
                      <input className="field-edit" defaultValue={f.value} value={f.value === "unknown" && edits[f.key] === undefined ? "" : edits[f.key] ?? f.value}
                        onChange={e => setEdits(s => ({ ...s, [f.key]: e.target.value }))} placeholder={f.value} />
                      <span className="badge">{Math.round((f.confidence ?? 0) * 100)}%</span>
                    </div>
                    {f.quote && <div className="q">“{f.quote.slice(0, 140)}” — page {(f.page ?? 0) + 1}</div>}
                  </div>
                ))}
                {needsReviewFields.length > 0 && (
                  <div className="row">
                    <button onClick={submitReview} disabled={!!busy}>approve + arm reminders</button>
                    <span className="hint">deadlines recompute from approved values</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {state && (
            <section className="panel">
              <h2>Deadlines</h2>
              <div className="list">
                {state.deadlines.map(d => (
                  <div className="item" key={d.type + d.date}>
                    <div className="row">
                      <span className="badge ok">{d.type}</span>
                      <b>{d.date}</b>
                      {d.needsReview && <span className="badge bad">needs your look — {d.reason}</span>}
                      {!d.needsReview && d.reminders.filter(Boolean).length > 0 && <span className="badge">{d.reminders.filter(Boolean).length} reminders scheduled (durable)</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {state && (
            <section className="panel">
              <h2>Alerts &amp; drafts</h2>
              <div className="list">
                {state.alerts.length === 0 && <div className="hint">no alerts yet — reminders fire on their schedule.</div>}
                {state.alerts.map(a => (
                  <div className={`item alert ${a.action}`} key={a.alertId}>
                    <div className="row">
                      <span className={`badge ${a.action === "escalate" ? "bad" : a.action === "alert" ? "warn" : ""}`}>{a.action}</span>
                      <span>{a.message}</span>
                    </div>
                    {a.reason && <div className="k">watcher: {a.reason}</div>}
                    {a.draftId && a.draftStatus === "pending" && (
                      <div className="row" style={{ marginTop: 6 }}>
                        <span className="badge warn">draft pending</span>
                        <button className="ghost" onClick={() => decideDraft(a.draftId!, "approve")}>approve</button>
                        <button className="ghost" onClick={() => decideDraft(a.draftId!, "discard")}>discard</button>
                      </div>
                    )}
                    {a.draftStatus && a.draftStatus !== "pending" && <div className="k">draft {a.draftStatus}</div>}
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
