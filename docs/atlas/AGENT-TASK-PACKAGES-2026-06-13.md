# Agent Task Packages — Parallel Distribution

**Generated**: 2026-06-13T19:51:00Z  
**Status**: Ready for parallel agent execution  
**Prerequisite**: Lane 3 (Skill Smoke Validation) ✅ COMPLETE

---

## Distribution Model

**4 independent agents + 1 workstation**
**Execution**: Parallel (all start simultaneously)
**Completion Criteria**: Each agent finishes its lane → Cross-lane verification → Final gate

---

## 🤖 Agent 1: Lane 1 — Concept Evidence Spine (1–2h)

### Input Package

**Objective**: Regenerate `evidence_cards` field from authoritative `packet_keys` (80% → 100%)

**Files to create/modify**:
- `scripts/atlas/audit-concept-evidence-spine.mjs` — Producer (audit only)
- `scripts/atlas/backfill-concept-evidence-spine.mjs` — Consumer (dry-run + apply)
- npm scripts registration in `package.json`

**Template to follow**: `docs/atlas/HARNESS-STANDARDIZATION-ROLLOUT.md` (Producer/Consumer shape)

### Execution Sequence

```bash
# Task 1: Audit
npm run atlas:concept-evidence:audit --save
# Expected output: docs/reports/concept-evidence-spine-audit-report.json
# Gate: 10/10 concepts, feature_id ≥ 95%, evidence_cards validation

# Task 2: Dry-run backfill
npm run atlas:concept-evidence:backfill:dry --save
# Expected output: docs/reports/concept-evidence-spine-backfill-report.json
# Gate: evidence_cards regenerated from packet_keys

# Task 3: Apply backfill
npm run atlas:concept-evidence:backfill --apply
# Gate: Postgres UPDATE <10s, 0 errors

# Task 4: Verify post-apply
npm run atlas:concept-evidence:audit --save
# Gate: all gates PASS
```

### Success Criteria

- [ ] Audit report: 10/10 concepts, feature_id ≥ 95%, evidence_cards valid
- [ ] Backfill report: 0 errors, 100% packet coverage
- [ ] Post-apply audit: all gates PASS
- [ ] ACE/KAG/DAG hit emitted with gates structure

### Key References

- `docs/atlas/LANE-QUICK-REFERENCE.md#lane-1-checklist`
- `src/lib/server/atlas/ace-kag-dag-evidence-schema.ts` (use this schema)
- `scripts/atlas/audit-higher-hop-enrichment.mjs` (structure reference)

---

## 🤖 Agent 2: Lane 1B — Higher-Hop Enrichment (2–3h)

### Input Package

**Objective**: Measure supernode pressure + seed bounded USED_CONCEPT edges (30% → 100%)

**Files to create/modify**:
- `scripts/atlas/audit-higher-hop-enrichment.mjs` — Measure pressure
- `scripts/atlas/classify-supernode-pressure.mjs` — Safe/deferred triage
- `scripts/atlas/seed-neo4j-used-concept-edges.mjs` (existing, add `--safe-only` mode)
- npm scripts registration

### Execution Sequence

```bash
# Task 1: Measure pressure
npm run atlas:supernode:pressure:audit --save
# Output: docs/reports/higher-hop-enrichment-pressure-audit.json
# Gate: concepts classified safe (<500 edges) / deferred (≥500 edges)

# Task 2: Classify safe/deferred
npm run atlas:classify-supernode-pressure --safe-only --save
# Output: safe concepts list + deferred backlog

# Task 3: Dry-run seed USED_CONCEPT (safe only)
npm run atlas:seed-neo4j-used-concept:safe-only:dry --save
# Gate: edge count ≤ 1000 per safe concept

# Task 4: Apply seed
npm run atlas:seed-neo4j-used-concept --apply
# Gate: Neo4j transaction log, 0 errors

# Task 5: Verify
npm run atlas:graph:density:check
npm run atlas:concept:reachability:check --safe-only
# Gate: graph density <10% change, reachability ✓
```

### Success Criteria

- [ ] Pressure audit: all concepts classified (safe/deferred)
- [ ] Seed dry-run: edge count ≤ 1000 per safe concept
- [ ] Seed apply: 0 errors
- [ ] Post-seed verification: density stable, reachability ✓
- [ ] ACE/KAG/DAG hit emitted

### Key References

- `docs/atlas/LANE-QUICK-REFERENCE.md#lane-1b-checklist`
- Neo4j at `:7687` (check reachability)
- Trace spine: 1,134 traces with `selected_concepts` field

---

## 🤖 Agent 3: Lane 2 — Recommendation Merge (1–2h)

### Input Package

**Objective**: Diagnose why only 5 recommendations in snapshot (vs claimed 4173) (20% → 100%)

**Files to create/modify**:
- `scripts/atlas/audit-recommendation-merge.mjs` — Merge-key audit
- `scripts/atlas/audit-recommendation-sourceref.mjs` — SourceRef normalization audit
- Modify `scripts/opencode/materialize-recommendation-tasks.mjs` for proper gating
- npm scripts registration

### Execution Sequence

```bash
# Task 1: Audit merge-key
npm run atlas:recommendation:merge-key:audit --save
# Output: docs/reports/recommendation-merge-key-audit.json
# Gate: show all candidates before dedup, explain why <5 pass

# Task 2: Audit sourceRef normalization
npm run atlas:recommendation:sourceref:audit --save
# Output: docs/reports/recommendation-sourceref-audit.json
# Gate: before/after normalization, collision count

# Task 3: Dry-run materialization
npm run atlas:recommendation:materialize:dry --save
# Gate: generate 100–500 recommendations, show count + rejection reason

# Task 4: Apply (only if root cause documented)
npm run atlas:recommendation:materialize --apply
# Gate: Postgres recommendations table updated, apply report

# Task 5: Verify
npm run atlas:recommendation:verify --save
# Gate: count ≥ 100 OR defer reason documented
```

### Success Criteria

- [ ] Merge-key audit: root cause identified (normalization OR cap OR collision)
- [ ] SourceRef audit: normalization logic verified
- [ ] Dry-run: materialization count explained
- [ ] Apply: 0 errors (if approved)
- [ ] Post-apply: count ≥ 100 OR defer reason documented
- [ ] ACE/KAG/DAG hit emitted

### Key References

- `docs/atlas/LANE-QUICK-REFERENCE.md#lane-2-checklist`
- `docs/atlas/OPEN-LANES-NEXT-STEPS-2026-06-13.md#lane-2-recommendation-merge-audit`
- Current snapshot reports 5 recommendations (root cause: unknown)

---

## 🤖 Agent 4: Lane 4 — GPU Karpathy + NES Chrom (2–3h)

### Input Package

**Objective**: Standardize packet shapes + merge GPU enrichment (50% → 100%)

**Files to create/modify**:
- `scripts/atlas/standardize-karpathy-gpu-packets.mjs` — Standardize Karpathy scores
- `scripts/atlas/standardize-nes-chrom-packets.mjs` — Standardize NES Chrom latent vectors
- `scripts/atlas/merge-gpu-enrichment.mjs` — Merge both into atlas_packets
- npm scripts registration

### Execution Sequence

```bash
# Task 1: Audit GPU enrichment
npm run atlas:gpu:audit:enrichment --save
# Output: docs/reports/gpu-enrichment-audit.json
# Gate: karpathy_scores_cached=7753, nes_chrom_latent_cached=7753

# Task 2: Standardize Karpathy
npm run atlas:gpu:standardize-karpathy:dry --save
# Output: docs/reports/gpu-karpathy-packets.jsonl
# Gate: 7753 packets with gpu_scores field

# Task 3: Standardize NES Chrom
npm run atlas:gpu:standardize-nes-chrom:dry --save
# Output: docs/reports/nes-chrom-packets.jsonl
# Gate: 7753 packets with nes_chrom field

# Task 4: Merge (dry-run)
npm run atlas:gpu:merge-all:dry --save
# Gate: no packet_key collisions, 100% coverage

# Task 5: Apply merge
npm run atlas:gpu:merge-all --apply
# Gate: Postgres + Qdrant updated, 0 errors

# Task 6: Verify
npm run atlas:gpu:verify-merge --save
# Gate: 100% packet coverage, <1s ANN latency
```

### Success Criteria

- [ ] Audit: 7753 karpathy + 7753 nes_chrom cached
- [ ] Standardize: 0 collisions, 100% coverage
- [ ] Merge: 0 errors
- [ ] Post-merge verification: ANN latency <1s
- [ ] ACE/KAG/DAG hit emitted

### Key References

- `docs/atlas/LANE-QUICK-REFERENCE.md#lane-4-checklist`
- Redis cache: `gpu:karpathy:scores` (7753 entries)
- Postgres autoencoder output: `latent_64` vectors
- Qdrant: `codebase_chunks_768` (update payload with hnsw_metadata)

---

## 🖥️ Workstation: Lane 5 — TurboVec + Cache Sync (2–3h) [PARALLEL]

### Input Package

**Objective**: Warm Redis + Bifrost metadata caches (40% → 100%)

**Files to create/modify**:
- `scripts/atlas/turbovec-integration-check.mjs` — Validate TurboVec at `:50062`
- `scripts/atlas/sync-metadata-to-redis.mjs` — Redis metadata cache
- `scripts/atlas/sync-metadata-to-bifrost.mjs` — Bifrost dual-write
- npm scripts registration

### Execution Sequence

```bash
# Task 1: Validate TurboVec integration
npm run atlas:turbovec:integration:check --save
# Gate: `:50062/health` responds, <500ms latency for 100 candidates

# Task 2: Audit cache readiness
npm run atlas:cache:audit:readiness --save
# Gate: Redis + Bifrost writable

# Task 3: Dry-run Redis sync
npm run atlas:redis:sync-metadata:dry --save
# Gate: 7753 keys planned (bifrost:packet:{key}), TTL=24h

# Task 4: Dry-run Bifrost sync
npm run atlas:bifrost:sync-metadata:dry --save
# Gate: 7753 cache entries staged

# Task 5: Apply Redis sync
npm run atlas:redis:sync-metadata --apply
# Gate: writes complete in <30s, 0 errors

# Task 6: Apply Bifrost sync
npm run atlas:bifrost:sync-metadata --apply
# Gate: registration complete in <1min, 0 errors

# Task 7: Verify cache warmth
npm run atlas:cache:warm:verify --sample=100 --save
# Gate: Redis >95%, Bifrost >90% hit rate
```

### Success Criteria

- [ ] TurboVec integration: `:50062` healthy, <500ms latency
- [ ] Cache audit: Redis + Bifrost ready
- [ ] Sync dry-run: 7753 entries planned (both caches)
- [ ] Sync apply: 0 errors
- [ ] Warm verification: >95% Redis, >90% Bifrost hit rate
- [ ] ACE/KAG/DAG hit emitted

### Key References

- `docs/atlas/LANE-QUICK-REFERENCE.md#lane-5-checklist`
- TurboVec gRPC: `:50062`
- Redis: `:6379`
- Bifrost semantic cache: `:3040`

---

## 📋 Template: ACE/KAG/DAG Evidence Emission

**Every agent MUST emit this structure** after each task:

```json
{
  "ace_kag_dag_hit": {
    "packet_kind": "concept_evidence|higher_hop|recommendation|gpu_enrichment|cache_metadata",
    "packet_key": "ace:packet:xxx",
    "source_ref": "audit-concept-evidence|seed-neo4j-used-concept|materialize-recommendation|merge-gpu|sync-metadata",
    "feature_id": "concept_evidence|neo4j_topology|recommendations|gpu_karpathy|cache_infrastructure",
    "evidence": ["script1.mjs", "script2.mjs", "script3.mjs"],
    "topology": {
      "community_id": null,
      "concept_ids": []
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

**Import schema from**: `src/lib/server/atlas/ace-kag-dag-evidence-schema.ts`

---

## ✅ Pre-Execution Checklist (Each Agent)

- [ ] Read the corresponding lane quick-reference section
- [ ] Create producer script (audit-*.mjs)
- [ ] Create consumer script (backfill-*.mjs or materialize-*.mjs)
- [ ] Register npm scripts in `package.json`
- [ ] Test scripts with `node --check` (syntax only)
- [ ] Run producer (audit phase)
- [ ] Run consumer --dry-run
- [ ] Generate ACE/KAG/DAG hit with gates structure
- [ ] Report summary to workstation (wait for Phase B cross-lane verification)

---

## Phase B: Cross-Lane Verification (After all agents complete)

**Serial execution** (one command, waits for others):

```bash
npm run atlas:verify-feature-lineage --save
npm run atlas:audit:ranking-signals --save
npm run atlas:verify-ace-kag-dag-hits --save
npm run atlas:health:full --save
```

**Expected**: All lanes report PASS or documented DEFER

---

## Phase C: Final Gate (After Phase B)

```bash
npm run test:opencode:smoke --all-lanes --strict
npm run atlas:comprehensive-validation --save --strict
```

**Expected**: All 5 lanes green-lit + 0 blockers

---

## 📞 Coordination Protocol

**Workstation → Agents**:
- "Lane 3 complete, you're unblocked"
- (Wait for all agents to report completion)
- "Phase B cross-lane verification starting"

**Agents → Workstation**:
- "Lane [N] complete: [summary]" after `npm run [lane]:apply`
- Report any defer reasons immediately

**All → Workstation**:
- After Phase B: "Ready for Phase C" or "Has blockers"

---

## Expected Timeline

```
T+0:00  Lane 3 complete ✅ → Agents unblocked
T+0:05  All agents start simultaneously (4 lanes × 1.5–2.5h each)
T+2:30  Agents report lane completion (parallel window 2–3h)
T+3:00  Phase B cross-lane verification (serial, 1h)
T+4:00  Phase C final gate (serial, 30min)
T+4:30  🎉 ALL LANES 100% COMPLETE
```

---

## Files in This Package

1. `docs/atlas/AGENT-TASK-PACKAGES-2026-06-13.md` — This document
2. `docs/atlas/LANE-QUICK-REFERENCE.md` — Detailed checklists per lane
3. `src/lib/server/atlas/ace-kag-dag-evidence-schema.ts` — Schema to import
4. `docs/atlas/HARNESS-STANDARDIZATION-ROLLOUT.md` — Template patterns

## Status: READY FOR PARALLEL EXECUTION ✅

All agents can start immediately. Lane 3 blocker is unblocked.

