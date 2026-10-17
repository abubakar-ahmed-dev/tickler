// GET /api/state?leaseId=x → lease detail: fields(+quotes), deadlines, alerts, drafts
import { NextResponse } from "next/server";
import { graph } from "../../../../pipeline/graph-write.mjs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const leaseId = new URL(req.url).searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId required" }, { status: 400 });
  const g = await graph();

  const lease = await g.query(
    `MATCH (l:Lease {id:$id}) RETURN l.id AS id, l.title AS title, l.status AS status, l.extractClean AS extractClean`,
    { params: { id: leaseId } });

  // one row per FIELD — quotes aggregated to the clause so a clause with
  // multiple quotes can't multiply field rows (React key collisions)
  const fields = await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(c:Clause)-[:YIELDS]->(f:Field)
     OPTIONAL MATCH (c)-[:GROUNDS]->(q:Quote)
     WITH c, f, head(collect(q)) AS q
     RETURN c.type AS clause, f.key AS key, f.value AS value, f.confidence AS confidence,
            f.approved AS approved, f.correctedByHuman AS corrected, q.text AS quote, q.pageIdx AS page
     ORDER BY c.type, f.key`,
    { params: { id: leaseId } });

  const deadlines = await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[:DERIVES]->(d:Deadline)
     OPTIONAL MATCH (d)-[:SCHEDULED]->(r:Reminder)
     RETURN d.type AS type, d.date AS date, d.needsReview AS needsReview, d.reason AS reason,
            collect(r.id)[0..3] AS reminders
     ORDER BY d.needsReview DESC, d.date`,
    { params: { id: leaseId } });

  const alerts = await g.query(
    `MATCH (l:Lease {id:$id})-[:HAS_CLAUSE]->(:Clause)-[:DERIVES]->(:Deadline)<-[:ABOUT]-(a:Alert)
     OPTIONAL MATCH (a)-[:TRIGGERED]->(dr:Draft)
     RETURN id(a) AS alertId, a.action AS action, a.level AS level, a.message AS message,
            a.reason AS reason, a.createdAt AS at, id(dr) AS draftId, dr.status AS draftStatus
     ORDER BY a.createdAt DESC LIMIT 30`,
    { params: { id: leaseId } });

  return NextResponse.json({
    lease: lease.data[0] ?? null,
    fields: fields.data,
    deadlines: deadlines.data,
    alerts: alerts.data,
  });
}
