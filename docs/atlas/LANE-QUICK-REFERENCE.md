# Open Lanes Quick Reference — Lane-by-Lane Checklists

Use this during parallel execution to verify each lane's tasks.

---

## Lane 1: Concept Evidence Spine (80% → 100%)

**Time**: 1–2h | **Agent**: 1 | **Parallel**: YES

### Pre-flight
- [ ] Concept evidence table exists in Postgres
- [ ] Packet_keys field is authoritative
- [ ] evidence_cards field is stale (regeneration target)

### Tasks
```bash
# Task 1: Audit
npm run atlas:concept-evidence:audit --save
# Expected: 10/10 concepts with packet_keys
# Expected: feature_id coverage ≥ 95%

# Task 2: Dry-run backfill
npm run atlas:concept-evidence:backfill:dry --save
# Expected: evidence_cards regenerated from packet_keys
# Expected: compatibility count = packet_count

# Task 3: Apply
npm run atlas:concept-evidence:backfill --apply
# Expected: Postgres UPDATE completes in <10s
# Expected: apply report written

# Task 4: Verify
npm run atlas:concept-evidence:audit --save
# Expected: all gates PASS
# Expected: no evidence_cards empty
```

### Success Criteria
- [ ] Audit report: 10/10 concepts, feature_id ≥ 95%, evidence_cards valid
- [ ] Backfill report: 0 errors, 100% packet coverage
- [ ] Post-apply audit: all gates PASS

### Key Files
- `scripts/atlas/audit-concept-evidence-spine.mjs`
- `scripts/atlas/backfill-concept-evidence-spine.mjs`
- `docs/reports/concept-evidence-spine-audit-report.json`
- `docs/reports/concept-evidence-spine-backfill-report.json`

---

## Lane 1B: Higher-Hop Enrichment (30% → 100%)

**Time**: 2–3h | **Agent**: 2 | **Parallel**: YES

### Pre-flight
- [ ] Neo4j instance reachable (:7687)
- [ ] 1,134 traces with selected_concepts in Postgres
- [ ] Supernode pressure unknown (this is the audit task)

### Tasks
```bash
# Task 1: Measure pressure
npm run atlas:supernode:pressure:audit --save
# Expected: concepts grouped by pressure (safe: <500 edges, deferred: ≥500)

# Task 2: Classify safe/deferred
npm run atlas:classify-supernode-pressure --safe-only --save
# Expected: list of safe concepts + deferred backlog

# Task 3: Dry-run seed USED_CONCEPT
npm run atlas:seed-neo4j-used-concept:safe-only:dry --save
# Expected: trace.selected_concepts → concept nodes only
# Expected: edge count ≤ 1000 per safe concept

# Task 4: Apply seed
npm run atlas:seed-neo4j-used-concept --apply
# Expected: Neo4j transaction log shows edge creation

# Task 5: Verify
npm run atlas:graph:density:check
npm run atlas:concept:reachability:check --safe-only
# Expected: graph density change <10%
# Expected: all safe concepts reachable
```

### Success Criteria
- [ ] Pressure audit: all concepts classified (safe/deferred)
- [ ] Seed dry-run: edge count ≤ 1000 per safe concept
- [ ] Seed apply: 0 errors
- [ ] Post-seed verification: graph density stable, reachability ✓

### Key Files
- `scripts/atlas/audit-higher-hop-enrichment.mjs` (NEW)
- `scripts/atlas/classify-supernode-pressure.mjs` (NEW)
- `scripts/atlas/seed-neo4j-used-concept-edges.mjs`
- `docs/reports/higher-hop-enrichment-pressure-audit.json`
- `docs/reports/higher-hop-enrichment-bounded-seed-report.json`

---

## Lane 2: Recommendation Merge (20% → 100%)

**Time**: 1–2h | **Agent**: 3 | **Parallel**: YES

### Pre-flight
- [ ] Current snapshot reports 5 recommendations (vs claimed 4173)
- [ ] Root cause unknown: merge-key normalization or sourceRef issue?
- [ ] Merge logic auditable

### Tasks
```bash
# Task 1: Audit merge-key
npm run atlas:recommendation:merge-key:audit --save
# Expected: all candidate merge-keys listed before dedup
# Expected: explanation why <5 candidates pass dedup

# Task 2: Audit sourceRef normalization
npm run atlas:recommendation:sourceref:audit --save
# Expected: before/after normalization for each packet
# Expected: collision count reported

# Task 3: Dry-run materialization
npm run atlas:recommendation:materialize:dry --save
# Expected: 100–500 recommendations without committing
# Expected: merge-key → feature_id mapping shown
# Expected: dedup rejection count

# Task 4: Apply (only if root cause documented)
npm run atlas:recommendation:materialize --apply
# Expected: Postgres recommendations table updated
# Expected: apply report shows count + rejection breakdown

# Task 5: Verify
npm run atlas:recommendation:verify --save
# IF count < 100: flag as under-threshold with documented reason
# IF count ≥ 100: move to next lane
```

### Success Criteria
- [ ] Merge-key audit: root cause identified (normalization OR cap OR collision)
- [ ] SourceRef audit: normalization logic verified
- [ ] Dry-run: materialization count explained
- [ ] Apply: 0 errors (if approved)
- [ ] Post-apply: count ≥ 100 OR defer reason documented

### Key Files
- `scripts/atlas/audit-recommendation-merge.mjs`
- `scripts/atlas/route-runtime-packet-recommendations.mjs`
- `scripts/opencode/materialize-recommendation-tasks.mjs`
- `docs/reports/recommendation-merge-key-audit.json`
- `docs/reports/recommendation-sourceref-audit.json`
- `docs/reports/recommendation-materialize-report.json`

---

## Lane 3: Agent Skills Smoke Validation (0% → 100%)

**Time**: 2–3h | **Executor**: Workstation | **Parallel**: YES

### Pre-flight
- [ ] Vitest installed and working
- [ ] Postgres, Redis, Qdrant all reachable
- [ ] OpenCode agent infrastructure online

### Tasks
```bash
# Task 0: Create test harness (BLOCKER)
# File: tests/opencode/skill-smoke-validation.spec.ts
# Must validate: pre-flight + dry-run + schema checks
# Skills: atlas-run-indexing-gate, concept-evidence, higher-hop, recommendation, karpathy-gpu

# Task 1: Pre-flight checks
npm run test:opencode:smoke:preflight --verbose
# Expected: all dependencies, ports, env vars ✓

# Task 2: Dry-run validation
npm run test:opencode:smoke:dry-run --verbose
# Expected: all skills execute without errors
# Expected: outputs match expected schema

# Task 3: Smoke tests
npm run test:opencode:smoke --all-lanes --reporter=verbose
# Expected: 5/5 skills green-lit
# Expected: report written to docs/reports/skill-smoke-validation-report.json

# Task 4: Green-lit certification
npm run atlas:certify-skills --save
# Expected: docs/reports/skill-green-lit.json created
# Expected: safe skills listed for --apply
```

### Success Criteria
- [ ] Test harness created: tests/opencode/skill-smoke-validation.spec.ts
- [ ] Pre-flight: all checks PASS
- [ ] Dry-run: all skills execute without errors
- [ ] Smoke tests: 5/5 skills green-lit
- [ ] Certification: skill-green-lit.json written

### Key Files
- `tests/opencode/skill-smoke-validation.spec.ts` (NEW — BLOCKER)
- `src/lib/server/opencode/skill-validator.ts` (NEW)
- `scripts/opencode/validate-all-skills.mjs` (NEW)
- `docs/reports/skill-smoke-validation-report.json`
- `docs/reports/skill-green-lit.json`

### Blocker Status
⚠️ **CRITICAL**: All lanes 1, 1B, 2, 4 wait for Lane 3 completion.

---

## Lane 4: GPU Karpathy + NES Chrom (50% → 100%)

**Time**: 2–3h | **Agent**: 4 | **Parallel**: After Lane 3

### Pre-flight
- [ ] Redis cache has `gpu:karpathy:scores` (7,753 entries)
- [ ] Autoencoder latent_64 vectors cached in Postgres
- [ ] SOM cluster assignments present
- [ ] No packet_key collisions expected

### Tasks
```bash
# Task 1: Audit GPU enrichment
npm run atlas:gpu:audit:enrichment --save
# Expected: karpathy_scores_cached = 7,753
# Expected: nes_chrom_latent_cached = 7,753
# Expected: merge_ready = true

# Task 2: Standardize Karpathy packets
npm run atlas:gpu:standardize-karpathy:dry --save
# Expected: 7,753 packets with gpu_scores field
# Expected: output: docs/reports/gpu-karpathy-packets.jsonl

# Task 3: Standardize NES Chrom packets
npm run atlas:gpu:standardize-nes-chrom:dry --save
# Expected: 7,753 packets with nes_chrom field
# Expected: output: docs/reports/nes-chrom-packets.jsonl

# Task 4: Merge GPU + NES (dry-run)
npm run atlas:gpu:merge-all:dry --save
# Expected: no packet_key collisions
# Expected: 100% enrichment coverage
# Expected: Qdrant hnsw_metadata validated

# Task 5: Apply merge
npm run atlas:gpu:merge-all --apply
# Expected: Postgres atlas_packets updated
# Expected: Qdrant codebase_chunks_768 payload updated
# Expected: <1s latency for ANN post-update

# Task 6: Verify
npm run atlas:gpu:verify-merge --save
# Expected: 100% packet coverage with gpu_scores + nes_chrom
# Expected: Qdrant HNSW index stats updated
```

### Success Criteria
- [ ] Audit: 7,753 karpathy + 7,753 nes_chrom cached
- [ ] Standardize: 0 collisions, 100% coverage
- [ ] Merge: 0 errors
- [ ] Post-merge verification: ANN latency <1s

### Key Files
- `scripts/atlas/standardize-karpathy-gpu-packets.mjs` (NEW)
- `scripts/atlas/standardize-nes-chrom-packets.mjs` (NEW)
- `scripts/atlas/merge-gpu-enrichment.mjs` (NEW)
- `docs/reports/gpu-karpathy-packets.jsonl`
- `docs/reports/nes-chrom-packets.jsonl`
- `docs/reports/gpu-merge-verification.json`

---

## Lane 5: TurboVec + Cache Sync (40% → 100%)

**Time**: 2–3h | **Executor**: Workstation | **Parallel**: YES

### Pre-flight
- [ ] TurboVec gRPC at `:50062` (health check)
- [ ] Redis reachable + writable
- [ ] Bifrost semantic cache at `:3040` (health check)
- [ ] Qdrant `codebase_chunks_768` ready for payload update

### Tasks
```bash
# Task 1: Validate TurboVec integration
npm run atlas:turbovec:integration:check --save
# Expected: `:50062/health` responds
# Expected: sample payload filter + rerank <500ms for 100 candidates
# Expected: rerank_source = 'turbovec' in response

# Task 2: Audit cache readiness
npm run atlas:cache:audit:readiness --save
# Expected: Redis connection + write capability ✓
# Expected: Bifrost registration capability ✓
# Expected: TTL strategy confirmed (24h packets, 5min ephemeral)

# Task 3: Dry-run Redis metadata sync
npm run atlas:redis:sync-metadata:dry --save
# Expected: 7,753 keys planned (bifrost:packet:{key})
# Expected: TTL=24h per key
# Expected: metadata payload validated

# Task 4: Dry-run Bifrost dual-write
npm run atlas:bifrost:sync-metadata:dry --save
# Expected: 7,753 cache entries staged
# Expected: schema validation ✓
# Expected: API response codes 200/201

# Task 5: Apply Redis sync
npm run atlas:redis:sync-metadata --apply
# Expected: Redis writes complete in <30s
# Expected: apply report written

# Task 6: Apply Bifrost sync
npm run atlas:bifrost:sync-metadata --apply
# Expected: Bifrost cache registration complete in <1min
# Expected: apply report written

# Task 7: Verify cache warmth
npm run atlas:cache:warm:verify --sample=100 --save
# Expected: Redis hit rate >95% (spot-check 100 keys)
# Expected: Bifrost hit rate >90%
# Expected: Qdrant + TurboVec + Redis latency sum <1s per query
```

### Success Criteria
- [ ] TurboVec integration: `:50062` healthy, <500ms latency
- [ ] Cache audit: Redis + Bifrost ready
- [ ] Sync dry-run: 7,753 entries planned for both caches
- [ ] Sync apply: 0 errors
- [ ] Warm verification: >95% Redis, >90% Bifrost hit rate

### Key Files
- `scripts/atlas/turbovec-integration-check.mjs`
- `scripts/atlas/sync-metadata-to-redis.mjs` (NEW)
- `scripts/atlas/sync-metadata-to-bifrost.mjs` (NEW)
- `docs/reports/turbovec-integration-check.json`
- `docs/reports/cache-warm-verification.json`

---

## Phase B: Cross-Lane Verification (Serial, ~1h)

After all 5 lanes complete:

```bash
# Lineage audit
npm run atlas:verify-feature-lineage --save
# Expected: packet_key → source_ref → feature_id chain intact
# Expected: 0 orphans, 0 dangling references

# Coverage audit
npm run atlas:audit:ranking-signals --save
# Expected: BM25 text ≥ 85% (was 22.5%)
# Expected: concept_ids ≥ 60% (was 34.3%)
# Expected: community_conf ≥ 95%

# ACE/KAG/DAG hit audit
npm run atlas:verify-ace-kag-dag-hits --save
# Expected: all hits have gates.final_apply = PASS
# Expected: lineage chain valid for each hit
# Expected: evidence trails complete

# Health check
npm run atlas:health:full --save
# Expected: Postgres ✓, Qdrant ✓, Redis ✓, Bifrost ✓, Neo4j ✓
# Expected: TurboVec ✓ (if applicable)
```

---

## Phase C: Final Gate (Serial, ~30min)

```bash
npm run test:opencode:smoke --all-lanes --strict
npm run atlas:comprehensive-validation --save --strict
# Expected: All lanes report PASS
# Expected: Reports written to docs/reports/open-lanes-completion-*
# Expected: Zero blockers or documented DEFER reasons
```

---

## Checklists for Copy-Paste

### Lane 1 Checklist
- [ ] Pre-flight: concept evidence table + packet_keys field
- [ ] audit: 10/10 concepts, fid ≥ 95%
- [ ] dry-run: evidence_cards regenerated
- [ ] apply: <10s, 0 errors
- [ ] verify: gates PASS

### Lane 1B Checklist
- [ ] Pre-flight: Neo4j ✓, 1,134 traces with selected_concepts
- [ ] pressure-audit: concepts classified safe/deferred
- [ ] seed-dry-run: edge count ≤ 1000 per concept
- [ ] seed-apply: 0 errors
- [ ] verify: density <10%, reachability ✓

### Lane 2 Checklist
- [ ] Pre-flight: 5 recommendations in snapshot
- [ ] merge-key-audit: root cause identified
- [ ] sourceref-audit: collisions reported
- [ ] materialize-dry-run: count explained
- [ ] materialize-apply: 0 errors (if approved)
- [ ] verify: count ≥ 100 OR defer reason

### Lane 3 Checklist (BLOCKER)
- [ ] Pre-flight: Vitest + Postgres + Redis + Qdrant
- [ ] Create test harness: tests/opencode/skill-smoke-validation.spec.ts
- [ ] Pre-flight checks: dependencies ✓
- [ ] Dry-run: all skills execute
- [ ] Smoke tests: 5/5 skills green-lit
- [ ] Certification: skill-green-lit.json written

### Lane 4 Checklist
- [ ] Pre-flight: Redis cache 7,753 entries, no collisions
- [ ] Audit: karpathy + nes_chrom cached
- [ ] Standardize: 0 collisions, 100% coverage
- [ ] Merge-dry-run: validated
- [ ] Merge-apply: 0 errors
- [ ] Verify: 100% coverage, <1s ANN latency

### Lane 5 Checklist
- [ ] Pre-flight: TurboVec ✓, Redis ✓, Bifrost ✓
- [ ] Integration-check: `:50062` healthy
- [ ] Audit: Redis + Bifrost writable
- [ ] Sync-dry-run: 7,753 entries planned (both caches)
- [ ] Sync-apply: 0 errors
- [ ] Verify: >95% Redis, >90% Bifrost hit rate

### Cross-Lane Verification Checklist
- [ ] Lineage audit: 0 orphans
- [ ] Coverage audit: BM25 ≥ 85%, concepts ≥ 60%
- [ ] ACE/KAG/DAG: all gates PASS
- [ ] Health check: all services ✓

### Final Gate Checklist
- [ ] Comprehensive validation: all lanes PASS or documented DEFER
- [ ] All reports written to docs/reports/
- [ ] Zero blockers
