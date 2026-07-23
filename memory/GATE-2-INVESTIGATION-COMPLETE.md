# Gate 2 Investigation — Complete

**Date**: 2026-07-22  
**Status**: COMPLETE | 5 gates audited | All findings documented

---

## Summary

Five critical infrastructure gates were audited. Results show:

| Gate | Metric | Result | Status |
|------|--------|--------|--------|
| **2a** | KMeans Assignment | 29,393 / 61,659 (47.67%) | ⚠ PARTIAL |
| **2b** | SOM Cell Collapse | 68.1% in top 3 cells | ❌ SEVERE |
| **3** | tree_node_id Coverage | 58,365 / 61,659 (94.66%) | ✅ GOOD |
| **4** | PageRank Distribution | 2 distinct values (0, 0.5) | ❌ SYNTHETIC |
| **5** | authority_score Coverage | 12,616 / 61,659 (20.46%) | ❌ INCOMPLETE |

---

## Gate 2a: KMeans Assignment Coverage

**Result**: 29,393 / 61,659 packets = **47.67% assigned**

### Analysis
- 32,266 packets (52.33%) have NULL `som_cluster_id`
- No clear pattern visible yet (would need JOIN with source_ref / feature_id / directory_path to diagnose)
- Assignment appears binary: either assigned or NULL (no partial/deferred state)

### Root Cause Hypothesis
KMeans training either:
1. Crashed/was interrupted mid-run (left ~52% unprocessed)
2. Used selective filtering (excluded certain packets by type/size/quality)
3. Failed on certain packets without error handling (dropped silently)
4. Was run with `n_samples < total` parameter (deliberate sampling)

### Next Action
Query unassigned packets to find pattern:
```sql
SELECT 
  COUNT(*),
  COUNT(CASE WHEN content_embedding IS NULL THEN 1 END) null_embedding,
  COUNT(CASE WHEN tree_node_id IS NULL THEN 1 END) null_tree_id,
  COUNT(CASE WHEN directory_path IS NULL THEN 1 END) null_dir,
  COUNT(CASE WHEN source_ref IS NULL THEN 1 END) null_src_ref
FROM atlas_packets
WHERE som_cluster_id IS NULL;
```

---

## Gate 2b: SOM Cell Distribution — SEVERE COLLAPSE

**Result**: Top 3 cells contain 68.1% of all assigned packets

### Distribution

| Rank | Cell | Count | % of Assigned | Cumulative |
|------|------|-------|---------------|------------|
| 1 | [0,5] | 10,109 | 34.4% | 34.4% |
| 2 | [0,11] | 5,003 | 17.0% | 51.4% |
| 3 | [0,3] | 4,901 | 16.7% | 68.1% |
| 4 | [0,1] | 1,565 | 5.3% | 73.4% |
| 5 | [1,13] | 900 | 3.1% | 76.5% |
| ... | ... | ... | ... | ... |
| ~15 | [5,17] | 142 | 0.5% | 100.0% |

### Problem
- 20×20 grid = 400 possible cells
- Only ~15 cells have any assignments
- **~385 cells are empty** (0 packets)
- Expected distribution: ~73 packets/cell (uniform)
- Actual: cell [0,5] has **138× expected density**

### Root Cause
SOM training collapsed. Likely causes:
1. **Initialization bias** — random initial weights clustered near [0,0]
2. **Learning rate too high** — overshooting optimal positions
3. **Too few training iterations** — convergence not reached
4. **Topology constraint too loose** — neighboring cells not pulled together
5. **Data distribution skewed** — natural clustering toward [0,5] region (less likely given random init)

### Quantification
```
Cell [0,5]: 10,109 packets
Expected (uniform): 61,659 / 400 = 154.1 packets/cell
Actual density ratio: 10,109 / 154.1 = 65.6× expected
Collapse severity: CRITICAL
```

---

## Gate 3: tree_node_id Identity Coverage

**Result**: 58,365 / 61,659 (94.66%) have tree_node_id

### Analysis
- Coverage is **excellent** (94.66%)
- Only 3,294 packets (5.34%) are missing tree_node_id
- This is a strong identity spine — suitable for canonical packet identity

### Observation
- Missing tree_node_id count (3,294) exactly matches pagerank_score == 0 count
- This suggests tree_node_id presence directly determines PageRank value (synthetic pattern)

---

## Gate 4: PageRank Distribution — SYNTHETIC

**Result**: Only 2 distinct values

```
pagerank_score = 0.0:   3,294 packets (5.34%)
pagerank_score = 0.5:  58,365 packets (94.66%)
```

### Problem
- Real PageRank follows power-law distribution (few high-authority nodes, many low-authority)
- This is a **binary fallback**: default 0.5 for all processed packets, 0.0 for unprocessed
- Pattern: `pagerank_score == 0.0` ⟺ `tree_node_id IS NULL` (perfect correlation)

### Conclusion
PageRank column in Postgres is **not a real measurement**. It's a placeholder:
- Value 0 = "packet not processed"
- Value 0.5 = "packet processed, default score"

**Real PageRank must come from Neo4j GDS**, not from Postgres.

### Impact
- gpu:karpathy:scores blend uses `pagerank_score` (0.4 weight) — **blend is invalid if used**
- Ranking decisions cannot trust this column
- Must compute real PageRank from Neo4j topology before using

---

## Gate 5: authority_score Coverage — INCOMPLETE

**Result**: 12,616 / 61,659 (20.46%) have authority_score

### Analysis
- **79.54% missing** (49,043 packets)
- Large gap between packets with tree_node_id (94.66%) and packets with authority (20.46%)
- Authority scores exist only for a subset of identified packets

### Problem
- Authority should be computed from Neo4j graph authority (PageRank, betweenness, closeness)
- Current partial coverage suggests:
  - Selective authority computation (only top packets)
  - Incomplete backfill (authority computation ran but didn't cover all)
  - Different authority source than main identity pipeline

### Next Action
Backfill all 49,043 missing authority_score values from Neo4j graph authority computations (after Gate 4 real PageRank is done).

---

## Dependency Chain for Gates to Pass

```
Gate 2a (KMeans 47.67%)
    ├─ Root cause: Why 52% unassigned?
    ├─ Remediation: Retrain with full dataset OR document selective scope
    └─ Blocker: Cannot use KMeans for clustering until understood

Gate 2b (SOM collapse)
    ├─ Root cause: Why 68% in 3 cells?
    ├─ Remediation: Retrain with better hyperparams (lower learning rate, more iterations, random init)
    └─ Blocker: SOM routing unreliable — cannot use for topology-preserving search

Gate 3 (tree_node_id 94.66%) ✅
    ├─ Status: PASS
    └─ Observation: Strong identity spine; safe for canonical identity

Gate 4 (PageRank synthetic)
    ├─ Root cause: Why only 0 and 0.5?
    ├─ Remediation: Compute real PageRank from Neo4j GDS projection
    ├─ Requirement: Neo4j graph must exist + GDS license/extension available
    └─ Blocker: Cannot blend with fake PageRank

Gate 5 (authority 20.46%)
    ├─ Depends on: Gate 4 (real PageRank computed)
    ├─ Remediation: Backfill all 49,043 missing rows from Neo4j authority
    └─ Blocker: Incomplete authority invalidates Karpathy blend (0.3 weight on missing data)
```

---

## Execution Roadmap to Unblock

### Phase 1: Diagnose Unassigned KMeans Packets (1-2 hours)
```sql
SELECT 
  COUNT(*) total_unassigned,
  COUNT(CASE WHEN content_embedding IS NULL THEN 1 END) null_embedding,
  COUNT(CASE WHEN tree_node_id IS NULL THEN 1 END) null_tree_id,
  COUNT(CASE WHEN directory_path IS NULL THEN 1 END) null_dir,
  COUNT(CASE WHEN source_ref IS NULL THEN 1 END) null_src_ref
FROM atlas_packets
WHERE som_cluster_id IS NULL;
```
- If pattern is clear (e.g., all missing embeddings), retrain KMeans with those packets excluded
- If pattern is random, investigate whether training crashed mid-run

### Phase 2: Retrain SOM with Better Hyperparams (2-3 hours)
- Current: Collapsed to 3 cells
- Target: Spread across ≥50 cells
- Adjust:
  - Learning rate: `0.5 → 0.1`
  - Iterations: `N → 2×N`
  - Sigma (neighborhood radius): increase
  - Random seed: try 3-5 different seeds

### Phase 3: Verify Neo4j Topology Exists (30 min)
```cypher
MATCH (n) WHERE n:Packet OR n:Feature RETURN count(n) AS node_count;
MATCH (r) RETURN count(r) AS rel_count;
```
- If Neo4j is empty or missing, this blocks real PageRank computation
- May need to rebuild topology from Postgres + Qdrant

### Phase 4: Compute Real PageRank via Neo4j GDS (1-2 hours)
```cypher
CALL gds.pageRank.compute('packets-projection', {
  relationshipTypes: ['SEMANTIC_SIMILAR', 'DEPENDS_ON'],
  dampingFactor: 0.85,
  maxIterations: 20
})
YIELD nodeCount, relationshipCount;
```
- Export results to Postgres `pagerank_score_real` column (DO NOT overwrite old column)
- Validate: should see power-law distribution, not binary [0, 0.5]

### Phase 5: Backfill authority_score (30 min)
```sql
UPDATE atlas_packets
SET authority_score = (
  SELECT pagerank_score_real FROM neo4j_pagerank_export
  WHERE neo4j_pagerank_export.packet_key = atlas_packets.packet_key
)
WHERE authority_score IS NULL AND tree_node_id IS NOT NULL;
```
- After this, authority coverage should reach 90%+

### Phase 6: Validate Gates 2–5 (30 min)
- Re-audit all 5 gates
- Confirm SOM collapse fixed, KMeans coverage ≥90%, authority coverage ≥90%, real PageRank distributed
- Then resume gpu:karpathy:scores population and downstream retrieval

---

## Impact on Current Work

### BLOCKED (Depends on Gate 2b/4/5 fix):
- `gpu:karpathy:scores` population (depends on real PageRank)
- Summarization worker (depends on valid ranking features)
- Retrieval integration (depends on valid cluster/authority)

### CAN PROCEED (Independent of gates):
- Phase 5 (Domain classification) — uses different features
- Phase 6 (Qdrant schema) — validation-only, no ranking
- NLP sidecar dependency install — separate infrastructure

### RECOMMENDATION:
1. Diagnose KMeans unassigned pattern (Phase 1)
2. If pattern is clear, proceed with Phase 2 (SOM retrain)
3. In parallel, check Neo4j topology health (Phase 3)
4. If topology missing, rebuild before Phase 4
5. After Phase 4-5 complete, resume summarization + Karpathy scoring

---

## Files to Create/Update

1. **Create**: `scripts/atlas/diagnose-kmeans-unassigned.mjs` (Phase 1)
2. **Create**: `scripts/atlas/retrain-som-hyperparams.mjs` (Phase 2)
3. **Create**: `scripts/atlas/compute-pagerank-neo4j.mjs` (Phase 4)
4. **Create**: `scripts/atlas/backfill-authority-score.mjs` (Phase 5)
5. **Update**: `OPENSPEC-RETRIEVAL-PIPELINE-2026-07-22.md` (mark Gates 2-5 status)
6. **Update**: `memory/MEMORY.md` (link to this report, mark blocker status)

---

## Key Metrics Summary

| Component | Expected | Actual | Gap | Status |
|-----------|----------|--------|-----|--------|
| KMeans Assigned | 90%+ | 47.67% | -42.33% | ❌ BLOCKED |
| SOM Cell Usage | 200+ cells | ~15 cells | -185 cells | ❌ BLOCKED |
| SOM Distribution | Uniform | 68% in top 3 | Severe | ❌ BLOCKED |
| tree_node_id | 90%+ | 94.66% | +4.66% | ✅ PASS |
| PageRank Distinct | 100+ | 2 | -98 | ❌ BLOCKED |
| authority Coverage | 90%+ | 20.46% | -69.54% | ❌ BLOCKED |

**Overall Gate Status**: 1 PASS / 4 BLOCKED

Next action: Execute Phase 1 (diagnose KMeans unassigned) to determine if retrain or root cause fix is needed.
