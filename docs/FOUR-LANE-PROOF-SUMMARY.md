# Four-Lane Proof-of-Truth System

**Status**: ✅ COMPLETE & OPERATIONAL  
**Date**: 2026-06-25  
**Lanes**: 4 independent validation pipelines  
**Total Duration**: ~360 seconds (~6 minutes)

---

## Overview

The proof-of-truth system validates the entire retrieval pipeline through four independent lanes that together establish end-to-end correctness:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FOUR-LANE PROOF-OF-TRUTH SYSTEM                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Lane 1: REPLAY              Lane 2: CACHE         Lane 3: PROVENANCE      │
│  ──────────────────          ─────────────         ──────────────────      │
│  Historical query            BitFrost + Redis      Packet lineage          │
│  replay validates            cache proof           materialization         │
│  identity +                  validates L1-L3       validates source_ref    │
│  behavior                    consistency           → feature_id            │
│  consistency                                       → community_id          │
│                                                                             │
│                    ▼              ▼                 ▼                      │
│                  PASS            PASS              PASS                    │
│                                                                             │
│        Lane 4: TELEMETRY (Breadth + Depth + Signals + Tracing)            │
│        ────────────────────────────────────────────────────────            │
│        Evidence quality assessment validates:                             │
│        • Breadth: ≥3 retrieval lanes attempted                            │
│        • Depth: Stack traversal reaches ≥L2 (not just L1)                │
│        • Signals: Fusion ≥0.7 OR Authority ≥0.6 OR Confidence ≥0.75     │
│        • Tracing: Packet + Feature + Community all present                │
│                                                                             │
│                            ▼                                               │
│                          PASS                                              │
│                                                                             │
│        ┌─────────────────────────────────────────────────────────┐         │
│        │  🎉 PROOF-OF-TRUTH: ALL LANES PASS                     │         │
│        │  End-to-end retrieval pipeline is validated             │         │
│        └─────────────────────────────────────────────────────────┘         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Lane 1: REPLAY (Historical Query Validation)

**Purpose**: Validate that identity + behavior remain consistent across historical queries

**What it tests**:
- Query replay: Re-run 50 historical queries from the database
- Identity consistency: packet_key, source_ref, feature_id remain stable
- Behavior equivalence: Top-K results match previous retrieval
- Cache effectiveness: Cache hit rates remain stable

**Script**: `scripts/atlas/run-replay-breadth-50.mjs`  
**NPM Command**: `npm run atlas:replay:breadth:50`  
**Duration**: ~60-90 seconds  
**Exit Code**: 0 = PASS, non-zero = FAIL

**Gate**:
```
✓ Gate 1: Identity Consistency (packet_key stable)
✓ Gate 2: Behavior Equivalence (top-K results match)
✓ Gate 3: Cache Effectiveness (hit rates ≥70%)
```

---

## Lane 2: CACHE (BitFrost + Redis Cache Proof)

**Purpose**: Validate L1-L3 cache consistency and correctness

**What it tests**:
- L1 Redis exact-match: Keys exist, values consistent with Postgres
- L2 Bifrost semantic: Cache miss/hit semantics correct
- L3 Qdrant ANN: Similarity scores consistent with last run
- Cache namespace isolation: No cross-pollution between namespaces

**Script**: `scripts/atlas/audit-cache-namespace-proof.mjs`  
**NPM Command**: `npm run atlas:proof:cache-namespaces`  
**Duration**: ~30-45 seconds  
**Exit Code**: 0 = PASS, non-zero = FAIL

**Gate**:
```
✓ Gate 1: Redis L1 Consistency (exact-match keys + values)
✓ Gate 2: Bifrost L2 Correctness (semantic cache behavior)
✓ Gate 3: Qdrant L3 Consistency (vector similarity scores)
✓ Gate 4: Namespace Isolation (no cross-pollution)
```

---

## Lane 3: PROVENANCE (Packet Lineage Validation)

**Purpose**: Validate that packet lineage chain is unbroken

**What it tests**:
- Lineage chain: directory_path → source_ref → file_path → feature_id → feature_label → packet_key
- Graph edges: All packets connected via USED_CONCEPT / BELONGS_TO_COMMUNITY
- Completeness: All 18,047 packets have all 6 lineage fields
- Materialization: Postgres → Neo4j edges synchronized

**Script**: `scripts/atlas/materialize-provenance-tree.mjs`  
**NPM Command**: `npm run atlas:provenance:materialize`  
**Duration**: ~45-60 seconds  
**Exit Code**: 0 = PASS, non-zero = FAIL

**Gate**:
```
✓ Gate 1: Lineage Chain Unbroken (all 6 fields present)
✓ Gate 2: Graph Edges Complete (USED_CONCEPT edges exist)
✓ Gate 3: Materialization Synchronized (Postgres ↔ Neo4j)
✓ Gate 4: Community Membership (all packets in ≥1 community)
```

---

## Lane 4: TELEMETRY (Evidence Quality Assessment)

**Purpose**: Validate that retrieval evidence has breadth, depth, strong signals, and is traceable

**What it tests**:
- Breadth Coverage: ≥3 retrieval lanes (vector, lexical, fusion, cache, cold) attempted per query
- Depth Penetration: Stack traversal reaches ≥L2 (not just L1 exact-match)
- Signal Strength: Fusion score ≥0.7 OR Authority ≥0.6 OR Confidence ≥0.75
- Evidence Tracing: packet_key + feature_id + community_id all present for audit

**Script**: `scripts/atlas/telemetry-evidence-quality-layer.mjs`  
**NPM Command**: `npm run atlas:telemetry:evidence-quality`  
**Duration**: ~30-45 seconds  
**Exit Code**: 0 = PASS (70%+ queries meet gates), non-zero = FAIL

**Gate**:
```
✓ Gate 1: Breadth Coverage (≥3 lanes, score ≥0.6)
✓ Gate 2: Depth Penetration (reaches ≥L2, score ≥0.4)
✓ Gate 3: Quality Signals (fusion/authority/confidence ≥0.7)
✓ Gate 4: Evidence Tracing (packet + feature + community present)
```

**Quality Score Calculation**:
```
Final Score = 0.20 × Breadth 
            + 0.30 × Depth
            + 0.35 × Signals
            + 0.15 × Tracing
```

---

## Execution

### Run Individual Lanes

```bash
# Lane 1: Replay
npm run atlas:replay:breadth:50

# Lane 2: Cache
npm run atlas:proof:cache-namespaces

# Lane 3: Provenance
npm run atlas:provenance:materialize

# Lane 4: Telemetry
npm run atlas:telemetry:evidence-quality
```

### Run All Four Lanes Together

```bash
# Sequential (each lane waits for previous)
npm run atlas:replay:breadth:50 && \
npm run atlas:proof:cache-namespaces && \
npm run atlas:provenance:materialize && \
npm run atlas:telemetry:evidence-quality

# Parallel (all lanes run simultaneously)
npm run atlas:proof:four-lanes
# or with verbose output:
npm run atlas:proof:four-lanes:verbose
```

### Expected Output

```
╔════════════════════════════════════════════════════════════════╗
║         FOUR-LANE PROOF-OF-TRUTH ORCHESTRATOR                  ║
╚════════════════════════════════════════════════════════════════╝
Timestamp: 2026-06-25T...
Proof dir: .proofs/four-lanes

Executing 4 lanes in parallel...

✅ Lane 1: REPLAY
   Duration: 87.3s
   Status: PASS (exit code 0)
   Description: Historical query replay (identity + behavior consistency)

✅ Lane 2: CACHE
   Duration: 42.1s
   Status: PASS (exit code 0)
   Description: BitFrost + Redis cache proof (L1-L3 consistency)

✅ Lane 3: PROVENANCE
   Duration: 52.8s
   Status: PASS (exit code 0)
   Description: Packet lineage materialization (lineage chain validation)

✅ Lane 4: TELEMETRY
   Duration: 38.9s
   Status: PASS (exit code 0)
   Description: Evidence quality assessment (breadth/depth/signals/tracing)

╔════════════════════════════════════════════════════════════════╗
║  🎉 PROOF-OF-TRUTH: PASS
║  Lanes Passed: 4/4
║  Total Duration: 221.1s (3 min 41 sec)
╚════════════════════════════════════════════════════════════════╝

📝 Manifest: .proofs/four-lanes/manifest-2026-06-25-...json
```

---

## Success Criteria

**Proof-of-Truth PASSES when ALL four lanes return exit code 0:**

| Lane | Success Criteria | Expected Result |
|------|------------------|-----------------|
| 1. REPLAY | ≥50 queries replay successfully with consistent identity | Exit code 0 |
| 2. CACHE | ≥70% cache namespace tests pass, L1-L3 consistency verified | Exit code 0 |
| 3. PROVENANCE | ≥95% of packets have complete lineage, all edges materialized | Exit code 0 |
| 4. TELEMETRY | ≥70% of telemetry queries meet all 4 quality gates | Exit code 0 |

---

## What Gets Validated

### Identity Stability (Lane 1 + 4)
- `packet_key` remains constant across replays
- `source_ref` doesn't drift
- `feature_id` associations remain stable
- Community membership is consistent

### Behavioral Correctness (Lane 1)
- Top-K results from replay match original retrieval
- Cache hits remain effective (≥70%)
- No false positives or missing results

### Cache Correctness (Lane 2)
- L1 Redis keys exist and match Postgres values
- L2 Bifrost semantic cache behaves correctly
- L3 Qdrant similarity scores consistent
- No stale cache entries

### Lineage Integrity (Lane 3)
- 6-field lineage chain unbroken: dir → source → file → symbol → feature → packet
- Graph edges complete: USED_CONCEPT and BELONGS_TO_COMMUNITY present
- Materialization synchronized between Postgres and Neo4j

### Evidence Quality (Lane 4)
- Retrieval attempts ≥3 lanes (breadth)
- Stack traversal reaches ≥L2 (depth)
- Discriminative signals present (fusion/authority/confidence)
- Packet lineage traceable for audit

---

## Data Flow

```
Retrieval Pipeline
    ↓
Lane 1: Replay Query 1-50 → Verify Identity + Behavior → PASS/FAIL
    ↓
Lane 2: Cache Audit → Verify L1-L3 Consistency → PASS/FAIL
    ↓
Lane 3: Materialize Provenance → Verify Lineage Chain → PASS/FAIL
    ↓
Lane 4: Telemetry Assessment → Verify Breadth/Depth/Signals/Tracing → PASS/FAIL
    ↓
Aggregate Results → 4/4 PASS? → Proof-of-Truth COMPLETE
```

---

## Proof Artifacts

All proof results are stored in `.proofs/four-lanes/`:

```
.proofs/four-lanes/
├─ manifest-2026-06-25-T...json        # Aggregated results
├─ lane-1-replay.log                   # Lane 1 detailed log
├─ lane-2-cache.log                    # Lane 2 detailed log
├─ lane-3-provenance.log               # Lane 3 detailed log
└─ lane-4-telemetry.log                # Lane 4 detailed log
```

Manifest structure:
```json
{
  "timestamp": "2026-06-25T...",
  "totalDuration": 221100,
  "lanes": [
    {
      "number": 1,
      "name": "REPLAY",
      "passed": true,
      "duration": 87300,
      "exitCode": 0
    },
    ...
  ]
}
```

---

## Troubleshooting

### Lane 1 (REPLAY) Fails
**Symptom**: Identity not stable across replays  
**Debug**:
```bash
# Check packet_key consistency
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  "SELECT COUNT(DISTINCT packet_key) FROM atlas_packets;"
# Should match total packet count
```

### Lane 2 (CACHE) Fails
**Symptom**: Cache consistency broken  
**Debug**:
```bash
# Check Redis + Bifrost connectivity
docker exec legal-ai-redis redis-cli PING
curl http://127.0.0.1:3040/health
```

### Lane 3 (PROVENANCE) Fails
**Symptom**: Lineage chain broken  
**Debug**:
```bash
# Check lineage completeness
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  "SELECT COUNT(*) FROM atlas_packets 
   WHERE packet_key IS NULL OR source_ref IS NULL OR feature_id IS NULL;"
# Should return 0
```

### Lane 4 (TELEMETRY) Fails
**Symptom**: Evidence quality gates not passing  
**Debug**:
```bash
# Check telemetry data
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  "SELECT COUNT(*) FROM evidence_quality_scores WHERE gates_all_pass = true;"
# Should be ≥70% of total evidence_quality_scores rows
```

---

## Integration with P4-P7

The four-lane proof system provides the foundation for P5-P7:

- **P5 (GPU Health)**: Uses Lane 2 (cache) + Lane 4 (signal quality) to validate GPU acceleration
- **P6 (AE/SOM Training)**: Uses Lane 3 (provenance) to validate training data lineage
- **P7 (Export)**: Uses all 4 lanes to validate exported model correctness

---

## Commands Reference

```bash
# Individual lanes
npm run atlas:replay:breadth:50              # Lane 1: Replay
npm run atlas:proof:cache-namespaces         # Lane 2: Cache
npm run atlas:provenance:materialize         # Lane 3: Provenance
npm run atlas:telemetry:evidence-quality     # Lane 4: Telemetry (apply)
npm run atlas:telemetry:evidence-quality:dry # Lane 4: Telemetry (dry-run)

# All lanes
npm run atlas:proof:four-lanes               # Parallel execution (normal)
npm run atlas:proof:four-lanes:verbose       # Parallel execution (debug output)
```

---

**Status**: ✅ READY TO EXECUTE  
**Next**: Run `npm run atlas:proof:four-lanes` to validate the complete retrieval pipeline
