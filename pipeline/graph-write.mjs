// FalkorDB writes for ingestion — the ONLY place Lease/Page nodes are created.
// Schema contract: shared/graph-schema.ts · docs/graph-model.md
import pkg from 'falkordb';
const { FalkorDB } = pkg;

let _db = null;
export async function db() {
  if (!_db) _db = await FalkorDB.connect({
    host: process.env.FALKORDB_HOST ?? 'localhost',
    port: Number(process.env.FALKORDB_PORT ?? 6379),
    password: process.env.FALKORDB_PASSWORD || undefined,
  });
  return _db;
}

export async function graph() {
  return (await db()).selectGraph(process.env.FALKORDB_GRAPH ?? 'tickler');
}

export function leaseIdFor(fileName) {
  const base = fileName.split(/[\\/]/).pop().replace(/\.pdf$/i, '').toLowerCase();
  const slug = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.startsWith('lease-') ? slug : 'lease-' + slug;
}

/**
 * Create the Lease node + its Page nodes with HAS_PAGE edges.
 * Idempotent per leaseId: an existing (non-armed) lease is wiped and re-ingested.
 */
export async function writeIngestion({ leaseId, title, pages }) {
  const g = await graph();
  // wipe prior incarnation (idempotent re-upload; armed leases must not be clobbered)
  await g.query(
    'MATCH (l:Lease {id:$id})-[:HAS_PAGE]->(p:Page) DETACH DELETE p WITH l DETACH DELETE l',
    { params: { id: leaseId } }
  );
  const status = await g.query(
    `MERGE (l:Lease {id:$id})
     SET l.title=$title, l.uploadedAt=$now, l.status='parsing'`,
    { params: { id: leaseId, title, now: new Date().toISOString() } }
  );
  for (let idx = 0; idx < pages.length; idx++) {
    await g.query(
      `MATCH (l:Lease {id:$id})
       CREATE (l)-[:HAS_PAGE]->(:Page {idx:$idx, text:$text})`,
      { params: { id: leaseId, idx, text: pages[idx] } }
    );
  }
  await g.query(`MATCH (l:Lease {id:$id}) SET l.status='parsed'`, { params: { id: leaseId } });
  return { leaseId, pages: pages.length };
}

export async function getLease(leaseId) {
  const g = await graph();
  const res = await g.query(
    `MATCH (l:Lease {id:$id}) OPTIONAL MATCH (l)-[:HAS_PAGE]->(p:Page)
     RETURN l.id AS id, l.title AS title, l.status AS status,
            count(p) AS pageCount`,
    { params: { id: leaseId } }
  );
  return res.data[0] ?? null;
}
