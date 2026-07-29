# Semantic Coverage Completion — Task List

**Status**: 50% coverage (4/8 lanes with evidence)  
**Goal**: 100% coverage with runtime proof across all lanes  
**Timeline**: ~8-12 hours parallel  
**Blockers**: Qdrant backfill + K-means execution

---

## PART A: Close the 4 ABSENT Lanes (Audit → Implementation)

### Lane 1: PACKET_VALIDATION ⏳ ABSENT
**Owner**: `src/lib/server/ingest/ingest-packet-schema.ts` + Zod
**Current State**: Files exist (FILE_EXISTS = PRESENT theoretically), but audit found ABSENT
**Gap**: No runtime validation proof (FIXTURE_PROVEN / RUNTIME_SMOKE_PROVEN)

**Tasks**:
- [ ] A1a. Write Zod validation smoke test (`tests/ingest-packet-schema.spec.ts`)
  - Fixture: valid packet envelope (SemanticPacketV1 shape)
  - Test: `validatePhase18Envelope()` returns `isValid=true`
  - Evidence type: FIXTURE_PROVEN
  - Estimate: 20 min

- [ ] A1b. Wire validation into packet ingestion endpoint (`POST /api/ingest/packet`)
  - Accept SemanticPacketV1 JSON
  - Call Zod validator
  - Return 400 on validation failure, 201 on success
  - Evidence type: RUNTIME_SMOKE_PROVEN
  - Estimate: 30 min

- [ ] A1c. Audit proof: run smoke test + endpoint test
  - Confirm evidence type: RUNTIME_SMOKE_PROVEN
  - Update: `lane_audits.packet_validation.status` → RUNTIME_SMOKE_PROVEN
  - Estimate: 10 min

**Total**: 60 min

---

### Lane 2: TOPOLOGY_ROUTING ⏳ ABSENT
**Owner**: `scripts/atlas/compute-neo4j-pagerank.mts` + SOM/K-means
**Current State**: Files exist but reference topology features (som_cluster, pagerank) that don't yet run
**Gap**: No K-means or SOM output yet (blocking RUNTIME_SMOKE_PROVEN)

**Existing Scripts** (verified to exist in repo):
- `sveltekit-frontend/scripts/atlas/gpu-kmeans-clustering.mts` — GPU K-means (LibTorch N-API bridge)
- `scripts/atlas/train-som-20x20.mjs` — SOM training (20×20 grid)
- `scripts/atlas/compute-neo4j-pagerank.mts` — Neo4j PageRank computation
- `scripts/atlas/phase108d-qdrant-backfill-simple.mts` — Qdrant payload backfill (packet_key, workspace_id)

**Tasks**:
- [ ] A2a. **BLOCKER**: Backfill Qdrant with real embeddings (dry-run only, ~30 min)
  - Script: `scripts/atlas/phase108d-qdrant-backfill-simple.mts --dry-run`
  - Shows current Qdrant state + recommended steps
  - Real backfill (4-6h) can be deferred; dry-run shows what's needed
  - Evidence: FIXTURE_PROVEN (dry-run audit only)
  - Estimate: 30 min dry-run

- [ ] A2b. Run K-means clustering (1h, CAN RUN ASYNC with A2a dry-run)
  - Script: `npx tsx sveltekit-frontend/scripts/atlas/gpu-kmeans-clustering.mts --dry-run`
  - Then: `npx tsx sveltekit-frontend/scripts/atlas/gpu-kmeans-clustering.mts --apply --n-clusters=32`
  - Input: 40.5K embeddings from Qdrant (will fail until A2a backfill applied)
  - Output: kmeans_cluster column in atlas_packets
  - Evidence: RUNTIME_SMOKE_PROVEN
  - Estimate: 1 hour (15 min dry-run, 45 min apply)

- [ ] A2c. Run SOM training (1h, depends on A2b output)
  - Script: `node scripts/atlas/train-som-20x20.mjs`
  - Input: kmeans output (cluster assignments)
  - Output: som_cell_row, som_cell_col in atlas_packets
  - Evidence: RUNTIME_SMOKE_PROVEN
  - Estimate: 1 hour

- [ ] A2d. Compute Neo4j PageRank (30 min, parallel with A2c)
  - Script: `npx tsx scripts/atlas/compute-neo4j-pagerank.mts --dry-run`
  - Then: `npx tsx scripts/atlas/compute-neo4j-pagerank.mts`
  - Output: pagerank_score column + HAS_AUTHORITY edges in Neo4j
  - Evidence: RUNTIME_SMOKE_PROVEN
  - Estimate: 30 min

- [ ] A2e. Audit proof: verify all three routing features populated
  - Postgres: `SELECT COUNT(DISTINCT som_cell_row) FROM atlas_packets WHERE som_cell_row IS NOT NULL`
  - Postgres: `SELECT COUNT(DISTINCT kmeans_cluster) FROM atlas_packets WHERE kmeans_cluster IS NOT NULL`
  - Neo4j: `MATCH ()-[r:HAS_AUTHORITY]->() RETURN COUNT(r)`
  - Evidence: CROSS_STORE_PROVEN
  - Estimate: 20 min

**Total**: 3-4 hours for dry-runs + smoke (blocking on A2a backfill for real data)  
**Fallback**: Use synthetic test data (1K packets) for A2b-d if backfill is deferred

---

### Lane 3: QDRANT_PAYLOAD ⏳ ABSENT
**Owner**: `src/lib/server/vector/qdrant-manager.ts` + collection schema
**Current State**: Manager exists but payloads are incomplete
**Gap**: Missing identity + metadata tags in Qdrant points

**Tasks**:
- [ ] A3a. **Depends on A2a**: Enrich Qdrant payloads with packet_key + source_ref + feature_id
  - Script: `scripts/atlas/enrich-qdrant-packet-identity.mts`
  - Input: atlas_packets (packet_key, source_ref, feature_id)
  - Qdrant PATCH: add payload fields to existing points
  - Evidence: RUNTIME_SMOKE_PROVEN
  - Estimate: 45 min

- [ ] A3b. Add semantic tags to Qdrant payloads (depends on A3a)
  - Script: `scripts/atlas/enrich-qdrant-semantic-tags.mts`
  - Input: domain_class, feature_label from atlas_packets
  - Qdrant PATCH: add tags array to payload
  - Evidence: RUNTIME_SMOKE_PROVEN
  - Estimate: 30 min

- [ ] A3c. Audit proof: verify Qdrant payload schema (depends on A3b)
  - Query codebase_chunks_768: SELECT COUNT(*) WHERE payload.packet_key IS NOT NULL
  - Expected: 40.5K matches
  - Evidence: CROSS_STORE_PROVEN
  - Estimate: 15 min

**Total**: 1.5 hours (depends on A2a backfill)

---

### Lane 4: POSTGRES_ROWS ⏳ ABSENT
**Owner**: `src/lib/server/db/schema.ts` + atlas_packets table
**Current State**: Schema exists, rows exist, but identity reconciliation incomplete
**Gap**: Missing feature_label, domain_class enrichment on some rows

**Tasks**:
- [ ] A4a. **Depends on A1b**: Backfill feature_label on atlas_packets
  - SQL: `UPDATE atlas_packets SET feature_label = derived_from_feature_id WHERE feature_label IS NULL`
  - Evidence: RUNTIME_SMOKE_PROVEN
  - Estimate: 20 min

- [ ] A4b. Backfill domain_class from ontology mapping
  - Script: `scripts/atlas/backfill-atlas-domain-class.mts`
  - Input: feature_id → domain_class mapping
  - Output: domain_class column populated
  - Evidence: RUNTIME_SMOKE_PROVEN
  - Estimate: 30 min

- [ ] A4c. Audit proof: row completeness check
  - Postgres: SELECT COUNT(*) WHERE packet_key IS NOT NULL AND source_ref IS NOT NULL AND feature_id IS NOT NULL
  - Expected: 58.3K+ rows
  - Evidence: CROSS_STORE_PROVEN
  - Estimate: 10 min

**Total**: 1 hour

---

## PART B: Elevate STATICALLY_REFERENCED → RUNTIME_SMOKE_PROVEN (2 lanes)

### Lane 5: HYPERRAG_PACKET_RPC (upgrade from STATICALLY_REFERENCED)
**Current**: Code imported but no runtime test
**Target**: RUNTIME_SMOKE_PROVEN

**Tasks**:
- [ ] B1. Write end-to-end HyperRAG RPC test
  - Route: `POST /api/hyperrag/packet-rpc`
  - Input: SemanticPacketV1 JSON
  - Output: HyperRagPacketRpc response (from TypeScript bridge)
  - Test: `tests/hyperrag-packet-rpc.spec.ts`
  - Evidence: RUNTIME_SMOKE_PROVEN
  - Estimate: 45 min

**Total**: 45 min

---

### Lane 6: REDIS_VALUES (upgrade from STATICALLY_REFERENCED)
**Current**: Code imported but cache population untested
**Target**: RUNTIME_SMOKE_PROVEN

**Tasks**:
- [ ] B2. Write Redis cache population test
  - Script: `scripts/atlas/prewarm-redis-packet-cache.mts`
  - Input: 100 sample packets from atlas_packets
  - Output: bifrost:packet:* keys written to Redis
  - Test: `tests/redis-cache-population.spec.ts`
  - Evidence: RUNTIME_SMOKE_PROVEN
  - Estimate: 40 min

**Total**: 40 min

---

## PART C: Fix CONFLICTING Lane (field naming)

### Lane 7: PACKET_IDENTITY (fix from CONFLICTING)
**Current**: camelCase/snake_case naming mismatch detected
**Target**: STATICALLY_REFERENCED (no conflicts)

**Tasks**:
- [ ] C1. Normalize packet_key field naming
  - Grep: `packetKey` across codebase
  - Fix: Replace with `packet_key` in schema definitions
  - Preserve camelCase in runtime objects (JSON interfaces)
  - Estimate: 30 min

- [ ] C2. Normalize tree_node_id field naming
  - Grep: `treeNodeId` across codebase
  - Fix: Replace with `tree_node_id` in schema definitions
  - Estimate: 30 min

- [ ] C3. Re-run reconciliation audit
  - Script: `npx tsx scripts/atlas/reconcile-semantic-contracts.mjs`
  - Expected: PACKET_IDENTITY → STATICALLY_REFERENCED (conflict resolved)
  - Estimate: 10 min

**Total**: 1 hour (10 min per fix)

---

## PART D: ONE_ENTITY_ENRICHMENT_TRACE_PROVEN (End-to-End Proof)

**Current**: Partial proof (Postgres→Valkey→Qdrant proven for packet:c9a2fa8062bc)
**Target**: Full proof across all 6 stores (Postgres→Valkey→Qdrant→Neo4j→HyperRAG→ACE)

**Tasks**:
- [ ] D1. **Depends on A2c (SOM)**: Verify packet traces to Neo4j topology
  - Query Neo4j: `MATCH (n:FeatureSOM {packet_key: 'c9a2fa8062bc'}) RETURN n`
  - Evidence: Cross-store identity parity (packet_key preserved)
  - Estimate: 15 min

- [ ] D2. **Depends on A3c (Qdrant enrichment)**: Re-verify Qdrant payload
  - Query Qdrant: GET /collections/codebase_chunks_768/points/999888779
  - Expected: payload.packet_key = 'c9a2fa8062bc'
  - Estimate: 10 min

- [ ] D3. Verify HyperRAG packet RPC returns same identity
  - Route: `POST /api/hyperrag/packet-rpc` with packet:c9a2fa8062bc
  - Expected: response.packet_key = 'c9a2fa8062bc'
  - Estimate: 15 min

- [ ] D4. Verify ACE context assembler preserves identity
  - Route: `POST /api/ace/assemble-context` with packet list including c9a2fa8062bc
  - Expected: ACEContext.packets[].packet_key unchanged
  - Estimate: 20 min

- [ ] D5. Document end-to-end proof
  - File: `docs/CROSS-STORE-IDENTITY-PROOF-c9a2fa8062bc.md`
  - Content: 6 screenshots (Postgres, Valkey, Qdrant, Neo4j, HyperRAG, ACE)
  - Evidence: CROSS_STORE_PROVEN
  - Estimate: 30 min

**Total**: 1.5 hours (depends on A2c)

---

## Execution Plan

### Sequential Path (8-12h total, bottleneck = Qdrant backfill)
1. **A1 (Packet Validation)**: 60 min → FIXTURE_PROVEN + RUNTIME_SMOKE_PROVEN
2. **A2a (Qdrant Backfill)**: 4-6h → unblock all topology work
3. **Parallel A2b-d + A3 + A4** (3h total): K-means, SOM, PageRank, Qdrant enrichment, Postgres backfill
4. **B1-B2 (HyperRAG + Redis)**: 1.5h → upgrade STATICALLY_REFERENCED
5. **C1-C3 (Fix naming)**: 1h → resolve CONFLICTING
6. **D1-D5 (One-entity proof)**: 1.5h → CROSS_STORE_PROVEN

### Parallel Path (Faster alternative: skip Qdrant backfill, use synthetic test)
1. **A1**: 60 min
2. **Synthetic K-means test** (1h): Use 1K test packets instead of full 40.5K
3. **Skip A2a, A3a, A3b** (synthetic test has pre-generated vectors)
4. **B1-B2 + C1-C3**: 2.5h
5. **D1-D5**: 1.5h (skipped for synthetic path, no Neo4j/Qdrant data)

**Recommendation**: **Sequential path** is safer (real data validation). Parallel path faster (1-2h) but loses Qdrant/Neo4j proof.

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Coverage % | 50% | 100% |
| ABSENT lanes | 4 | 0 |
| CONFLICTING lanes | 1 | 0 |
| RUNTIME_SMOKE_PROVEN lanes | 0 | 6+ |
| CROSS_STORE_PROVEN lanes | 1 | 2+ (+ one-entity proof) |
| Evidence gate report | semantic-contract-reconciliation.json | all lanes PROVEN |

---

## Next Step

Run: `npx tsx scripts/atlas/reconcile-semantic-contracts.mjs`

Then begin Part A sequentially (A1 → A2a → A2b-d in parallel).

