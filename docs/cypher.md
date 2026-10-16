# Tickler — Cypher Queries the Product Depends On

Every agent tool and every UI list resolves to one of these queries against FalkorDB.

## 1. `next_deadlines` — portfolio horizon
```cypher
MATCH (d:Deadline {needsReview: false})-[:FOR]->(l:Lease)
WHERE d.date <= date() + duration({days: $horizon})
OPTIONAL MATCH (d)<-[:SCHEDULED]-(r:Reminder)
RETURN l.title AS lease, d.type AS type, d.date AS date, r.state AS reminderState
ORDER BY d.date LIMIT 20
```

## 2. `lineage` — why does this reminder exist
```cypher
MATCH path = (r:Reminder {id: $rid})-[:SCHEDULED]-(d:Deadline)-[:DERIVES]-(c:Clause)-[:GROUNDS]->(q:Quote)-[:FROM_PAGE]->(p:Page)
RETURN [n IN nodes(path) | coalesce(n.type, n.date, n.text, labels(n)[0])] AS explanationChain
```

## 3. `recall` — procedural memory for a lease
```cypher
MATCH (m:Memory {kind: 'procedural'})-[:ABOUT]->(l:Lease {id: $leaseId})
RETURN m.content AS content ORDER BY m.updatedAt DESC LIMIT 10
```

## 4. Pending drafts awaiting human approval
```cypher
MATCH (a:Alert)-[:TRIGGERED]->(d:Draft {status: 'pending'})-[:CITES]->(q:Quote)
RETURN a.message AS alert, d.body AS body, q.text AS citedText, q.pageIdx AS page
```

## 5. Grounding validation (write-time check, not a query result)
Every `(Quote)` write is preceded by:
```cypher
MATCH (p:Page {idx: $pageIdx})-[:HAS_PAGE*0]-(x) WHERE x.id = $leaseId
RETURN p.text
```
…followed by a code-level `pageText.includes(quote.text)` assertion. The model's quote is never trusted directly.

## 6. Ingestion writes (`pipeline/graph-write.mjs`)
```cypher
-- idempotent re-upload: wipe prior incarnation
MATCH (l:Lease {id:$id})-[:HAS_PAGE]->(p:Page) DETACH DELETE p WITH l DETACH DELETE l

-- create/refresh lease, then pages
MERGE (l:Lease {id:$id}) SET l.title=$title, l.uploadedAt=$now, l.status='parsing'
MATCH (l:Lease {id:$id}) CREATE (l)-[:HAS_PAGE]->(:Page {idx:$idx, text:$text})
MATCH (l:Lease {id:$id}) SET l.status='parsed'
```

---

*This file grows as queries land in Phases 2–5. Every query the product depends on must appear here.*
