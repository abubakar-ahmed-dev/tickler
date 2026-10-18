# Tickler

An agent that reads your lease documents, remembers the deadlines hiding in them, and never lets one slip.

Leases bury their important dates in prose: renewal notice windows, rent escalation schedules, deposit return deadlines. Tickler extracts those terms into a knowledge graph — every fact anchored to the exact sentence it came from — schedules durable reminders that survive crashes, and drafts the notice letters you'll eventually need, with the source text cited line-by-line.

## How it works

```
lease PDF ──► ingestion ──► FalkorDB graph ◄── Concierge agent (chat, cited answers)
                              │        ▲
                              ▼        │ reads context
                          Temporal ────┘
                     durable reminder timers
                              │ fires
                              ▼
                      Watcher agent ── handoff ──► Drafter agent
                                              (grounded letter, pending human approval)
```

- **FalkorDB is the only datastore** — pages, clauses, quotes, deadlines, reminders, agent memory, drafts. The agent's tools are Cypher queries; its context is the graph. Remove FalkorDB and nothing works, by design.
- **Grounded extraction** — every extracted quote is validated as a verbatim substring of the source page before it enters the graph. The model never gets trusted on what the document says.
- **Durable timers** — reminders are Temporal workflows. Kill the process mid-wait, restart it, the timer still fires. "The deadline machine forgot" is the failure this exists to prevent.
- **Human in the loop** — extraction review before deadlines arm; drafts are born pending and only a human approves them.

## Try it live

Tickler runs in production on Render: **<https://tickler-web.onrender.com>**

Load a sample lease, check the extracted details against the source PDF (every sentence opens the document with the quote highlighted), approve, and the durable reminder chains arm themselves — the first alert arrives in about 24 seconds in demo mode, email included. Or deploy your own copy with the one-click blueprint at the bottom of this page.

## Stack

Next.js (UI) · OpenAI-compatible tool loop + MCP server (the Concierge agent) · FalkorDB (graph) · Temporal (durable workflows) · Groq serving open-weight models (`openai/gpt-oss-20b`, `openai/gpt-oss-120b` — Apache 2.0).

## Setup

Prereqs: Node 22+, Docker, a [Temporal CLI](https://docs.temporal.io/cli) install, and a Groq API key.

```bash
npm install
docker run -d --name tickler-falkordb -p 6379:6379 falkordb/falkordb:latest
echo "GROQ_API_KEY=..." > .env
npm run hello:falkordb    # graph round-trip
npm run hello:model       # model + structured output check

# in another terminal
temporal server start-dev          # port 7233, UI at 8233
cd worker && npm install && node hello-worker.mjs
node worker/hello-client.mjs       # durable hello-timer (~5s)
```

## Corpus

`corpus/` holds 12 fully synthetic lease agreements (fictional parties and addresses) with ground-truth answers derived at generation time — see `corpus/README.md`. Regenerate with `node corpus/generate.mjs`. Three of the twelve are a sealed hold-out set under `eval/holdout/` used once for final measurement.

## The graph model

FalkorDB holds the entire state of the product. Every node type, every edge:

```text
(Lease)-[HAS_PAGE]->(Page)                            verbatim text, one node per page
(Lease)-[HAS_CLAUSE]->(Clause)-[GROUNDS]->(Quote)     quotes verified word-for-word on a page
(Clause)-[YIELDS]->(Field)                            extracted values, confidence, approved flag
(Field)-[DERIVES]->(Deadline)-[SCHEDULED]->(Reminder) dates computed in code, timers in Temporal
(Alert)-[ABOUT]->(Deadline)                           what the Watcher agent decided, and why
(Alert)-[TRIGGERED]->(Draft)-[CITES]->(Quote)         letters cite the sentences that justify them
(Correction)-[EDITS]->(Field)                         every human fix, kept as history
(Session)-[HAS_TURN]->(Memory)-[ABOUT]->(Lease)       what the assistant remembers about you
```

**The graph does the work.** The Concierge agent has no private knowledge: its six MCP tools (`next_deadlines`, `lineage`, `find_lease`, `recall`, `remember`, `request_draft`) are each a parameterized Cypher query, and every answer must carry the quote and page it walked. The lineage query behind every "where did this come from?" button:

```cypher
MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(c:Clause)-[:YIELDS]->(f:Field {key:$key})
OPTIONAL MATCH (c)-[:GROUNDS]->(q:Quote)
RETURN f.key, f.value, c.type, q.text, q.pageIdx
```

Reminders fire because a `:Reminder` node says so. A drafted letter can prove its own claims, because `:Draft` nodes cite the exact `:Quote` nodes they were written from. Delete FalkorDB and nothing works — by design.

## Docs

- [`docs/graph-model.md`](docs/graph-model.md) — nodes, edges, and the invariants that keep every answer anchored
- [`docs/cypher.md`](docs/cypher.md) — every query the product depends on

## Status

Deployed and working end to end: upload → grounded extraction (100% field and deadline accuracy on a 12-lease synthetic corpus, 9 dev + 3 sealed hold-out) → durable reminders → cited answers with PDF evidence → alerts and drafted letters, in production on Render. Limits we own: accuracy is measured on synthetic leases with regular prose — real attorney-drafted leases are the next frontier; text-layer PDFs only; a human approves every abstract and every letter.

## Running the app locally

```bash
# prerequisites: FalkorDB container + Temporal dev server running (see setup above)
cp .env web/.env.local          # Next reads env from its own directory
cd web && npm install && npm run dev   # UI at http://localhost:3000

# separate terminal — the worker that runs reminder workflows
cd worker && npm install && node worker.mjs
```

Upload a lease PDF, review the extracted fields against their source quotes, approve, and the durable reminder chains arm themselves. The Concierge answers questions with citations; letters arrive as pending drafts only you can approve.
