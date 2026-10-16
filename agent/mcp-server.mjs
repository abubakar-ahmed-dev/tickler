// MCP stdio server exposing Tickler's six tools to any MCP client.
// Run: node --env-file=.env agent/mcp-server.mjs
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runTool } from './tools.mjs';

const server = new McpServer({ name: 'tickler', version: '0.1.0' });
const json = r => ({ content: [{ type: 'text', text: JSON.stringify(r, null, 1) }] });

server.tool('next_deadlines', 'Upcoming deadlines across the portfolio within a horizon of days from today.',
  { horizon_days: z.number().optional().describe('default 30') },
  async ({ horizon_days }) => json(await runTool('next_deadlines', { horizon_days })));

server.tool('lineage', 'Why does a deadline exist? Walks Reminder→Deadline→Clause→Quote→Page, ending in the verbatim source text.',
  {
    lease_id: z.string().describe('lease id, e.g. lease-05'),
    deadline_type: z.enum(['term_end', 'notice', 'escalation', 'deposit_return']),
    reminder_id: z.string().optional(),
  },
  async args => json(await runTool('lineage', args)));

server.tool('find_lease', 'Find leases by title, address fragment, or party name (case-insensitive contains).',
  { query: z.string() },
  async ({ query }) => json(await runTool('find_lease', { query })));

server.tool('recall', 'Recall memory: semantic facts, episodic history, or procedural preferences.',
  {
    kind: z.enum(['semantic', 'episodic', 'procedural']).optional(),
    about_lease_id: z.string().optional(),
    topic: z.string().optional(),
  },
  async args => json(await runTool('recall', args)));

server.tool('remember', 'Persist a memory for future sessions (semantic fact, episodic note, procedural preference).',
  {
    kind: z.enum(['semantic', 'episodic', 'procedural']),
    content: z.string(),
    about_lease_id: z.string().optional(),
  },
  async args => json(await runTool('remember', args)));

server.tool('request_draft', 'Hand off to the Drafter: compose a notice letter grounded ONLY in stored clause quotes. Born pending; human approves later.',
  {
    lease_id: z.string(),
    draft_kind: z.enum(['renewal_notice', 'termination_notice']),
  },
  async args => json(await runTool('request_draft', args)));

const transport = new StdioServerTransport();
await server.connect(transport);
// keep alive; stdio closes when the client disconnects
