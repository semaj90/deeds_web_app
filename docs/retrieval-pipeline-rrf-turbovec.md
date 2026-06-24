# Retrieval Pipeline: RRF + TurboVec (Stage A1-A2)

## Visual Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Query: "How do I set up a trust?"                                          │
│  Query embedding: [0.12, -0.45, 0.67, ..., 0.33] (768 dimensions)           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│  STAGE A1: Parallel Retrieval (Multi-Source)                                 │
│                                                                               │
│  Lane 1: Qdrant ANN (semantic vector search, 768-dim)                        │
│    └─ Returns: [chunk1(0.95), chunk2(0.88), chunk3(0.72), ...]              │
│    └─ Time: ~50ms                                                            │
│                                                                               │
│  Lane 2: Postgres FTS (lexical text search)                                  │
│    └─ Returns: [chunk2(0.7), chunk4(0.6), ...]                              │
│    └─ Time: ~30ms                                                            │
│                                                                               │
│  Parallel execution (both at same time)                                      │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│  STAGE A2a: RRF Fusion (Combine both lanes) ← CURRENT STATE                  │
│                                                                               │
│  Reciprocal Rank Fusion algorithm:                                           │
│    - Rank results from each source separately (highest score first)           │
│    - Apply RRF formula per source: w_src * 1/(k + rank + 1)                  │
│    - Combine scores: score = sum(RRF values from all sources)                │
│    - Re-rank by combined score                                               │
│                                                                               │
│  Input:                                                                       │
│    Qdrant: [chunk1(0.95), chunk2(0.88), chunk3(0.72), ...]                   │
│    Postgres: [chunk2(0.7), chunk4(0.6), ...]                                 │
│                                                                               │
│  Calculation (weights: qdrant=0.8, postgres=0.2):                            │
│    chunk1: 0.8 * (1/(60+0+1)) = 0.62  (Qdrant rank 0)                       │
│    chunk2: 0.8 * (1/(60+1+1)) + 0.2 * (1/(60+0+1)) = 0.65  (both!)          │
│    chunk3: 0.8 * (1/(60+2+1)) = 0.34  (Qdrant rank 2)                       │
│    chunk4: 0.2 * (1/(60+1+1)) = 0.08  (Postgres rank 1)                     │
│                                                                               │
│  Output (RRF-fused order):                                                   │
│    [chunk2(0.65), chunk1(0.62), chunk3(0.34), chunk4(0.08)]                  │
│                                                                               │
│  Time: ~1ms (local calculation)                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ↓
                         ┌──────────────────┐
                         │ NEW IN SESSION 74 │
                         │  (OPTIONAL GATE) │
                         └──────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│  STAGE A2b: TurboVec Reranking (Optional, non-blocking) ← PROPOSED           │
│                                                                               │
│  Only if: ENV.TURBOVEC_SIDECAR_GRPC_ENABLED = true                           │
│  Only if: TURBOVEC_SIDECAR reachable at 127.0.0.1:50062 (gRPC)              │
│                                                                               │
│  TurboVec ANN Search (2-bit quantized index):                                │
│    - Query: same embedding [0.12, -0.45, 0.67, ..., 0.33]                   │
│    - Index contains: trained 2-bit quantized vectors (768→2 bits each)      │
│    - Returns: cosine similarity scores for same chunks                       │
│                                                                               │
│  Input (RRF-fused):                                                          │
│    [chunk2(0.65), chunk1(0.62), chunk3(0.34), chunk4(0.08)]                  │
│                                                                               │
│  TurboVec scores:                                                            │
│    chunk1: 0.94  (direct "trust setup" match, high similarity)              │
│    chunk2: 0.81  (related but less direct)                                   │
│    chunk3: 0.76  (tangentially related)                                      │
│    chunk4: 0.72  (weak match)                                                │
│                                                                               │
│  Reranking: Sort by TurboVec score (highest first)                           │
│  Output (TurboVec-reranked):                                                 │
│    [chunk1(0.94), chunk2(0.81), chunk3(0.76), chunk4(0.72)]                  │
│                                                                               │
│  Time: ~12ms (gRPC + ANN computation)                                        │
│                                                                               │
│  Fallback:                                                                    │
│    If TurboVec unavailable (timeout/offline/error):                          │
│      → Return RRF order unchanged: [chunk2, chunk1, chunk3, chunk4]          │
│      → No error, no 500, system continues                                    │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│  FINAL OUTPUT (Return top-K packets)                                         │
│                                                                               │
│  Without TurboVec (RRF only):                                                │
│    [chunk2, chunk1, chunk3, chunk4]  ← RRF order                             │
│                                                                               │
│  With TurboVec enabled:                                                      │
│    [chunk1, chunk2, chunk3, chunk4]  ← TurboVec-reranked (better!)           │
│                                                                               │
│  Difference: chunk1 moved to top (where it belongs semantically)             │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│  LLM Generation (uses top packets as context)                                │
│                                                                               │
│  Prompt:                                                                      │
│    "Answer: How do I set up a trust?"                                        │
│    Context from chunk1: "Trusts are created by..."                           │
│    Context from chunk2: "Estate planning involves..."                        │
│    ...                                                                        │
│                                                                               │
│  Output: "To set up a trust, you need to..."                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Latency Breakdown

| Stage | Current | With TurboVec | Note |
|-------|---------|---------------|------|
| Qdrant ANN | 50ms | 50ms | No change |
| Postgres FTS | 30ms | 30ms | No change |
| RRF Fusion | 1ms | 1ms | No change |
| TurboVec Rerank | — | 12ms | NEW (optional) |
| **Total** | **~60ms** | **~72ms** | **+12ms = +20% latency** |

**But**: TurboVec may reduce false positives, leading to better LLM response → potentially faster overall throughput.

---

## Score Evolution Through Pipeline

```
Query: "How do I set up a trust?"

┌─────────────────────────────────────────────────────────────────┐
│ Initial: Qdrant (768-dim semantic)                              │
│  chunk1: 0.95  ← Best semantic match "trust setup"             │
│  chunk2: 0.88  ← Related "estate planning"                      │
│  chunk3: 0.72  ← Tangential "power of attorney"                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Plus: Postgres (lexical FTS)                                    │
│  chunk2: 0.70  ← High because contains "trust" AND "setup"      │
│  chunk4: 0.60  ← Weaker match "revocable trust"                │
│  (Postgres doesn't match chunk1 well → low score)               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ After RRF (blend semantic + lexical fairly)                     │
│  chunk2: 0.65  ← Boosted by both sources                        │
│  chunk1: 0.62  ← High semantic but no lexical match             │
│  chunk3: 0.34  ← Only semantic, mid-tier                        │
│  chunk4: 0.08  ← Only lexical, weak                             │
│                                                                  │
│  Problem: chunk2 ahead of chunk1, but chunk1 is semantically    │
│           more relevant to the query                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ After TurboVec Rerank (learned 2-bit ANN)                       │
│  chunk1: 0.94  ← Reranked to top (correct!)                    │
│  chunk2: 0.81  ← Drops slightly (less relevant)                │
│  chunk3: 0.76  ← Stays similar                                  │
│  chunk4: 0.72  ← Stays low                                      │
│                                                                  │
│  Benefit: chunk1 is now first, matching semantic intent         │
│           LLM gets better context                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## When RRF Gets It Wrong (TurboVec Fixes It)

### Example Query: "How do I sue someone?"

**Qdrant (semantic):**
```
chunk1: "litigation procedures" (0.91)  ← Best semantic match
chunk2: "contract dispute resolution" (0.85)
```

**Postgres (lexical):**
```
chunk2: "contract dispute resolution" (0.8)  ← High because mentions "dispute"
chunk3: "settlement agreements" (0.6)
```

**RRF Fusion (blends them):**
```
chunk2: 0.65  ← Boosted by both sources!
chunk1: 0.62  ← Lower because only Qdrant matched
```

**Problem**: chunk2 ranked higher, but chunk1 is more semantically relevant.

**TurboVec Reranking:**
```
chunk1: 0.93  ← Reranked to top (correct!)
chunk2: 0.78
```

**Outcome**: LLM gets chunk1 first → better answer about litigation vs contracts.

---

## Configuration & Control

```bash
# In .env or environment variables:

# Enable/disable TurboVec reranking
TURBOVEC_SIDECAR_GRPC_ENABLED=false   # Default: disabled
# TURBOVEC_SIDECAR_GRPC_ENABLED=true  # Enable for testing

# Where TurboVec listens (gRPC)
TURBOVEC_SIDECAR_GRPC_URL=127.0.0.1:50062

# If gRPC is unavailable, fallback to HTTP JSON-RPC (optional)
TURBOVEC_SIDECAR_JSONRPC_URL=http://127.0.0.1:8792
```

**At runtime**:
```typescript
// In context-assembler.ts
const { reranked, applied } = await applyTurboVecRerank(fused, emb, payloadMap);

if (!applied) {
  // TurboVec unavailable → use RRF order
  console.log('[ACE] TurboVec reranking skipped, using RRF order');
}
```

---

## Decision: RRF vs TurboVec vs Both?

| Scenario | Action |
|----------|--------|
| **Just RRF** (current state) | Works fine. Blends sources fairly. |
| **RRF + TurboVec enabled** | Refines order using learned similarity. |
| **Just TurboVec** (hypothetical) | Bad idea. No source blending. |
| **Neither** | Bad idea. No retrieval. |

**Best**: Keep RRF (always), add TurboVec (optional refinement).

---

## Summary

**RRF** = "How do I fairly combine Qdrant + Postgres?"  
**TurboVec** = "Given combined results, which order is best semantically?"

- RRF happens first (stage A2a)
- TurboVec reranks RRF output (stage A2b)
- If TurboVec unavailable, RRF order is returned (graceful fallback)
- Both working together = best retrieval quality

**Ship both. Measure which helps most. Keep both.**
