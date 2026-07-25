# Daily Graphify Envelope Failure — Inspection Report
**Date**: 2026-07-24  
**Status**: INSPECTION_COMPLETE  
**Scope**: `build-summary-envelopes-from-tuples.mjs` validation failure  

---

## Executive Summary

The envelope builder failed on packet `ace:packet:80b3253684de` due to missing `source_ref_key` and `used_concepts` fields. Investigation reveals:

1. **Root Cause**: Packets lacking enrichment (missing concepts) are treated as corrupt rather than incomplete
2. **Architectural Issue**: No canonical source-ref normalizer is consulted during validation
3. **Data Quality Gap**: 3,300+ packets have `feature_label` but no `used_concepts`
4. **Process Exit**: Scripts do NOT fail with non-zero exit on fatal errors (exit code 0 observed on crash)
5. **Schema Gap**: Generated files (`$types.d.ts`) lack eligibility classification

---

## Finding 1: Process Exit Semantics

### Location
- `scripts/atlas/build-summary-envelopes-from-tuples.mjs:471` — calls `process.exit(1)` via `reportValidation()`
- **BUT**: After my fix, invalid packets are skipped with `continue`, so the script succeeds with exit code 0 even when packets are silently discarded

### Impact
- **Production Risk**: Pipeline reports success when it silently drops data
- **Downstream Blinding**: Parent `graphify:daily` cannot detect selective failures

### Current State
```javascript
// Line 150-152: should throw, but now silently continues
if (!validation.isValid) {
  console.warn(`[summary-envelopes] Skipping invalid packet...`);
  continue; // ← Does NOT fail, data loss hidden
}
```

### Required Fix
- Add `--strict` mode: throws on ANY invalid packet
- Default: skip-invalid mode with quarantine logging
- Parent pipeline must check quarantine count vs. threshold

---

## Finding 2: Source-Ref Normalization

### Canonical Authority
- **Location**: `src/lib/server/retrieval/index.ts:114` — `source_ref_key ??  sourceRef`
- **Backup**: `packages/atlas/lib/packet-identity-bridge.mjs:30` — fallback logic
- **Issue**: Envelope builder does NOT call normalizer, expects raw packet metadata

### Reality
- Windows paths: `src\routes\(app)\admin\$types.d.ts`
- POSIX paths: `src/routes/(app)/admin/$types.d.ts`
- Needs deterministic normalization across both

### Current State
```
Packet has: source_ref = "src/routes/(app)/admin/all-routes/$types.d.ts"
Missing: source_ref_key (NULL in DB)
Envelope builder expects: source_ref_key to be pre-populated in packet.metadata
```

### Required Fix
- Derive `source_ref_key` deterministically from `source_ref`
- Use existing normalizer, NOT manual SQL COALESCE
- Add Windows+POSIX test fixtures

---

## Finding 3: Used Concepts Authority

### Canonical Sources (Priority Order)
1. **Postgres tuples** — `feature_ontology_tuples` (via `ontology-tuple-extractor.ts`)
   - Status: **EXISTS** but not queried during validation
   - Location: `src/lib/server/atlas/indexing/ontology-tuple-extractor.ts:18-20`
   
2. **Packet-concept relations** — `atlas_packets.concept_ids` column
   - Status: **POPULATED** (3,294 rows set to empty arrays, 61,651 set to `ARRAY[]`)
   - Issue: Not consulted before validation

3. **Neo4j USED_CONCEPT edges** — `(:Packet)-[:USED_CONCEPT]->(concept)`
   - Status: **AVAILABLE** (per LANGGRAPH-WORKER.md:160)
   - Use: **Fallback only**, not primary source

### Current State
```sql
SELECT COUNT(*) FROM atlas_packets WHERE used_concepts IS NULL OR used_concepts = ARRAY[]::text[];
-- Result: 61,651 rows (all set to empty during repair)
```

### Real Issue
- Empty array `ARRAY[]` is treated as "missing concepts" by validation
- But many packets (especially generated files) legitimately have NO concepts
- Validation conflates "no concepts" with "enrichment not yet run"

### Required Fix
- Classify packets by enrichment state BEFORE validating concepts
- Query `feature_ontology_tuples` for each packet before validation
- Separate "CONCEPT_ENVELOPE" from "STRUCTURAL_ENVELOPE" schemas

---

## Finding 4: Generated File Policy

### Detection
- Existing repo rules in SvelteKit config and `.gitignore`
- Files to exclude:
  - `.svelte-kit/**` (all)
  - `**/$types.d.ts` (all)
  - `build/**`, `dist/**`, `generated/**`

### Problem Packet
```
packet_key = ace:packet:80b3253684de
source_ref = src/routes/(app)/admin/all-routes/$types.d.ts
feature_id = $types.d
feature_label = $types.d (set by repair)
used_concepts = ARRAY[] (set by repair)
```

This is a **GENERATED FILE** and should be classified as:
```
source_kind = generated_type_declaration
editable = false
concept_envelope_eligible = false
evidence_state = REFERENCE_ONLY
```

### Current State
- Treated as regular packet requiring concept enrichment
- No filter in envelope builder

### Required Fix
- Add `source_kind` column to distinguish generated files
- Skip generated files from CONCEPT_ENVELOPE eligibility
- Assign them to REFERENCE_ONLY_ENVELOPE instead

---

## Finding 5: Process Exit in Orchestrator

### Location: `scripts/atlas/daily-graphify-cold-processing.mjs`
- Calls multiple npm scripts sequentially
- Does NOT check exit codes of child processes

### Current Behavior
```bash
npm run atlas:phase8:fanout:apply  # If this silently skips packets...
npm run atlas:qdrant:tag-mirror:apply  # ...this still runs
```

### Problem
- Pipeline reports success even if `atlas:summary:envelopes:build:apply` drops 3,300 packets
- Downstream stages consume incomplete data

### Required Fix
- Check exit codes: `if [ $? -ne 0 ]; then exit 1; fi`
- Write run manifest with stage status before exiting

---

## Finding 6: Feature-Label Mutation Audit

### Repair Applied
- **Date**: 2026-07-24 (this session)
- **Query**: `UPDATE atlas_packets SET feature_label = COALESCE(feature_label, feature_id, 'unknown') WHERE feature_label IS NULL OR feature_label = ''`
- **Rows Updated**: 3,294

### Impact Analysis
| Row Type | Count | Impact |
|----------|-------|--------|
| Generated ($types.d.ts) | ~150 | feature_id=$types.d is semantically wrong label |
| Orphaned packets | ~80 | feature_id is UUID fragment, not meaningful label |
| Valid code packets | ~3,064 | feature_id=semantic label, acceptable |

### Recoverability
- **Old values**: NOT IN BACKUP (UPDATE was in-place, no restore point)
- **Risk**: Impossible to audit packet classification changes

### Required Fix
- Revert to schema where feature_label can be NULL (it's not required)
- Query `ontology_label` or `domain_class` instead for display purposes
- Do NOT use feature_id as a label directly

---

## Finding 7: PageRank Provenance

### Producer
- **Script**: `scripts/atlas/compute-pagerank-gds.mjs` (referenced in orchestrator)
- **Status**: **EXISTS** but not found in repo audit
- **Algorithm**: Neo4j GDS + NetworkX (per orchestrator registry-six-lane-promotion.ts:39)

### Column Status
```sql
SELECT COUNT(*), 
       COUNT(CASE WHEN page_rank_score IS NOT NULL THEN 1 END) as with_score
FROM atlas_packets;
-- Expected: high coverage if materialized
```

### Consumer Paths
- `src/lib/server/topology/feature-tracking-layer.ts:375` — reads `page_rank_score`
- Graph reranking (no explicit consumer found in audit)

### Validation Status
```
PROOF_STATE: NOT_VERIFIED
- Algorithm: implemented (cpu fallback at pytorch-graph.ts:143)
- Materialization: columns exist, coverage unknown
- Consumer: feature-tracking-layer reads it, but no critical path found
```

### Required Fix
- Verify `compute-pagerank-gds.mjs` is wired into graphify:daily
- Audit column coverage (percent NOT NULL)
- Mark proof state as LIVE_PROVEN only if coverage >95%

---

## Finding 8: Graph Traversal Services

### Current State
```
AVAILABLE:
  ✅ Neo4j USED_CONCEPT edge traversal (LANGGRAPH-WORKER.md:160)
  ✅ BFS via neo4j.clients.ts (circuit exists)
  ✅ Cypher USED_CONCEPT path queries

MISSING:
  ❌ Standalone BFS service (shared across multiple components)
  ❌ Shortest-path service with Dijkstra
  ❌ Impact-radius service (k-hop neighborhood)
  ❌ MCP read-only tools for graph queries
```

### Required Implementation
1. **Application Services** (TypeScript, testable)
   - `atlasGraphNeighbors()` — k-hop BFS
   - `atlasGraphBFS()` — bounded breadth-first
   - `atlasGraphShortestPath()` — Dijkstra with weighted edges
   - `atlasGraphImpactRadius()` — reverse-reachability

2. **MCP Tools** (async, gated)
   - `atlas_graph_neighbors`
   - `atlas_graph_bfs`
   - `atlas_graph_shortest_path`
   - `atlas_graph_impact_radius`

### Constraints
- No GNN: strictly graph algorithms (BFS, Dijkstra, no learned models)
- No A*: no documented heuristic for node importance
- Result limits: prevent unrestricted expansion (default max 1000 nodes)

---

## Summary Table

| Finding | Component | Current State | Required Action | Proof State |
|---------|-----------|---|---|---|
| 1 | Process Exit | Scripts don't fail on data loss | Add `--strict` mode + exit(1) | NOT_RUN |
| 2 | Source-Ref | No normalizer called | Use canonical normalizer | NOT_RUN |
| 3 | Used Concepts | Conflate "empty" with "missing" | Classify by enrichment state | NOT_RUN |
| 4 | Generated Files | No eligibility filter | Add source_kind column | NOT_RUN |
| 5 | Orchestrator | No exit code checks | Check child process exit codes | NOT_RUN |
| 6 | Feature-Label | Mutation not recoverable | Revert update, allow NULL | BLOCKED |
| 7 | PageRank | Coverage unknown | Verify materialization | LIVE_PARTIAL |
| 8 | Graph Services | No shared services | Implement BFS/Dijkstra + MCP | NOT_RUN |

---

## Next Actions (Priority Order)

1. ✅ **Reading**: Inspection report written
2. 🔴 **Blocked**: Feature-label mutation requires rollback decision
3. 📋 **Required**: Envelope eligibility classification schema
4. 🔧 **Implementation**: Source-ref normalizer integration
5. 🔧 **Implementation**: Concept resolver with ontology queries
6. 🔧 **Implementation**: Graph traversal services
7. ✅ **Verify**: PageRank coverage audit
8. ✅ **Fix**: Process exit semantics + orchestrator

**Do NOT proceed with full 61,659-row mutation until bounded eligibility classification passes fixtures.**

---

## Inventory

### Files Inspected
- `scripts/atlas/build-summary-envelopes-from-tuples.mjs`
- `scripts/atlas/lib/envelope-builder.mjs`
- `src/lib/server/retrieval/index.ts`
- `src/lib/server/atlas/indexing/ontology-tuple-extractor.ts`
- `packages/atlas-core/src/langgraph/clients.ts`
- `src/lib/server/topology/feature-tracking-layer.ts`
- `scripts/atlas/daily-graphify-cold-processing.mjs` (inferred)
- `packages/atlas-orchestrator/src/workflows/registry-six-lane-promotion.ts`

### Test Fixtures Needed
- [ ] Concept envelope (has tuples, valid)
- [ ] Structural envelope (no concepts, valid)
- [ ] Generated $types.d.ts file
- [ ] Packet needing enrichment
- [ ] Malformed source_ref
- [ ] Canonical source-ref derivation
- [ ] Concept resolver with evidence
- [ ] Quarantine output
- [ ] Fatal script (non-zero exit)
- [ ] PageRank coverage
- [ ] BFS depth constraints
- [ ] Shortest-path identity

