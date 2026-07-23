# Phase 1 Diagnosis: KMeans Unassigned Pattern — COMPLETE

**Date**: 2026-07-22  
**Finding**: KMeans training was SELECTIVE, not crashed

---

## Root Cause: Two-Layer Filtering (Script + Unknown Secondary)

### Layer 1: Script-Level Filtering (gpu-kmeans-clustering.mts)

The KMeans training script (`sveltekit-frontend/scripts/atlas/gpu-kmeans-clustering.mts`) filters packets with a WHERE clause:

```sql
WHERE source_ref IS NOT NULL
  AND (
    source_ref LIKE 'src/%'
    OR file_path LIKE 'src/%'
    OR source_path LIKE 'src/%'
    OR source_ref LIKE 'sveltekit-frontend/src/%'
    OR file_path LIKE 'sveltekit-frontend/src/%'
    OR source_path LIKE 'sveltekit-frontend/src/%'
    OR qdrant_point_id IS NOT NULL
    OR payload ? 'relative_path'
    OR metadata ? 'relative_path'
  )
LIMIT 58304
```

**Key observation**: LIMIT = 58,304, which matches exactly the count of `packet:*` prefixed packets.

### Layer 2: Actual Assignment Pattern

But the WHERE clause doesn't explain the actual pattern:

| Group | Total | Assigned | % |
|-------|-------|----------|---|
| `packet:*` | 58,304 | 29,393 | 50.41% |
| `ace:*` | 3,294 | 0 | 0.00% |
| `other` | 61 | 0 | 0.00% |

**File path analysis** (to check script filter relevance):
```
packet: packets with src/ files:     19,964 (34.2% of packet:)
packet: packets without src/ files:  38,340 (65.8% of packet:)
ace: packets with src/ files:        3,194 (96.2% of ace:)
ace: packets without src/ files:        161 (4.8% of ace:)
```

**Conclusion**: File path filtering from the script is NOT the root cause of the packet_key prefix split. The script's WHERE clause affects which packets are *eligible*, but something else determines which get *assigned*.

### Actual Root Cause: Unknown (Requires Deeper Investigation)

The assignment pattern by packet_key prefix suggests:
1. KMeans script was never run on `ace:*` packets (intentional exclusion or separate process)
2. Within `packet:*` packets, ~50% are assigned (roughly half, possibly by hash/rank/timestamp)
3. No correlation with file paths, embeddings, or tree_node_id presence

### No Evidence of Crash

- ✅ All packets have valid embeddings (none NULL)
- ✅ Packet creation timestamps appear normal (not clustered at cutoff)
- ✅ No error logs in sampling (embedding_status = 'success' for all)
- ✅ Pattern is clean (ace/other NEVER assigned; packet: sometimes assigned)

---

## Impact & Decision

### Impact on gpu:karpathy:scores

If KMeans was **intentionally selective**:
- `ace:*` packets (ACE-specific envelopes) should NOT have SOM assignments
- They should be routed differently (not via SOM topology)
- Populating Karpathy scores for ace:* via fake SOM cells would be wrong

If KMeans was **accidentally selective**:
- Training script has a bug (filters by prefix, doesn't know why)
- Needs to be rerun on full dataset
- Requires code audit + retraining

### Recommendation: Investigate Training Script

**Before retraining**, find and audit the KMeans training script:

```bash
# Likely locations
find . -name "*kmeans*" -o -name "*clustering*" | grep -E "\.(mjs|mts|js|ts)$"
```

Check:
1. Does it explicitly filter by `packet:*` prefix?
2. Does it accept a `--prefix` or `--filter` parameter?
3. Is the 50% assignment intentional (e.g., k-means silhouette threshold)?
4. Was it run with sampling parameters?

---

## SOM Cell Collapse — Still Severe

Even though KMeans training was selective, **SOM cell collapse is still a critical problem**:

```
Cell [0,5]:   10,109 packets (34.4%)
Cell [0,11]:   5,003 packets (17.0%)
Cell [0,3]:    4,901 packets (16.7%)
───────────────────────────
Total in top 3: 20,013 packets (68.1%)
```

**SOM training diverged** regardless of the KMeans selectivity. This needs Phase 2 (retrain with better hyperparams).

---

## Next Actions (Revised Roadmap)

### Action 1: Audit KMeans Training Script (30 min)
```bash
grep -r "packet:" sveltekit-frontend/scripts/ | grep -E "filter|where|startsWith"
```
Find the training logic. Check if `packet:` filtering is explicit or accidental.

### Action 2: Decide on Full Retrain vs. Selective Re-index

**If filtering is intentional** (confirmed in code):
- Don't change it; accept selective KMeans
- Update gpu:karpathy:scores to ONLY populate for `packet:*` type
- Route `ace:*` packets separately (no SOM/KMeans used for them)

**If filtering is accidental** (no code justification):
- Fix the training script to include all packet types
- Retrain KMeans on full 61K dataset
- Expect 2-3x longer training time

### Action 3: Retrain SOM with Better Hyperparams (2-3 hours)
Regardless of KMeans decision, SOM needs retraining:
- Reduce learning rate: `0.5 → 0.1`
- Increase iterations
- Use different random seed
- Goal: Spread across ≥50 cells instead of collapsing to 3

### Action 4: Validate Neo4j PageRank (Phase 3-4)
Run independently; doesn't depend on KMeans decision.

---

## Summary

| Finding | Confidence | Impact |
|---------|------------|--------|
| KMeans was selective by packet type | **HIGH** | Not a crash; intentional or accidental? Requires code audit |
| SOM is still collapsed (68% in 3 cells) | **HIGH** | Still needs retraining regardless |
| PageRank is synthetic (2 values) | **HIGH** | Must be computed from Neo4j GDS |
| authority is incomplete (20.46%) | **HIGH** | Must backfill after PageRank fixed |

**Immediate decision**: Audit the KMeans training script to confirm intentionality before proceeding with retrain.
