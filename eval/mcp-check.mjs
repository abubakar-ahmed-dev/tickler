// MCP smoke test: spawn the stdio server as a client, list tools, call one.
// Usage: node --env-file=.env eval/mcp-check.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['--env-file=.env', 'agent/mcp-server.mjs'],
});
const client = new Client({ name: 'tickler-check', version: '0.0.1' });
await client.connect(transport);

const tools = await client.listTools();
console.log('MCP tools:', tools.tools.map(t => t.name).join(', '));

const res = await client.callTool({ name: 'next_deadlines', arguments: { horizon_days: 800 } });
const data = JSON.parse(res.content[0].text);
console.log('next_deadlines(800d) →', JSON.stringify(data).slice(0, 300));

const lin = await client.callTool({ name: 'lineage', arguments: { lease_id: 'lease-05', deadline_type: 'notice' } });
console.log('lineage(lease-05, notice) →', JSON.stringify(JSON.parse(lin.content[0].text)).slice(0, 300));

await client.close();
process.exit(0);
