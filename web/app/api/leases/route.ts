// GET /api/leases → portfolio list with status + deadline counts
import { NextResponse } from "next/server";
import { graph } from "../../../../pipeline/graph-write.mjs";

export const runtime = "nodejs";

export async function GET() {
  const g = await graph();
  const r = await g.query(
    `MATCH (l:Lease)
     OPTIONAL MATCH (l)-[:HAS_CLAUSE]->(:Clause)-[:DERIVES]->(d:Deadline)
     RETURN l.id AS id, l.title AS title, l.status AS status,
            count(d) AS deadlines,
            count(CASE WHEN d.needsReview THEN 1 END) AS needsReview
     ORDER BY l.id`);
  return NextResponse.json(r.data);
}
