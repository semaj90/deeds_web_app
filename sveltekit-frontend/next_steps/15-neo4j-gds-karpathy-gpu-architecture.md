# Next Steps: Neo4j GDS + APOC + Karpathy GPU Indexing Architecture
**Created:** 2026-05-05  
**Status:** Deep review — gaps identified, build order defined

---

## Architecture Audit: Current vs Target State

### What Already Exists (do NOT rebuild)

| Component | File | State |
|-----------|------|-------|
| `neo4j-gds.ts` | `src/lib/server/graph/neo4j-gds.ts` | **349 lines — complete** |
| `ensureGdsProjection()` | Projects File/Dir/Cluster/WikiNote/ResearchNote/SummaryLens | ✅ done |
| `runPageRankMutate()` | Writes `graphPageRank` → nodes, 20 iters, 0.85 damping | ✅ done |
| `runLouvainMutate()` | Writes `louvainCommunity` → nodes, counts distinct communities | ✅ done |
| `getImpactNeighborhood()` | 3-hop APOC + pure-Cypher fallback, ordered by distance | ✅ done |
| `getTopAuthorityNodes()` | Top-N by `graphPageRank`, includes `louvainCommunity` | ✅ done |
| `GET /api/code-intel/graph/gds-status` | APOC version, GDS version, projection existence | ✅ done |
| `POST /api/code-intel/graph/gds-status` | project / pagerank / louvain / full, rate-limited 5min | ✅ done |
| `GET /api/code-intel/graph/impact` | stableKey + depth + limit → ImpactResult | ✅ done |
| GDS → TRACE reranker | `context-assembler.ts:2563` — `graphPageRank` boost 0–0.08 | ✅ wired |
| docker-compose Neo4j | `NEO4J_PLUGINS: ["apoc","graph-data-science"]`, APOC+GDS allowlist | ✅ done |
| `GET /api/graph/topology-neighbors` | PCA 2D neighborhood, k-NN by Euclidean dist | ✅ done |
| `gpu-topology-projection.ts` | `computeMean`, `computePCAComponents` (power-iter), normalize | ✅ done |
| `runTopologyProjection()` | EmbeddingInput[] → manifold4 + ProjectionAudit pipeline | ✅ done |

### Confirmed Gaps (the actual build list)

#### GAP 1 — APOC Batch Upsert in `karpathy-persistence.ts`
**Current state:** `persistKarpathyHook()` runs one `MERGE` per Neo4j edge in a serial loop (line 26–31). Zero APOC.  
**Impact:** 1335-file indexing run fires 1335+ individual round-trips. At 5ms/RTT = 6+ seconds just for Neo4j. Blocks the indexer HTTP request.  
**Fix:** Replace the loop with `apoc.periodic.iterate` batch upsert, parameterised JSON edges list → one transaction per 500 edges.

#### GAP 2 — manifold4 Backfill Not APOC-gated
**Current state:** `writeManifold4ToDB()` in `hypergraph-4d.ts` does raw Drizzle batch UPDATEs to Postgres. No APOC involvement, no Neo4j sync of manifold4 coords.  
**Impact:** Neo4j File nodes have no `manifold4` property → GDS KNN can't weight by 4D proximity.  
**Fix:** After Postgres write, fire `apoc.periodic.iterate` to copy `[som_x, som_y, semantic_z, grpo_w]` back to Neo4j File nodes by stableKey.

#### GAP 3 — GDS KNN Not Projected → graphAuthorityScore Not in TRACE
**Current state:** `codeTopology` projection includes `graphPageRank` but no KNN relationship. The TRACE reranker reads `graphPageRank` directly from Neo4j nodes — it does NOT use KNN neighborhood similarity.  
**Impact:** Two files in the same Louvain community (semantically co-authored) get no cross-file boost when retrieved together.  
**Fix:** Add `gds.knn.mutate` step after Louvain, writing `knnSimilarity` edge property. Feed into a new `graphNeighborhoodScore` on TRACE chunks alongside `graphPageRank`.

#### GAP 4 — D27 Audit Gate Missing (OntologyConcept / CLASSIFIED_AS)
**Current state:** Zero `OntologyConcept` nodes exist. No `CLASSIFIED_AS` relationship written by any indexer. The audit script `scripts/audit-parity.mjs` does not check for ontology coverage.  
**Impact:** LegalProduction vs DevCodeIntel split undefined at the graph level — legal case evidence nodes can co-mingle with dev code nodes in GDS projections, polluting PageRank scores.  
**Fix:** Seed `OntologyConcept` nodes (`LegalEvidence`, `DevCode`, `WikiNote`, `ResearchNote`) and write `CLASSIFIED_AS` during karpathy-hook or codebase-indexer runs. Add D27 gate to `smoke-graphify`.

#### GAP 5 — neosemantics (n10s) Not Installed
**Current state:** docker-compose only loads `["apoc", "graph-data-science"]`. No SHACL validation, no OWL import.  
**Impact:** `OntologyConcept` nodes are just plain graph nodes, not formal RDF ontology classes. SHACL validation (`n10s.validation.shacl.validate`) can't enforce that every File has `CLASSIFIED_AS` exactly one concept.  
**Fix:** Add `"n10s"` to `NEO4J_PLUGINS`. Wire a `/api/code-intel/graph/ontology-validate` endpoint (POST → runs SHACL report, returns violations). **Low urgency** — D27 gate works without n10s.

#### GAP 6 — No `graphAuthorityScore` Composite Written to Qdrant
**Current state:** `graphPageRank` lives only in Neo4j. Qdrant `codebase_chunks_768` payloads have `som_cluster`, `tags`, etc. but no pre-computed authority score.  
**Impact:** Every ACE retrieval must make a separate Neo4j round-trip to look up `graphPageRank`. 5ms Neo4j × 7 chunks = 35ms added to every ACE assembly.  
**Fix:** During `karpathy-hook` post-processing or nightly GDS job, write `graphAuthorityScore = 0.6×pageRank + 0.3×louvainCommunitySize + 0.1×knnSimilarity` back to Qdrant payload. TRACE reranker reads it as payload filter, no Neo4j RTT.

---

## Recommended Build Order

### Commit 1 — `feat(graph): APOC batch upsert in karpathy-persistence`
**Files:** `src/lib/server/indexer/karpathy-persistence.ts`  
**Change:** Replace serial `MERGE` loop with:
```cypher
CALL apoc.periodic.iterate(
  'UNWIND $edges AS e RETURN e',
  'MERGE (s {stableKey: e.source})
   MERGE (t {stableKey: e.target})
   MERGE (s)-[:IMPORTS]->(t)',
  {batchSize: 500, params: {edges: $edgeList}}
)
```
Fall back to serial MERGE if APOC unavailable (check `apocAvailable` flag from `getGdsStatus()`).  
**Impact:** 1335-edge Neo4j write: 6s → ~120ms (11 APOC batches of 500).

### Commit 2 — `feat(graph): manifold4 sync from Postgres to Neo4j File nodes`
**Files:** `src/lib/server/graph/hypergraph-4d.ts`, `src/lib/server/graph/neo4j-gds.ts`  
**Change:** After `writeManifold4ToDB()`, call new `syncManifold4ToNeo4j(rows)` that runs:
```cypher
CALL apoc.periodic.iterate(
  'UNWIND $rows AS r RETURN r',
  'MATCH (f:File {stableKey: r.stableKey})
   SET f.manifold4X = r.x, f.manifold4Y = r.y,
       f.manifold4Z = r.z, f.manifold4W = r.w',
  {batchSize: 200, params: {rows: $rows}}
)
```
**Impact:** GDS projections can now include manifold4 as a node property for KNN distance.

### Commit 3 — `feat(graph): GDS KNN + graphAuthorityScore composite`
**Files:** `src/lib/server/graph/neo4j-gds.ts`, `src/lib/server/ace/context-assembler.ts`  
**Changes:**
1. Add `runKnnMutate()` after Louvain — `gds.knn.mutate` on `graphPageRank` property, `topK=10`
2. Add `writeAuthorityScoreToQdrant()` — reads top-N File nodes by stableKey, upserts `graphAuthorityScore` into Qdrant payload
3. In `context-assembler.ts`, read `graphAuthorityScore` from Qdrant payload (no extra Neo4j RTT)

### Commit 4 — `feat(graph): D27 ontology gate + OntologyConcept seed`
**Files:** `src/lib/server/graph/neo4j-gds.ts`, `scripts/smoke-topology-projection.mjs` (or new `smoke-graphify-d27.mjs`)  
**Changes:**
1. Seed script: `MERGE (:OntologyConcept {id: 'LegalEvidence'})` etc. (4 concepts)
2. Karpathy hook: write `CLASSIFIED_AS` based on file path heuristic (`.svelte` → DevCode, `evidence/` → LegalEvidence, `wiki:note:` → WikiNote)
3. D27 smoke gate: `MATCH (f:File) WHERE NOT (f)-[:CLASSIFIED_AS]->(:OntologyConcept) RETURN count(f) AS unclassified` → must return 0

### Commit 5 (optional) — `feat(graph): neosemantics + SHACL ontology validation`
**Files:** `docker-compose.yml`, new `src/routes/api/code-intel/graph/ontology-validate/+server.ts`  
**Defer until:** D27 gate passes on real data and the ontology stabilises.

---

## Docker Compose Diff (already correct — no change needed)

The `docker-compose.yml` already has:
```yaml
NEO4J_PLUGINS: '["apoc", "graph-data-science"]'
NEO4J_dbms_security_procedures_unrestricted: "apoc.*,gds.*"
NEO4J_dbms_security_procedures_allowlist: "apoc.*,gds.*"
```
For n10s add `"n10s"` to the plugins array when Commit 5 is ready.

---

## ACE Scoring Spine Impact

Current spine (from CLAUDE.md):
```
semantic_vector × 0.60 + tag_score × 0.12 + ast_graph × 0.10 + som_boost × 0.08 + hyperedge × 0.10
```

After Commit 3:
- `ast_graph × 0.10` → now reads `graphAuthorityScore` from Qdrant payload (Neo4j RTT eliminated)
- `graphNeighborhoodScore` (KNN): could replace or augment `hyperedge × 0.10`
- Suggested post-Commit-3 spine:
```
semantic_vector × 0.60 + tag_score × 0.12 + ast_graph × 0.08 + graphNeighborhood × 0.08 + som_boost × 0.06 + hyperedge × 0.06
```

---

## Smoke Gate Coverage

| Gate | Checks | Status |
|------|--------|--------|
| GDS projection exists | `gds.graph.exists('codeTopology')` | ✅ in gds-status |
| APOC available | `apoc.version()` returns non-null | ✅ in gds-status |
| graphPageRank written | `MATCH (n) WHERE n.graphPageRank IS NOT NULL RETURN count(n) > 0` | ✅ via top-authority |
| louvainCommunity written | `count(DISTINCT n.louvainCommunity) > 0` | ✅ in runLouvain |
| manifold4 on Neo4j nodes | `MATCH (f:File) WHERE f.manifold4X IS NOT NULL` | **GAP 2** |
| graphAuthorityScore in Qdrant | payload field present on >0 chunks | **GAP 6** |
| D27: all Files CLASSIFIED_AS | `MATCH (f:File) WHERE NOT (f)-[:CLASSIFIED_AS]->() = 0` | **GAP 4** |
| APOC batch upsert latency | karpathy-hook Neo4j write < 200ms | **GAP 1** |
