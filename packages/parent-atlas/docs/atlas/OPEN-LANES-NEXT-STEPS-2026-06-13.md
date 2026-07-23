# Open Lanes Completion — Next Steps (25% → 100%)
**Date**: 2026-06-13  
**Author**: Claude Code + User  
**Status**: Ready for agent + workstation execution  

---

## Executive Summary

Five parallel lanes remain at 20–80% completion. The critical blocker is **ACE/KAG/DAG evidence harness standardization** — once adopted across all indexing pipelines, agent smoke validation becomes deterministic and repeatable.

**Estimated effort**: 8–12 hours across 5 lanes, parallelizable by agent cohort.

---

## Lane 1: Concept Evidence Spine Repair (80% → 100%)

**Completion**: ~80%  
**Blocker**: evidence_cards field regeneration from authoritative packet_keys  
**Time estimate**: 1–2 hours

### Current state
- Live spine: `packet_keys` ✅ and `feature_ids` ✅
- Compatibility field: `evidence_cards` — stale, needs regeneration
- Audit already passes: `npm run atlas:concept-evidence:audit`

### Finish line
```
packet_keys (authoritative source)
   ↓
JOIN atlas_packets ON packet_key
   ↓
SELECT feature_id, summary, community_id
   ↓
evidence_cards := JSON array of {packet_key, feature_id, summary}
```

### Tasks
1. **Verify audit clean**: `npm run atlas:concept-evidence:audit --save`
   - Expected: 10/10 concepts with packet_keys present
   - Expected: feature_id coverage ≥ 95%
2. **Dry-run backfill**: `npm run atlas:concept-evidence:backfill:dry`
   - Expected: evidence_cards regenerated from packet_keys
   - Expected: compatibility count = packet_count
3. **Apply backfill**: `npm run atlas:concept-evidence:backfill --apply`
   - Expected: Postgres UPDATE completes in <10s
   - Expected: apply report written to `docs/reports/concept-evidence-spine-apply-report.json`
4. **Verify post-apply**: `npm run atlas:concept-evidence:audit --save`
   - Expected: all gates PASS
   - Expected: no evidence_cards empty

### Scripts
- `scripts/atlas/audit-concept-evidence-spine.mjs`
- `scripts/atlas/backfill-concept-evidence-spine.mjs`

### Reports
- `docs/reports/concept-evidence-spine-audit-report.md`
- `docs/reports/concept-evidence-spine-backfill-report.json`

---

## Lane 1B: Higher-Hop Enrichment Audit / Backfill (30% → 100%)

**Completion**: ~30%  
**Blocker**: Supernode pressure classification + bounded trace-anchored edge repair  
**Time estimate**: 2–3 hours

### Current state
- 1,134 traces with `selected_concepts` ✅
- First 25 traces seeded 25 USED_CONCEPT edges across 4 concepts ✅
- Missing: supernode pressure measurement before graph expansion

### Finish line
```
Trace spine
   ↓
classify concept / feature / community supernode pressure
   ↓
IF pressure < threshold:
  SEED USED_CONCEPT edges from trace → concept
  SEED USED_PACKET edges from packet → packet
ELSE:
  DEFER expansion, log pressure violation
```

### Tasks
1. **Measure supernode pressure**: `npm run atlas:supernode:pressure:audit`
   - Count USED_CONCEPT edges per concept node (target: <500 edges/concept)
   - Count USED_PACKET edges per feature (target: <2000 edges/feature)
   - Emit pressure report: `docs/reports/supernode-pressure-audit.json`
2. **Classify safe/deferred concepts**: Filter concepts by pressure
   - Safe: pressure < 500 edges
   - Deferred: pressure ≥ 500 edges (mark for Stage 2 work)
3. **Seed bounded USED_CONCEPT edges** (safe concepts only):
   - `npm run atlas:seed-neo4j-used-concept:dry`
   - Expected: trace.selected_concepts → concept nodes only
   - Expected: edge count ≤ 1000 per safe concept
4. **Seed bounded USED_PACKET edges** (safe features only):
   - `npm run atlas:seed-neo4j-used-packet:dry`
   - Expected: packet → packet (same feature) edges only
   - Expected: directional edges, no cycles
5. **Apply both**: `--apply` on dry-run scripts
   - Expected: Neo4j transaction logs show edge creation
   - Expected: graph density remains stable
6. **Verify post-seed**:
   - `npm run atlas:graph:density:check` (no change >10%)
   - `npm run atlas:concept:reachability:check` (all safe concepts reachable)

### Scripts
- `scripts/atlas/audit-higher-hop-enrichment.mjs` (NEW — measure pressure)
- `scripts/atlas/seed-neo4j-used-concept-edges.mjs` (EXISTING — use bounded mode)
- `scripts/atlas/seed-neo4j-used-packet-edges.mjs` (NEW — directed feature edges)
- `scripts/atlas/classify-supernode-pressure.mjs` (NEW — safe/deferred triage)

### Reports
- `docs/reports/higher-hop-enrichment-pressure-audit.json`
- `docs/reports/higher-hop-enrichment-bounded-seed-report.json`

---

## Lane 2: Recommendation Merge Audit (20% → 100%)

**Completion**: ~20%  
**Blocker**: Why only 5 recommendations in current snapshot (was 4173 seed)?  
**Time estimate**: 1–2 hours

### Current state
- Snapshot emits 5 recommendations (vs. claimed 4173 in seed)
- Stale diagnosis: unknown merge-key or sourceRef normalization issue
- Need deterministic root-cause analysis

### Finish line
```
Recommendation generation pipeline:
  packet_key → feature_id → community_id
    ↓
  sourceRef normalization (canonical form)
    ↓
  merge-key dedup (first-seen wins)
    ↓
  5 recommendations (or N if threshold adjusted)
```

### Tasks
1. **Audit merge-key logic**: `npm run atlas:recommendation:merge-key:audit`
   - Emit all candidate merge-keys before dedup
   - Report why <5 candidates pass dedup filter
   - Expected output: `docs/reports/recommendation-merge-key-audit.json`
2. **Audit sourceRef normalization**: `npm run atlas:recommendation:sourceref:audit`
   - Show before/after normalization for each packet
   - Identify collisions (same normalized sourceRef)
   - Expected output: `docs/reports/recommendation-sourceref-audit.json`
3. **Dry-run materialization**: `npm run atlas:recommendation:materialize:dry`
   - Generate 100–500 recommendations without committing
   - Show merge-key → feature_id mapping
   - Report dedup rejection count
4. **Apply materialization**: `npm run atlas:recommendation:materialize --apply`
   - Expected: Postgres recommendations table updated
   - Expected: apply report shows final count + rejection reason breakdown
5. **Verify post-apply**:
   - `npm run atlas:recommendation:verify` (count ≥ 100 OR explain why capped at 5)
   - If count is intentionally capped: document threshold in code
   - If count < 5: flag as under-threshold and defer to Stage 2

### Scripts
- `scripts/atlas/audit-recommendation-merge.mjs`
- `scripts/atlas/route-runtime-packet-recommendations.mjs` (routing logic)
- `scripts/atlas/parent-atlas-coverage-recommendations.mjs` (coverage audit)
- `scripts/opencode/materialize-recommendation-tasks.mjs`

### Reports
- `docs/reports/recommendation-merge-key-audit.json`
- `docs/reports/recommendation-sourceref-audit.json`
- `docs/reports/recommendation-materialize-report.json`

---

## Lane 3: Agent Skills Smoke Validation (NEW)

**Completion**: 0% → 80%  
**Purpose**: Validate OpenCode agent skills for Parent Atlas workflows before full CI integration  
**Time estimate**: 2–3 hours

### Current state
- Parent Atlas indexing harness standardized (env-contract triple ✅)
- OpenCode agents need safeguard testing before autonomous runs
- Missing: smoke suite for skill validation

### Finish line
```
OpenCode skill invocation
   ↓
pre-flight checks (dependencies, env vars, ports)
   ↓
dry-run execution
   ↓
validate outputs (schema, lineage, ACE/KAG/DAG hits)
   ↓
if all pass: skill is green-lit for --apply
if fail: agent gets structured error report + replay guidance
```

### Tasks
1. **Create skill smoke suite**: `tests/opencode/skill-smoke-validation.spec.ts`
   - Test harness: Vitest + temporary Docker volumes
   - Skills to validate:
     - `atlas-run-indexing-gate` (env-contract)
     - `atlas-audit-concept-evidence` 
     - `atlas-audit-higher-hop-enrichment`
     - `atlas-audit-recommendation-merge`
     - `atlas-karpathy-gpu-enrich` (GPU stack)
   - Per skill: pre-flight → dry-run → schema check → lineage validation

2. **Pre-flight validation schema**:
   ```json
   {
     "skill": "atlas-run-indexing-gate",
     "checks": [
       { "name": "dependencies_installed", "check": "which node" },
       { "name": "postgres_reachable", "check": "pg ping" },
       { "name": "qdrant_reachable", "check": "curl :6333" },
       { "name": "redis_reachable", "check": "redis-cli ping" },
       { "name": "required_env_vars", "vars": ["DATABASE_URL", "REDIS_URL"] }
     ]
   }
   ```

3. **Dry-run validation schema**:
   ```json
   {
     "skill": "atlas-run-indexing-gate",
     "mode": "dry-run",
     "outputs": [
       { "file": "docs/reports/env-contract-audit.json", "schema": "envelope" },
       { "file": "docs/reports/env-contract-index-dry-run.json", "schema": "dry_run_report" }
     ],
     "lineage": {
       "ace_kag_dag_hits": [
         { "packet_kind": "env_contract", "source_ref": "env-contract:parent-atlas" }
       ]
     }
   }
   ```

4. **Implement validation**: `src/lib/server/opencode/skill-validator.ts`
   - Schema validation via Zod
   - Lineage chain validation (packet_key → source_ref → feature_id)
   - Report generation: `docs/reports/skill-smoke-report.json`

5. **Integration**: Wire into `npm run test:opencode:smoke`
   - Run on `npm run dev` startup
   - Run on skill registration in OpenCode
   - Flag failed skills in OpenCode UI (red badge)

### Scripts & Tests
- `tests/opencode/skill-smoke-validation.spec.ts` (NEW)
- `src/lib/server/opencode/skill-validator.ts` (NEW)
- `scripts/opencode/validate-all-skills.mjs` (NEW)

### Reports
- `docs/reports/skill-smoke-validation-report.json`
- `docs/reports/skill-green-lit.json` (curated list of safe skills)

---

## Lane 4: GPU Karpathy + NES Chrom Packet Standardization (50% → 100%)

**Completion**: ~50%  
**Blocker**: Unified packet shape across Karpathy GPU scores + NES Chrom vectors + HNSW metadata  
**Time estimate**: 2–3 hours

### Current state
- Karpathy GPU scores cached in Redis ✅ (pr, attn, authority, blend)
- NES Chrom packet generation partial
- Missing: canonical packet shape for GPU-enriched entries

### Finish line
```
GPU Karpathy packet (canonical):
{
  "directory_path": "src/lib/server",
  "source_ref": "src/lib/server/auth.ts",
  "packet_key": "ace:packet:auth:001",
  "gpu_scores": {
    "pagerank": 7.06,
    "attention": 0.999,
    "authority": 0.555,
    "blend": 3.291
  },
  "nes_chrom": {
    "latent_64": Float32Array(64),
    "som_cluster": "cluster:7_12",
    "som_confidence": 0.95
  },
  "embedding": {
    "model": "embeddinggemma",
    "dim": 768,
    "vector": Float32Array(768),
    "qdrant_point_id": "qdrant:auth:001"
  },
  "hnsw_metadata": {
    "m": 16,
    "ef_construction": 64,
    "ef_search": 32,
    "distance_metric": "cosine"
  }
}
```

### Tasks
1. **Standardize Karpathy packet**: `scripts/atlas/standardize-karpathy-gpu-packets.mjs`
   - Read existing Redis `gpu:karpathy:scores`
   - Merge with atlas_packets base fields
   - Validate shape against canonical schema
   - Write standardized packets to `docs/reports/gpu-karpathy-packets.jsonl`

2. **Standardize NES Chrom packet**: `scripts/atlas/standardize-nes-chrom-packets.mjs`
   - Read latent_64 autoencoder outputs
   - Attach SOM cluster assignments
   - Validate shape
   - Write to `docs/reports/nes-chrom-packets.jsonl`

3. **Merge GPU + NES into atlas_packets**:
   - `npm run atlas:gpu:merge-karpathy:dry`
   - `npm run atlas:gpu:merge-nes-chrom:dry`
   - Validate no packet_key collisions
   - Expected: 7,753 packets with gpu_scores + nes_chrom enrichment

4. **Upsert merged packets to Postgres + Qdrant**:
   - `npm run atlas:gpu:merge-all:apply`
   - Update `atlas_packets` with GPU enrichment
   - Upsert Qdrant payload with hnsw_metadata
   - Expected: zero data loss, Qdrant latency <100ms for ANN

5. **Verify post-merge**:
   - `npm run atlas:gpu:verify-merge` (shape + lineage)
   - Expected: 100% packet coverage with GPU scores + NES latent
   - Expected: Qdrant HNSW index stats show updated metadata

### Scripts
- `scripts/atlas/standardize-karpathy-gpu-packets.mjs` (NEW)
- `scripts/atlas/standardize-nes-chrom-packets.mjs` (NEW)
- `scripts/atlas/merge-gpu-enrichment.mjs` (NEW)

### Reports
- `docs/reports/gpu-karpathy-packets.jsonl`
- `docs/reports/nes-chrom-packets.jsonl`
- `docs/reports/gpu-merge-verification.json`

---

## Lane 5: TurboVec Clustering + Packet Metadata Sync (40% → 100%)

**Completion**: ~40%  
**Blocker**: TurboVec gRPC reranker stage wiring + packet metadata sync to Redis/Bifrost  
**Time estimate**: 2–3 hours

### Current state
- TurboVec gRPC at `:50062` (Stage 1.5 reranker) ✅
- Qdrant payload enrichment in progress (Layer C)
- Missing: Redis metadata cache + Bifrost dual-write

### Finish line
```
Qdrant ANN (Stage 1)
   ↓
TurboVec payload filter + rerank (Stage 1.5)
   ↓
Redis metadata cache hit (Stage 2)
   ↓
Bifrost semantic cache (Stage 2.5)
   ↓
Final ranking (Stage 3)
```

### Tasks
1. **Validate TurboVec integration**: `npm run atlas:turbovec:integration:check`
   - Probe `:50062/health`
   - Send sample payload filter + rerank request
   - Measure latency (expected: <500ms for 100 candidates)
   - Expected: `rerank_source: 'turbovec'` in response

2. **Sync packet metadata to Redis**:
   - `npm run atlas:redis:sync-metadata:dry`
   - For each packet_key: SET `bifrost:packet:{packet_key}` with {source_ref, feature_id, community_id, tags, qdrant_point_id}
   - TTL: 24h
   - Expected: 7,753 keys written

3. **Sync Bifrost dual-write**:
   - `npm run atlas:bifrost:sync-metadata:dry`
   - POST each packet metadata to Bifrost semantic cache
   - Expected: 7,753 cache entries registered
   - Expected: cache hit latency <50ms

4. **Apply both syncs**:
   - `npm run atlas:redis:sync-metadata --apply`
   - `npm run atlas:bifrost:sync-metadata --apply`
   - Expected: Redis and Bifrost caches warm

5. **Verify post-sync**:
   - `npm run atlas:cache:warm:verify` (spot-check 100 keys)
   - Expected: Redis hit rate >95%
   - Expected: Bifrost hit rate >90%
   - Expected: Qdrant + TurboVec + Redis latency sum <1s per query

### Scripts
- `scripts/atlas/turbovec-integration-check.mjs`
- `scripts/atlas/sync-metadata-to-redis.mjs` (NEW)
- `scripts/atlas/sync-metadata-to-bifrost.mjs` (NEW)

### Reports
- `docs/reports/turbovec-integration-check.json`
- `docs/reports/cache-warm-verification.json`

---

## Master Execution Plan

### Phase A: Single-Lane Agent Runs (Parallel)

**Duration**: ~2 hours  
**Parallelism**: 4 agents, 1 workstation (Lane 3)

**Agent 1** (Lane 1):
```bash
npm run atlas:concept-evidence:audit --save
npm run atlas:concept-evidence:backfill:dry --save
npm run atlas:concept-evidence:backfill --apply
npm run atlas:concept-evidence:audit --save
```

**Agent 2** (Lane 1B):
```bash
npm run atlas:supernode:pressure:audit --save
npm run atlas:seed-neo4j-used-concept:dry --save
npm run atlas:seed-neo4j-used-concept --apply
npm run atlas:graph:density:check
```

**Agent 3** (Lane 2):
```bash
npm run atlas:recommendation:merge-key:audit --save
npm run atlas:recommendation:sourceref:audit --save
npm run atlas:recommendation:materialize:dry --save
npm run atlas:recommendation:materialize --apply
```

**Agent 4** (Lane 4):
```bash
npm run atlas:gpu:merge-karpathy:dry --save
npm run atlas:gpu:merge-nes-chrom:dry --save
npm run atlas:gpu:merge-all:apply
npm run atlas:gpu:verify-merge --save
```

**Workstation** (Lane 3 + Lane 5):
```bash
# Lane 3: Smoke validation
npm run test:opencode:smoke --reporter=verbose
npm run atlas:validate-all-skills --save

# Lane 5: Cache sync
npm run atlas:turbovec:integration:check
npm run atlas:redis:sync-metadata:dry --save
npm run atlas:bifrost:sync-metadata:dry --save
npm run atlas:redis:sync-metadata --apply
npm run atlas:bifrost:sync-metadata --apply
npm run atlas:cache:warm:verify
```

### Phase B: Cross-Lane Verification (1 hour)

**After all lanes complete**:
```bash
# Lineage audit
npm run atlas:verify-feature-lineage --save

# Coverage audit  
npm run atlas:audit:ranking-signals --save

# ACE/KAG/DAG hit audit
npm run atlas:verify-ace-kag-dag-hits --save

# Final health check
npm run atlas:health:full --save
```

### Phase C: Final Gate (30 min)

**All-lanes smoke test**:
```bash
npm run test:opencode:smoke --all-lanes
npm run atlas:comprehensive-validation --save --strict
```

**Expected outputs**:
- `docs/reports/open-lanes-completion-report.md`
- `docs/reports/open-lanes-completion.json` (structured data)
- All 5 lanes report **✅ PASS**

---

## ACE/KAG/DAG Evidence Harness (Critical Path)

Every script in this plan must emit ACE/KAG/DAG evidence following this shape:

```json
{
  "ace_kag_dag_hit": {
    "packet_kind": "concept_evidence|higher_hop|recommendation|gpu_enrichment|cache_metadata",
    "packet_key": "...",
    "source_ref": "...",
    "feature_id": "...",
    "evidence": [
      "audit-concept-evidence",
      "backfill-concept-evidence"
    ],
    "topology": {
      "community_id": null,
      "concept_ids": ["database_orm", "observability"]
    },
    "trace_count": 1134,
    "packets_affected": 7753,
    "confidence": 0.95,
    "timestamp": "2026-06-13T..."
  },
  "gates": {
    "syntax": "PASS",
    "producer": "PASS",
    "artifact_valid": "PASS",
    "consumer_dry_run": "PASS",
    "ace_kag_dag_hit": "PASS",
    "smoke": "PASS",
    "final_apply": "READY"
  }
}
```

This becomes the **deterministic input** for agent error-fixing hooks and future replay/audit.

---

## Risk & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| Lane 2 root cause unknown (5 vs 4173) | High | Audit merge-key + sourceRef before --apply; if no root cause found, flag for Stage 2 |
| GPU merge collisions (packet_key duplicates) | Medium | Dry-run validates no collisions; pause if found |
| Supernode pressure overflow (>500 edges) | Low | Classify safe/deferred upfront; defer high-pressure concepts |
| Cache sync incomplete (Redis/Bifrost diverge) | Low | Verification gate checks both caches; flag divergence before final gate |
| Smoke test failures block entire phase | High | Run Lane 3 in parallel; failures don't block other lanes |

---

## Success Criteria

| Lane | Target | Status |
|------|--------|--------|
| 1: Concept Evidence | 100% evidence_cards valid | PASS or FAIL audit |
| 1B: Higher-Hop | 100% safe concepts with USED_CONCEPT edges | PASS graph density check |
| 2: Recommendation | Explain 5 vs 4173; verify dedup logic | PASS audit or DEFER with reason |
| 3: Agent Skills | All 5 skills green-lit for --apply | PASS smoke suite |
| 4: GPU + NES | 100% packet coverage with GPU enrichment | PASS verify-merge |
| 5: TurboVec + Cache | 95% Redis hit rate, 90% Bifrost hit rate | PASS warm-verify |

---

## Timeline

- **Phase A** (Parallel): ~2 hours (4 agents + workstation)
- **Phase B** (Cross-lane): ~1 hour
- **Phase C** (Final gate): ~30 min
- **Total**: ~3.5 hours wall-clock time

---

## Next Action

**Workstation**: Create `tests/opencode/skill-smoke-validation.spec.ts` (Lane 3) to unblock Phase A.  
**Agent Cohort**: Stand by for Lane 1, 1B, 2, 4 task distribution once Lane 3 is wired.

