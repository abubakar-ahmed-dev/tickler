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

## Stack

Next.js (UI) · Mastra (agent runtime + MCP server) · FalkorDB (graph) · Temporal (durable workflows) · Groq serving open-weight models (`openai/gpt-oss-20b`, `openai/gpt-oss-120b` — Apache 2.0).

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

## Docs

- [`docs/graph-model.md`](docs/graph-model.md) — nodes, edges, and the invariants that keep every answer anchored
- [`docs/cypher.md`](docs/cypher.md) — every query the product depends on

## Status

Work in progress — ingestion and extraction phases building now. See `docs/` for the model as it lands.
