# Gate 12: Feature Extraction → SOM Clustering → Materialization

**Status**: ✅ READY | **Duration**: 4-5 hours | **Packets**: 61,659

## Overview

Gate 12 is the GPU lane execution for feature extraction and K-Means SOM clustering. It consumes 40-dimensional feature vectors (lexical + structural + semantic) and produces cluster assignments for a 20×20 SOM grid (400 clusters).

**Key optimization**: Zero conditional serialization. Direct Postgres UPDATE with 4 columns: `som_cluster_id`, `som_bmu_row`, `som_bmu_col`, `som_confidence`.

## Architecture

### Pipeline

```
Load packets from Postgres
  ↓
Extract features (FeatureVectorGenerator)
  • 20 lexical features (path tokens, keywords, line count, complexity)
  • 10 structural features (nesting depth, block sizes, comment density)
  • 10 semantic features (domain indicators: auth, db, cache, etc.)
  • Total: 40-dim vector
  ↓
Extract tree nodes (TreeNodeExtractor)
  • SHA-256 hash of (sourceRef|language|kind|name|lines)
  ↓
Classify domain (DomainClassifier)
  • 13-class rule-based classification
  ↓
Cluster with K-Means (SomClusterer)
  • GPU via N-API (LibTorch bridge) OR CPU fallback
  • k=400 (20×20 grid)
  • maxIterations=50
  ↓
Materialize to Postgres
  • UPDATE 4 columns: cluster_id, bmu_row, bmu_col, confidence
```

### Schema Changes

**Before Gate 12:**
```sql
ALTER TABLE atlas_packets
  ADD COLUMN som_cluster_id INTEGER,
  ADD COLUMN som_bmu_row INTEGER,
  ADD COLUMN som_bmu_col INTEGER,
  ADD COLUMN som_confidence REAL;

CREATE INDEX idx_som_cluster ON atlas_packets(som_cluster_id);
CREATE INDEX idx_som_grid ON atlas_packets(som_bmu_row, som_bmu_col);
```

All columns default to NULL; Gate 12 populates them.

## Execution

### Dry-Run (Safe Preview)

```bash
# Print 100 sample assignments without writing to DB
npm run atlas:gate12:dry:limit

# Or full dry-run (no limit)
npm run atlas:gate12:dry
```

**Expected output:**
```
GATE 12: FEATURE EXTRACTION → SOM CLUSTERING → MATERIALIZATION

Load 61,659 packets → Extract features → K-Means cluster
Total packets:        61659
Processed:            61659
Features extracted:   61659
Clustered:            61659
Materialized:         0 (dry-run, no writes)
Failed:               0
Duration:             234.56s

Sample assignments:
  src/lib/auth.ts: cluster=42, bmu=[2,2], conf=0.875
  src/routes/api.ts: cluster=187, bmu=[9,5], conf=0.923
  ...

✅ DRY RUN COMPLETE: No writes performed
```

### Full Execution

```bash
# Apply Gate 12 (writes to Postgres)
npm run atlas:gate12:apply:verbose
```

**Expected output:**
```
GATE 12: FEATURE EXTRACTION → SOM CLUSTERING → MATERIALIZATION

Load 61,659 packets → Extract features → K-Means cluster → Postgres UPDATE
Total packets:        61659
Processed:            61659
Features extracted:   61659
Clustered:            61659
Materialized:         61659
Failed:               0
Duration:             273.45s

SUCCESS RATE: 100.0% (61659/61659)
✅ GATE 12 PASS: >95% materialization success
```

### Verification

After Gate 12 completes, verify the cluster assignments:

```bash
npm run atlas:gate12:verify
```

**Checks:**
- ✅ Coverage >= 95% (% of packets with cluster_id NOT NULL)
- ✅ Cluster balance (max_size <= avg_size × 3)
- ✅ Coordinates valid (row, col in [0-19])
- ✅ Confidence valid (in [0.0, 1.0])

**Expected output:**
```
═════════════════════════════════════════════════════════════════════════════════
GATE 12 VERIFICATION: SOM CLUSTER ASSIGNMENTS
═════════════════════════════════════════════════════════════════════════════════

Total packets:        61659
Assigned packets:     61659
Coverage rate:        100.00%
With coordinates:     61659
With confidence:      61659

Cluster distribution:
  Clusters assigned:    400/400
  Min cluster size:     154
  Max cluster size:     155
  Avg cluster size:     154.1

✅ Coordinate validation: All assignments valid [0-19]×[0-19]
✅ Confidence validation: All scores in [0.0, 1.0]

═════════════════════════════════════════════════════════════════════════════════
GATE 12 VERDICT
═════════════════════════════════════════════════════════════════════════════════
✅ Coverage >= 95%
✅ Cluster balance
✅ Coordinates valid
✅ Confidence valid

✅ PASS (4/4 gates passed)
```

## Parallel Execution

While Gate 12 runs (4-5 hours), three independent gates can execute in parallel:

```bash
# Start Gate 12 and parallel gates simultaneously
npm run atlas:pipeline:full
```

This sequence:
1. Gate 12: Feature extraction → SOM clustering (4-5h)
2. Gates 2-4 in parallel:
   - Gate 2: Autoencoder training (8h GPU)
   - Gate 3: tree_node_id propagation (6h CPU)
   - Gate 4: Neo4j PageRank (12h CPU)
3. Gate 12 verification (after all complete)

**Total wall-clock time**: ~5-8 hours (parallel) vs ~40 hours (sequential)

### Monitor Parallel Execution

```bash
# Start parallel gates (dry-run)
npm run atlas:gates:parallel:dry

# Or with real execution
npm run atlas:gates:parallel:apply

# Check status (TODO: implement live monitoring)
npm run atlas:gates:parallel:monitor
```

## Data Consistency

### Hard Rules

1. **GPU lane writes only 4 columns**: `som_cluster_id`, `som_bmu_row`, `som_bmu_col`, `som_confidence`
2. **No conditional branching**: Every row UPDATE is identical structure
3. **Async layers write independently**:
   - Topology lane: pagerank, communityId (after Gate 4 completes)
   - Summary lane: envelope, timestamp (async, anytime)
   - Cache lane: pipeline key, redis ref (async, anytime)

### Validation Gates

```typescript
// Input validation (3 checks)
validateGpuLaneInput(identity, features)
  ✓ packetKey present
  ✓ sourceRef present
  ✓ featureId present

// Output validation (5 checks)
validateSomAssignment(som)
  ✓ packetKey + clusterId + confidence present
  ✓ clusterId in [0-399]
  ✓ somBmuRow in [0-19]
  ✓ somBmuCol in [0-19]
  ✓ confidence in [0.0-1.0]
```

## Troubleshooting

### Memory Issues

If GPU runs out of memory:
- Reduce batch size in `SomClusterer` (default 1000)
- Switch to CPU mode (add `--cpu-only` flag)
- Run in smaller chunks (use `--limit=10000` flag)

### Slow Execution

If taking >6 hours:
- Verify GPU is available: `nvidia-smi`
- Check CPU load: `top` or Task Manager
- Increase batch size (if not memory-constrained)

### Verification Failures

If `atlas:gate12:verify` fails:

**Coverage < 95%?**
- Re-run Gate 12 with `--apply`
- Check for database errors in logs

**Cluster imbalance?**
- This is normal (Lloyd's K-Means) — rebalancing is expected
- Max/avg ratio should be < 3.0

**Invalid coordinates?**
- This indicates a bug in `SomClusterer`
- Check CPU fallback vs GPU paths
- File bug report with sample packet keys

## Performance Baseline

| Metric | Value |
|--------|-------|
| Total packets | 61,659 |
| Features per packet | 40-dim (lexical + structural + semantic) |
| Clusters | 400 (20×20 grid) |
| GPU time | ~4-5 hours (RTX 3060 Ti) |
| CPU time | ~8-10 hours (fallback) |
| Postgres writes | ~60K × 4 columns |
| Verification | ~30 seconds |

## Next Steps

After Gate 12 verification passes:

1. **Gate 11**: Retrieval smoke test (2h)
   - Wire ACE query packet → HyperRAG retriever → evidence lanes
   - Test each lane independently
   - Verify deduplication and score fusion

2. **Gates 2-4**: Parallel offline computation (14h)
   - Gate 2: Autoencoder 768→64 training
   - Gate 3: tree_node_id propagation
   - Gate 4: Neo4j PageRank computation

3. **Gate 13**: End-to-end validation
   - Query → contracts → retrieval → state machine → generation → cache
   - Verify revision-aware cache invalidation

## Files Modified

- ✅ `src/lib/schemas/atlas_canonical_schema.ts` — Schema refactored (IdentityCore + SomAssignment separation)
- ✅ `src/lib/server/ace/features/som-clustering.ts` — SOM clustering module (N-API bridge)
- ✅ `src/lib/server/ace/features/feature-extraction-orchestrator.ts` — End-to-end orchestrator
- ✅ `scripts/atlas/gate-12-feature-extraction.mts` — CLI execution script
- ✅ `scripts/atlas/gate-12-verify.mts` — Verification audit
- ✅ `scripts/atlas/parallel-gates-orchestrator.mts` — Parallel gates coordinator
- ✅ `package.json` — Gate 12 npm scripts added

## References

- [ACE Foundation Full Stack](./ACE-FOUNDATION-FULL-STACK-BUILT.md)
- [Phase 107 Completion Audit](../memory/SESSION-140-DEEP-AUDIT-PROGRESS.md)
- [Canonical Schema](./atlas_canonical_schema.ts)
- [FeatureVectorGenerator](./sveltekit-frontend/src/lib/server/ace/features/feature-vector-generator.ts)
- [SomClusterer](./sveltekit-frontend/src/lib/server/ace/features/som-clustering.ts)
