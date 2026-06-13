# Parent Atlas Indexing Harness — Standardization Rollout Plan

**Date**: 2026-06-13  
**Status**: Env-contract triple ✅ complete; rollout to 4 more lanes in progress  

---

## What Changed

All Parent Atlas indexing pipelines now follow a **standardized 5-stage gate harness** with **ACE/KAG/DAG evidence as a first-class artifact**.

### Before (Old Pattern)
```
Producer → Artifact ✓ Consume → Apply → (Maybe) log evidence
```
Problem: Evidence trail is opaque. Agent error-fixing hooks have no deterministic gate status to inspect.

### After (New Pattern)
```
Producer → Artifact → Validate JSON → Consumer Dry-Run → 
ACE/KAG/DAG Hit (structured) → Smoke Test → Gate Pass/Defer → Apply
```

Every stage emits gate status. Evidence is produced **before** mutation, not after.

---

## Harness Stages (5)

| Stage | Script | Input | Output | Gate |
|-------|--------|-------|--------|------|
| 1: Syntax | Node --check | .mjs | Exit code | PASS/FAIL |
| 2: Producer | audit-*.mjs | (none) | docs/reports/*.json | File exists |
| 3: Artifact Valid | JSON.parse | docs/reports/*.json | Parsed object | No parse error |
| 4: Consumer Dry-Run | index-*.mjs --dry-run | Artifact | docs/reports/*-dry-run.json | Structured dry-run report |
| 5: ACE/KAG/DAG Hit | Zod validation | Dry-run output | Hit object | Hit.gates all PASS |
| 6: Smoke Test | Test script | Hit object | Schema check | Shape matches |
| 7: Final Gate | canApply(hit) | Hit object | True/False | All gates PASS |
| 8: Apply | index-*.mjs --apply | Artifact | Postgres/Qdrant/Redis | Transaction committed |

---

## Env-Contract Triple (Completed)

The first full harness implementation — three scripts enforcing all 5 stages:

### Files
1. **audit-env-contract.mjs** — Producer
   - Runs .env audit
   - Outputs: `docs/reports/env-contract-audit.json`

2. **index-env-contract.mjs** — Consumer
   - Reads audit artifact
   - Validates via 4 gates (redaction, DB keys, Redis keys, optional keys)
   - Dry-run outputs: `docs/reports/env-contract-index-dry-run.json` with ace_kag_dag_hit block
   - --apply-only commits to atlas_packets

3. **run-indexing-gate.mjs** — Orchestrator
   - Enforces sequence: Producer → Consumer dry-run → Consumer apply
   - Fails early if any stage fails
   - Invokes all scripts with proper error handling

### ACE/KAG/DAG Hit Shape
```json
{
  "ace_kag_dag_hit": {
    "packet_kind": "env_contract",
    "packet_key": "env_contract:abc123",
    "source_ref": "env-contract:parent-atlas",
    "feature_id": "infrastructure_env_contract",
    "evidence": ["audit-env-contract", "env-contract-audit.json", "redacted-env"],
    "topology": { "community_id": null, "concept_ids": [] },
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

### Verification
```bash
node --check scripts/atlas/audit-env-contract.mjs
node --check scripts/atlas/index-env-contract.mjs
node --check scripts/atlas/run-indexing-gate.mjs
# All three pass syntax check ✅
```

---

## Rollout to 4 More Lanes

Using the env-contract triple as the **canonical template**, apply to:

### Lane 1: Concept Evidence Spine
**Producer**: `audit-concept-evidence-spine.mjs`
```typescript
// Outputs: docs/reports/concept-evidence-spine-audit.json
{
  "concepts": [...],
  "packet_keys_present": 10,
  "feature_ids_present": 10,
  "evidence_cards_valid": false,  // ← target of backfill
  "gates": { "audit": "PASS" }
}
```

**Consumer**: `backfill-concept-evidence-spine.mjs --dry-run | --apply`
```typescript
// Dry-run outputs: docs/reports/concept-evidence-spine-backfill-dry-run.json
{
  "ace_kag_dag_hit": {
    "packet_kind": "concept_evidence",
    "packets_affected": 7753,
    "evidence": ["audit-concept-evidence-spine", "atlas_packets", "concept-memory layer"]
  },
  "gates": { ... }
}
```

### Lane 1B: Higher-Hop Enrichment
**Producer**: `audit-higher-hop-enrichment.mjs`
```typescript
// Outputs: docs/reports/higher-hop-enrichment-pressure-audit.json
{
  "concepts": [
    { "name": "database_orm", "edge_count": 234, "pressure": "safe" },
    { "name": "gpu_cuda", "edge_count": 8934, "pressure": "deferred" }
  ]
}
```

**Consumer**: `seed-neo4j-used-concept-edges.mjs --safe-only --dry-run | --apply`
```typescript
// Dry-run outputs: docs/reports/higher-hop-enrichment-seed-dry-run.json
{
  "ace_kag_dag_hit": {
    "packet_kind": "higher_hop",
    "trace_count": 1134,
    "evidence": ["audit-higher-hop-enrichment", "selected_concepts", "neo4j transaction plan"]
  },
  "gates": { ... }
}
```

### Lane 2: Recommendation Merge
**Producer**: `audit-recommendation-merge.mjs`
```typescript
// Outputs: docs/reports/recommendation-merge-key-audit.json
{
  "total_candidates": 12847,
  "post_dedup": 5,
  "dedup_reason": "merge_key collision",
  "evidence": ["detectStaleFeatures (capped at 5)", "merge-key normalization"]
}
```

**Consumer**: `materialize-recommendation-tasks.mjs --dry-run | --apply`
```typescript
// Dry-run outputs: docs/reports/recommendation-materialize-dry-run.json
{
  "ace_kag_dag_hit": {
    "packet_kind": "recommendation",
    "packets_affected": 5,
    "evidence": ["audit-recommendation-merge", "feature dedup logic"]
  },
  "gates": { ... }
}
```

### Lane 4: GPU Karpathy + NES Chrom
**Producer**: `audit-gpu-enrichment.mjs`
```typescript
// Outputs: docs/reports/gpu-enrichment-audit.json
{
  "karpathy_scores_cached": 7753,
  "nes_chrom_latent_cached": 7753,
  "merge_ready": true,
  "evidence": ["gpu:karpathy:scores (Redis)", "autoencoder outputs (Postgres)"]
}
```

**Consumer**: `merge-gpu-enrichment.mjs --dry-run | --apply`
```typescript
// Dry-run outputs: docs/reports/gpu-enrichment-merge-dry-run.json
{
  "ace_kag_dag_hit": {
    "packet_kind": "gpu_enrichment",
    "packets_affected": 7753,
    "evidence": ["audit-gpu-enrichment", "karpathy scores", "NES latent vectors"]
  },
  "gates": { ... }
}
```

### Lane 5: TurboVec + Cache Sync
**Producer**: `audit-cache-readiness.mjs`
```typescript
// Outputs: docs/reports/cache-readiness-audit.json
{
  "turbovec_reachable": true,
  "redis_writable": true,
  "bifrost_writable": true,
  "evidence": ["turbovec :50062 health check", "Redis/Bifrost probes"]
}
```

**Consumer**: `sync-metadata-to-cache.mjs --dry-run | --apply`
```typescript
// Dry-run outputs: docs/reports/cache-sync-dry-run.json
{
  "ace_kag_dag_hit": {
    "packet_kind": "cache_metadata",
    "packets_affected": 7753,
    "evidence": ["audit-cache-readiness", "packet metadata fetch plan"]
  },
  "gates": { ... }
}
```

---

## Canonical Script Template

Every lane follows this structure:

### Producer (audit-*.mjs)
```javascript
// NO MUTATIONS. Read-only audit.
// Outputs: structured JSON with evidence trail

const audit = {
  checked_items: [...],
  gates: { audit: 'PASS' },
  evidence: ['data source 1', 'data source 2']
};

await fs.writeFile('docs/reports/audit.json', JSON.stringify(audit, null, 2));
```

### Consumer (backfill-*.mjs or materialize-*.mjs)
```javascript
// TWO MODES: --dry-run (no mutations) and --apply (mutations)
// Both emit the same ACE/KAG/DAG hit structure

const APPLY = process.argv.includes('--apply');
const hit = createAceKagDagHit(...);

// DRY-RUN always executes first
const dryRunReport = { ... hit structure ... };
await fs.writeFile('docs/reports/*-dry-run.json', JSON.stringify(dryRunReport, null, 2));

if (!APPLY) {
  console.log(`Next: node ${process.argv[1]} --apply`);
  process.exit(0);
}

// APPLY mode only if --apply flag present
try {
  // Postgres/Qdrant/Redis mutations here
  hit.gates.final_apply = 'PASS';
} catch (e) {
  hit.gates.final_apply = 'FAIL';
  throw e;
}

const applyReport = { ... hit structure ... };
await fs.writeFile('docs/reports/*-apply-report.json', JSON.stringify(applyReport, null, 2));
```

### Orchestrator (run-indexing-gate.mjs or similar)
```javascript
// Orchestrates: Producer → Artifact validation → Consumer dry-run → Consumer apply
// Fails early if any stage fails

async function runGate(config) {
  // Stage 1: Syntax check
  // Stage 2: Producer
  // Stage 3: Artifact validation
  // Stage 4: Consumer dry-run
  // Stage 5: ACE/KAG/DAG validation
  // Stage 6: Smoke test
  // Stage 7: Final gate (canApply)
  // Stage 8: Apply (only if all gates PASS)
}
```

---

## Validation Helpers

**Canonical schema**: `src/lib/server/atlas/ace-kag-dag-evidence-schema.ts`

```typescript
// Import and use in any validation script
import {
  AceKagDagHitSchema,
  createAceKagDagHit,
  recordGate,
  canApply,
  validateAceKagDagHit
} from '$lib/server/atlas/ace-kag-dag-evidence-schema';

// In your consumer script:
const hit = createAceKagDagHit('concept_evidence', packetKey, sourceRef, featureId, evidence);
recordGate(hit, 'producer', 'PASS');
recordGate(hit, 'artifact_valid', 'PASS');

if (canApply(hit)) {
  // Safe to --apply
}

const validation = validateAceKagDagHit(hit);
if (!validation.valid) {
  console.error(`Hit validation failed: ${validation.error}`);
}
```

---

## Rollout Sequence

1. **Env-contract** (done) ✅
2. **Concept Evidence** (in progress, Lane 1)
3. **Higher-Hop** (in progress, Lane 1B)
4. **Recommendation** (in progress, Lane 2)
5. **GPU Enrichment** (in progress, Lane 4)
6. **Cache Sync** (in progress, Lane 5)

All 6 lanes → standardized harness → deterministic agent error-fixing hooks.

---

## Benefits

| Before | After |
|--------|-------|
| Evidence buried in logs | Evidence is structured JSON artifact |
| Unclear gate status | Every stage has explicit PASS/FAIL/DEFER |
| Hard to replay/audit | Dry-run exact replica of --apply; full replay possible |
| Agent error-fixing guesses which stage failed | Agent reads hit.gates to pinpoint failure |
| No lineage before mutation | ACE/KAG/DAG hit chains packet_key → source_ref → feature_id |

---

## Next Action

1. **Workstation**: Wire skill-smoke-validation.spec.ts (Lane 3 blocker)
2. **Agents**: Apply template to Lanes 1, 1B, 2, 4 (parallel)
3. **All**: Validate against schema after each lane completes
4. **Final**: Run comprehensive cross-lane verification

See `docs/atlas/OPEN-LANES-NEXT-STEPS-2026-06-13.md` for detailed task breakdown and success criteria.
