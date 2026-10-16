// Phase 0 gate: FalkorDB reachable + Cypher round-trip works.
import pkg from 'falkordb';
const { FalkorDB } = pkg;

const db = await FalkorDB.connect({ host: 'localhost', port: 6379 });

const graph = db.selectGraph('tickler-hello');
await graph.query('CREATE (:Hello {msg: $m, at: $t})', { params: { m: 'phase-0', t: new Date().toISOString() } });
const res = await graph.query('MATCH (h:Hello) RETURN h.msg AS msg, h.at AS at');
console.log('FalkorDB OK — nodes:', res.data.length, JSON.stringify(res.data[0]));
await graph.delete();
await db.close();
