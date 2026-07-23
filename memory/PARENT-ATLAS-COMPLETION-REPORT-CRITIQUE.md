# Parent Atlas Completion Report — Critique & Correction

**Date**: 2026-07-22  
**Original Report**: parent-atlas-final-completion.md (2026-06-23)  
**Status**: REQUIRES REVISION

---

## Critical Finding: Report Aggregation Semantics Are Wrong

### The Contradiction

The report claims:
```
Overall: ✅ PASS
M1 Identity Spine: ✅ PASS
```

But shows:
```
M1: 0/6 gates PASS
qdrant_feature_id      ❌ SKIP
qdrant_canonical_ref   ❌ SKIP
qdrant_som             ❌ SKIP
qdrant_karpathy        ❌ SKIP
neo4j_canonical        ❌ SKIP
valkey_warm            ❌ SKIP
```

**A milestone with 0/6 executed gates cannot be labeled PASS.**

This indicates the report generator treats `failedCount === 0` as success without checking whether gates actually executed.

### Corrected Aggregation Logic

Required:
```typescript
type GateStatus = "PASS" | "FAIL" | "SKIP" | "NOT_RUN";

function aggregateMilestone(gates: Array<{required: boolean; status: GateStatus}>) {
  const required = gates.filter((gate) => gate.required);
  const failed = required.filter((gate) => gate.status === "FAIL");
  const skipped = required.filter((gate) => gate.status === "SKIP" || gate.status === "NOT_RUN");
  const passed = required.filter((gate) => gate.status === "PASS");

  if (failed.length > 0) return "FAIL";
  if (skipped.length > 0) return "INCOMPLETE";
  if (required.length === 0) return "NOT_APPLICABLE";
  if (passed.length === required.length) return "PASS";
  return "INCOMPLETE";
}
```

---

## Corrected Status Per Milestone

| Milestone | Original | Corrected | Evidence |
|-----------|----------|-----------|----------|
| M1 Identity Spine | ✅ PASS | ⚠ INCOMPLETE | 0/6 gates executed (SKIP) |
| M2 Replay Validation | ✅ PASS | ✅ PASS WITH EXCEPTIONS | 302/314 = 96.2%, 12 unexplained failures |
| M3 Lineage (7-layer) | ✅ PASS | ✅ PASS | 7/7 checks verified |
| M4 CHR97 Packet/Card | ✅ PASS | ✅ PASS | 13/13 checks verified |
| M5 Production Readiness | ✅ PASS | ✅ PASS (SCOPED) | 66/66 implemented checks (does NOT override M1) |
| **Overall** | ✅ PASS | ⚠ INCOMPLETE | M1 blocks release |

---

## Revised Overall Status

```
Atlas Parent Validation Report

Overall: ⚠ INCOMPLETE

M1 Identity Spine:       INCOMPLETE — 0/6 required gates executed
M2 Replay Validation:    PASS WITH EXCEPTIONS — 302/314 (96.2%)
M3 Seven-Layer Lineage: PASS — 7/7
M4 CHR97 Packet/Card:   PASS — 13/13
M5 Operational Readiness: PASS — 66/66 implemented checks
```

---

## Release Blockers (Must Fix Before Ship)

1. **M1 Identity Spine gates not executed**
   - qdrant_feature_id: SKIP (needs run)
   - qdrant_canonical_ref: SKIP (needs run)
   - qdrant_som: SKIP (needs run)
   - qdrant_karpathy: SKIP (needs run)
   - neo4j_canonical: SKIP (needs run)
   - valkey_warm: SKIP (needs run)

2. **M2 Replay: 12/314 packets unexplained**
   - Must classify: expected exclusions vs. identity mismatches vs. hash failures
   - No acceptance threshold documented (96.2% assumed acceptable but not proven)

3. **Canonical Qdrant collection identity unclear**
   - Report validates against `codebase_chunks_768` (legacy?)
   - Current canonical is `codebase_chunks_384_hybrid`
   - Lineage chain C5 check must explicitly state: `collection=codebase_chunks_384_hybrid`

4. **P2 Cluster Bridge not implemented**
   - `task_semantic_packets.cluster_id` is NULL for all 302 rows
   - Modal cluster design proposed but not versioned or validated

5. **NLP Sidecar operating in degraded mode**
   - spaCy: unavailable
   - LangExtract: unavailable
   - tree-sitter: unavailable
   - ast-grep: unavailable
   - Correct label: `NLP_SIDECAR_TRANSPORT_PROVEN`, NOT full capability

---

## Advisories (Important but Non-Blocking)

| Advisory | Finding | Implication |
|----------|---------|-------------|
| Karpathy coverage | 44.5% global, 100% eligible set | Intentional selective coverage — needs two metrics |
| nes_chrom_packets scale | 27 rows across 18 features | Advisory (acceptable) |
| Qdrant point ID gaps | 20/27 packets have IDs | 74.1% reachability (acceptable) |
| M5 does not override M1 | Operational checks pass but identity unvalidated | Production readiness requires identity gates |

---

## Recommended Execution Order (Before Ship)

1. ✅ **Fix report generator semantics** (aggregation logic, gate status types)
2. ⏳ **Re-run M1 as real required gates** (execute all 6, do not skip)
3. ⏳ **Confirm canonical Qdrant collection** (explicitly state collection=codebase_chunks_384_hybrid)
4. ⏳ **Classify M2 replay exceptions** (12 packets: why did they fail?)
5. ⏳ **Install and validate NLP sidecar dependencies** (spaCy, tree-sitter, ast-grep, LangExtract)
6. ⏳ **Produce versioned KMeans snapshot** (k, seed, iterations, inertia, silhouette)
7. ⏳ **Build cluster bridge** (task_packet_cluster_bridge table with confidence/support)
8. ⏳ **Validate bridge coverage** (≥80% cluster_id fill rate)
9. ⏳ **Warm Valkey only from validated artifacts** (do not populate from unvalidated gates)
10. ⏳ **Populate Karpathy scores for declared eligible set only** (document scope: top-200 PageRank or all)
11. ⏳ **Re-run full completion report** with corrected aggregation

---

## Cluster Bridge Schema (P2 Implementation)

**Problem**: One feature can span multiple GPU clusters. Modal cluster is reasonable derived label but needs confidence bounds and deterministic tie-break.

**Solution**: Materialize bridge in versioned table before updating task_semantic_packets:

```sql
CREATE TABLE task_packet_cluster_bridge (
  feature_id UUID PRIMARY KEY,
  cluster_id_primary TEXT NOT NULL,
  confidence FLOAT NOT NULL,
  support_count INT NOT NULL,
  total_count INT NOT NULL,
  cluster_distribution JSONB NOT NULL,
  assignment_method TEXT NOT NULL, -- "feature_modal_cluster"
  cluster_snapshot_id TEXT NOT NULL,
  generated_at TIMESTAMP NOT NULL,
  content_hash CHAR(64) NOT NULL
);
```

**Derivation SQL**:
```sql
WITH cluster_counts AS (
  SELECT
    feature_id,
    cluster_id,
    COUNT(*) AS support_count
  FROM atlas_feature_map
  WHERE feature_id IS NOT NULL AND cluster_id IS NOT NULL
  GROUP BY feature_id, cluster_id
),
feature_totals AS (
  SELECT feature_id, SUM(support_count) AS total_count
  FROM cluster_counts GROUP BY feature_id
),
ranked AS (
  SELECT
    cc.feature_id,
    cc.cluster_id,
    cc.support_count,
    ft.total_count,
    cc.support_count::float / NULLIF(ft.total_count, 0) AS confidence,
    ROW_NUMBER() OVER (
      PARTITION BY cc.feature_id
      ORDER BY cc.support_count DESC, cc.cluster_id ASC
    ) AS cluster_rank
  FROM cluster_counts cc
  JOIN feature_totals ft USING (feature_id)
)
INSERT INTO task_packet_cluster_bridge
SELECT
  feature_id,
  cluster_id,
  confidence,
  support_count,
  total_count,
  jsonb_object_agg(cluster_id, support_count),
  'feature_modal_cluster',
  'snapshot_2026_07_22',
  NOW(),
  md5(jsonb_build_object(
    'feature_id', feature_id,
    'cluster_id', cluster_id,
    'support_count', support_count
  )::text)::char(64)
FROM ranked WHERE cluster_rank = 1;
```

**Validation gate**: ≥80% of task_semantic_packets features have cluster_id_primary after bridge applied.

---

## NLP Sidecar Status Correction

**Current (incorrect)**: Full capability assumed  
**Corrected**: Degraded mode

| Dependency | Status | Action |
|------------|--------|--------|
| torch | ✅ available | OK |
| spaCy | ❌ unavailable | Install `python -m spacy download en_core_web_sm` |
| LangExtract | ❌ unavailable | Install or use fallback |
| tree-sitter | ❌ unavailable | Install `pip install tree-sitter` + language bindings |
| ast-grep | ❌ unavailable | Install `cargo install ast-grep` or use npm version |

**Next sidecar gate** (`/health` endpoint):
```json
{
  "status": "ready",
  "torch": true,
  "spacy": true,
  "tree_sitter": true,
  "ast_grep": true,
  "parser_backend": "native" // not "fallback"
}
```

**Next `/analyze` gate** (fixture: `src/lib/server/auth.ts`):
```json
{
  "language": "typescript",
  "symbol_count": ≥ 1,
  "ast_nodes": ≥ 1,
  "ast_grep_matches": ≥ 1,
  "source_spans_preserved": true,
  "confidence": ≥ 0.9
}
```

---

## Karpathy Coverage Metrics

**Current (conflated)**: "44.5% fully aligned"  
**Corrected**: Two separate metrics

```
Karpathy eligible-set coverage:     200 / 200 = 100% (top PageRank files)
Karpathy global corpus coverage:     89 / 200 = 44.5% (random sample)
Convergence: intentionally selective, not global
```

If Karpathy scoring is selective by design, report should state:
- Eligible files: top-200 PageRank by authority
- Global random sample: 44.5% (expected; not all files require Karpathy scoring)

---

## Summary

| Finding | Severity | Fix |
|---------|----------|-----|
| Report PASS semantics wrong | CRITICAL | Implement corrected aggregation logic |
| M1 gates not executed | BLOCKER | Re-run M1 with all 6 gates |
| M2 exceptions unclassified | BLOCKER | Classify 12 replay failures |
| Canonical Qdrant collection unclear | BLOCKER | Explicitly validate codebase_chunks_384_hybrid |
| NLP sidecar degraded | BLOCKER | Install missing dependencies + re-validate |
| Cluster bridge not versioned | BLOCKER | Materialize bridge table + validate coverage |
| Karpathy metrics conflated | ADVISORY | Split into eligible-set vs. global coverage |

**Corrected Overall Status**: ⚠ **INCOMPLETE** (blockers must resolve before PASS)

---

**Next Action**: Execute M1 gates (now that report semantics are clear) + classify M2 exceptions + validate canonical Qdrant collection.
