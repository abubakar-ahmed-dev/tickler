/**
 * Tickler graph schema — the frozen contract (Phase 0).
 *
 * FalkorDB is the ONLY datastore. Every component reads/writes through these
 * types. Changing this file after Phase 0 requires team sign-off.
 *
 * Node/edge reference: docs/graph-model.md
 * Queries that depend on this: docs/cypher.md
 */

export type ClauseType =
  | 'parties'
  | 'premises'
  | 'term'
  | 'rent'
  | 'escalation'
  | 'deposit'
  | 'renewal_notice'
  | 'termination_notice'
  | 'late_fee'
  | 'insurance';

export type DeadlineType =
  | 'term_end'
  | 'notice'
  | 'escalation'
  | 'deposit_return';

export type LeaseStatus =
  | 'uploaded'
  | 'parsing'
  | 'extracting'
  | 'awaiting_review'
  | 'armed'
  | 'rejected';

export type ReminderState = 'scheduled' | 'fired' | 'snoozed' | 'sent' | 'cancelled';

export type MemoryKind = 'semantic' | 'episodic' | 'procedural';

/** Every extracted fact must point at text that verbatim-exists in a Page. */
export interface GroundedQuote {
  text: string; // verbatim substring of the page — validated in code, never trusted from the model
  pageIdx: number;
  charStart?: number;
  charEnd?: number;
}

export interface ExtractedField {
  key: string;
  value: string; // 'unknown' is a valid answer — never invent
  confidence: number; // 0..1
  quote: GroundedQuote;
}

export interface ExtractedClause {
  type: ClauseType;
  fields: ExtractedField[];
}

export interface ComputedDeadline {
  type: DeadlineType;
  /** ISO date. Computed in code from clauses — never from the model. */
  date: string;
  derivedFromClauseType: ClauseType;
  needsReview: boolean; // true when the clause was ambiguous/unparseable
  reason?: string; // why needsReview, for the UI banner
}

export interface LeadTimePlan {
  /** Default 90/30/7 days; demo mode uses minutes. */
  leads: number[];
  unit: 'days' | 'minutes';
}

/** Payload sent from the review UI when a human approves a lease abstract. */
export interface ApprovalSignal {
  leaseId: string;
  corrections: Array<{ key: string; newValue: string }>;
  approved: boolean;
}

/** Written by the Watcher agent when a reminder fires. */
export interface WatcherDecision {
  action: 'alert' | 'snooze' | 'escalate';
  reason: string; // must reference what it read from the graph
  alertMessage?: string;
}

/**
 * Node labels (single source of truth — keep in sync with docs/graph-model.md):
 *
 * (:Lease {id,title,status,uploadedAt})
 * (:Page {idx,text})
 * (:Party {name,role})
 * (:Clause {type,status})
 * (:Quote {text,pageIdx,charStart,charEnd})
 * (:Field {key,value,confidence,approved})
 * (:Deadline {date,type,needsReview,reason})
 * (:Reminder {leadDays,fireAt,state})
 * (:Alert {level,message,createdAt})
 * (:Draft {kind,body,status})
 * (:Correction {before,after,at})
 * (:Memory {kind,content,updatedAt})
 * (:Session {startedAt,userId})
 *
 * Edges:
 * (:Lease)-[:HAS_PAGE]->(:Page)
 * (:Lease)-[:HAS_PARTY]->(:Party)
 * (:Lease)-[:HAS_CLAUSE]->(:Clause)-[:GROUNDS]->(:Quote)-[:FROM_PAGE]->(:Page)
 * (:Clause)-[:YIELDS]->(:Field)
 * (:Clause)-[:DERIVES]->(:Deadline)
 * (:Deadline)-[:FOR]->(:Lease)
 * (:Deadline)-[:SCHEDULED]->(:Reminder)
 * (:Alert)-[:ABOUT]->(:Deadline)
 * (:Alert)-[:TRIGGERED]->(:Draft)        // Watcher → Drafter handoff lives IN the graph
 * (:Draft)-[:CITES]->(:Quote)
 * (:Correction)-[:EDITS]->(:Field)
 * (:Session)-[:ABOUT]->(:Lease)
 * (:Memory)-[:ABOUT]->(:Lease)
 */
