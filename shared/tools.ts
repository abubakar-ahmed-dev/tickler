/**
 * MCP tool signatures — the frozen contract (Phase 0).
 *
 * The Concierge agent selects among exactly these tools. Every tool is a
 * Cypher query (or a short chain) against FalkorDB under the hood — the graph
 * decides what the agent knows. Adding a tool after Phase 0 requires sign-off.
 */

export interface ToolSpec {
  name: string;
  description: string;
  input: string; // JSON-schema-ish description for the model
  output: string;
}

export const TOOLS: ToolSpec[] = [
  {
    name: 'next_deadlines',
    description:
      'Upcoming deadlines across the portfolio within a horizon. Returns lease, deadline type/date, reminder state.',
    input: '{ horizon_days?: number = 30 }',
    output: 'Array<{ leaseTitle, deadlineType, date, reminderState }>',
  },
  {
    name: 'lineage',
    description:
      'Why does this reminder/deadline exist? Walks Reminder→Deadline→Clause→Quote→Page and returns the explanation chain, ending in the verbatim source text.',
    input: '{ reminder_id?: string, deadline_id?: string }',
    output: 'Array<{ step: string, label: string, detail: string }>',
  },
  {
    name: 'find_lease',
    description: 'Find leases by title, address fragment, or party name.',
    input: '{ query: string }',
    output: 'Array<{ leaseId, title, status, parties: string[] }>',
  },
  {
    name: 'recall',
    description:
      'Semantic + procedural memory about a lease, user preference, or past corrections.',
    input: '{ about_lease_id?: string, kind?: "semantic"|"procedural", topic?: string }',
    output: 'Array<{ kind, content, updatedAt }>',
  },
  {
    name: 'remember',
    description:
      'Persist a memory (episodic note, confirmed semantic fact, or procedural preference).',
    input: '{ kind: "semantic"|"episodic"|"procedural", content: string, about_lease_id?: string }',
    output: '{ memoryId }',
  },
  {
    name: 'request_draft',
    description:
      'Hand off to the Drafter agent: compose a notice letter for a lease, grounded in its clause quotes. Returns the pending draft id after the human-approval gate.',
    input: '{ lease_id: string, draft_kind: "renewal_notice"|"termination_notice" }',
    output: '{ draftId, status: "pending", citedQuotes: string[] }',
  },
];

/**
 * Non-negotiable agent rules (enforced in system prompt + UI):
 * 1. No substantive answer without a tool call first.
 * 2. Every claim about lease content must carry its lineage (cited Quote text + page).
 * 3. 'unknown' is a valid answer. Never invent a date, clause, or preference.
 * 4. Drafts always land in 'pending' — the human approves, never the agent.
 */
