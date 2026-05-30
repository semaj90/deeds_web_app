# Phase 19B Integration: Card Lifecycle → ACE Context Assembler

**Status**: Integration design (ready for implementation)
**Date**: 2026-05-30
**Objective**: Wire Phase 19B memory lifecycle logic into the ACE context assembly pipeline so that:
1. Retrieval traces → outcome ledger → promotion states
2. Promotion states influence future retrieval ranking
3. Cards flow through lifecycle: created → used → rewarded → promoted → archived

---

## The Problem Phase 19B Solves

**Before Phase 19B:**
- ACE retrieves chunks based on vector similarity + KAG + static authority
- Every retrieved chunk is equal weight (no promotion history)
- Same chunk retrieved repeatedly = same score each time
- No feedback loop: retrieval decisions don't improve

**After Phase 19B:**
- Chunks that get *rewarded* are *promoted* to "warm/hot" states
- Hot chunks rank higher in future retrievals
- Cards that are never rewarded stay "fresh/engaged"
- True learning: better cards bubble up

---

## Architecture: Four Memory Tiers

```
┌─ TIER 1: Created ─────────────────────────────────────────┐
│                                                            │
│  New retrieval result (Qdrant hit, Neo4j neighbor)        │
│  promotionState: "fresh"                                  │
│  usageCount: 0, rewardCount: 0                            │
└────────────────────────────────────────────────────────────┘
                           ↓
┌─ TIER 2: Used (Engaged) ──────────────────────────────────┐
│                                                            │
│  Used in ACE context ≥3 times                             │
│  promotionState: "engaged"                                │
│  usageCount: 3-10, rewardCount: 0-2                       │
│                                                            │
│  ✅ Already tracked in chunk_hit_log (Langfuse)           │
└────────────────────────────────────────────────────────────┘
                           ↓
┌─ TIER 3: Rewarded (Warm) ─────────────────────────────────┐
│                                                            │
│  User clicked → Tool call succeeded → Citation used       │
│  Reward signal: +0.8-1.0                                  │
│  promotionState: "warm"                                   │
│  usageCount: 10-50, rewardCount: 5+                       │
│                                                            │
│  💡 Tracked in outcome-ledger.ndjson                      │
└────────────────────────────────────────────────────────────┘
                           ↓
┌─ TIER 4: Promoted (Hot) ──────────────────────────────────┐
│                                                            │
│  Reuse rate >80% (user came back to this chunk)           │
│  Multiple tools used it successfully                      │
│  promotionState: "hot"                                    │
│  usageCount: 50+, rewardCount: 40+                        │
│                                                            │
│  🚀 Gets 2-3× boost in next retrieval ranking             │
└────────────────────────────────────────────────────────────┘
                           ↓
┌─ TIER 5: Archived/Invalidated ────────────────────────────┐
│                                                            │
│  Unused for 30 days OR codebase changed                   │
│  Moved to cold storage (Postgres archive table)           │
└────────────────────────────────────────────────────────────┘
```

---

## Where Phase 19B Plugs Into context-assembler.ts

### Current Flow (lines ~200-300 approximate)

```typescript
// Stage A0: Query embedding + Qdrant vector search
const embedQuery = await embedText(query, 'embeddinggemma');
const qdrVectorHits = await hybridSearch(embedQuery, query, { limit: 20 });

// Stage A1: Record raw hits to chunk_hit_log (Langfuse telemetry)
await recordChunkHits(
  query,
  qdrVectorHits.map(hit => ({
    chunkId: hit.id,
    score: hit.score,
    sourceRef: hit.metadata.sourceRef
  }))
);

// Stage B: Neo4j graph expansion
const graphNeighbors = await getCaseGraphNeighborIds(caseId);
const graphExpanded = await authorityChainExpansion(graphNeighbors);

// Stage C: Reranking
const reranked = await rerankChunksGRPO(qdrVectorHits.concat(graphExpanded), query);

// Stage D: Build ACE context packet
const aceContext = buildACEContextPacket(reranked.slice(0, ACE_PACKET_TOKEN_CAP));
```

### With Phase 19B Integration

```typescript
// BEFORE vector search: Load card promotion states
const cardPromotionStates = await loadCardPromotionStates(query);
// Returns: Map<sourceRef, { state: 'fresh'|'engaged'|'warm'|'hot', boost: 0-3 }>

// Stage A0: Vector search (unchanged)
const qdrVectorHits = await hybridSearch(embedQuery, query, { limit: 20 });

// NEW: Boost hot cards in initial ranking
const withPromotionBoost = qdrVectorHits.map(hit => ({
  ...hit,
  promotionBoost: cardPromotionStates.get(hit.metadata.sourceRef)?.boost ?? 1.0,
  initialScore: hit.score,
  promotedScore: hit.score * (cardPromotionStates.get(hit.metadata.sourceRef)?.boost ?? 1.0)
}));

// Stage A1: Record hits (NOW with promotion state)
await recordChunkHits(
  query,
  withPromotionBoost.map(hit => ({
    chunkId: hit.id,
    score: hit.promotedScore,  // Use promoted score for analytics
    sourceRef: hit.metadata.sourceRef,
    promotionState: cardPromotionStates.get(hit.metadata.sourceRef)?.state,  // NEW
    promotionBoost: hit.promotionBoost  // NEW
  }))
);

// Stage B-D: Rest of pipeline (unchanged)
```

---

## Implementation Checkpoints

### Checkpoint 1: Load Card Promotion States from outcome-ledger
**File**: `src/lib/server/ace/card-promotion-loader.ts` (NEW)

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

interface CardPromotionState {
  state: 'fresh' | 'engaged' | 'warm' | 'hot' | 'archived';
  boost: number;  // 1.0, 1.5, 2.0, 3.0
  usageCount: number;
  rewardRate: number;
  lastUpdated: string;
}

export async function loadCardPromotionStates(query: string): Promise<Map<string, CardPromotionState>> {
  const ledgerPath = join(process.cwd(), 'memory/rewards/sourceRef-performance.json');
  
  try {
    const data = JSON.parse(readFileSync(ledgerPath, 'utf-8'));
    const states = new Map<string, CardPromotionState>();
    
    for (const [sourceRef, perf] of Object.entries(data)) {
      const state = (perf as any).promotionState;
      const boost = {
        'fresh': 1.0,
        'engaged': 1.2,
        'warm': 1.8,
        'hot': 3.0,
        'archived': 0.1
      }[state] ?? 1.0;
      
      states.set(sourceRef, {
        state,
        boost,
        usageCount: (perf as any).usageCount,
        rewardRate: (perf as any).rewardRate,
        lastUpdated: (perf as any).lastUpdated
      });
    }
    
    return states;
  } catch (err) {
    console.warn(`Failed to load card promotion states: ${err.message}`);
    return new Map();  // Fallback: no boosts
  }
}
```

### Checkpoint 2: Update recordChunkHits to Track Promotion State
**File**: `src/lib/server/analytics/search-analytics.ts` (MODIFY)

```typescript
export interface ChunkHit {
  chunkId: string;
  score: number;
  sourceRef: string;
  promotionState?: 'fresh' | 'engaged' | 'warm' | 'hot' | 'archived';  // NEW
  promotionBoost?: number;  // NEW
  tool?: string;
  result?: 'ok' | 'fail';
}

export async function recordChunkHits(query: string, hits: ChunkHit[]): Promise<void> {
  // Insert to chunk_hit_log with new columns (promotion_state, promotion_boost)
  // ... existing code ...
  
  // Also append to outcome-ledger if tool/result provided
  if (hits.some(h => h.tool)) {
    appendToOutcomeLedger({
      query,
      hits,
      graphVersion: process.env.GRAPH_VERSION ?? new Date().toISOString().split('T')[0]
    });
  }
}
```

### Checkpoint 3: Refresh Promotion States Periodically
**Script**: `scripts/atlas/refresh-promotion-states.mjs` (NEW)

```bash
# Run after outcome ledger gets new events
npm run phase19b:refresh-promotions

# Or scheduled via cron:
# 0 * * * * cd /repo && node scripts/atlas/phase-19b-card-lifecycle-dryrun.mjs
```

---

## End-to-End Flow: User Query → Promoted Result

```
User: "What is hearsay evidence?"
           ↓
Gemma4 → ACE Router
           ↓
Query → loadCardPromotionStates()
           ↓
["sveltekit-frontend/src/lib/server/cache/cache-config.ts"] → promotionState: "hot", boost: 3.0
           ↓
Qdrant vector search:
  Hit 1: score 0.85 (fresh, boost 1.0) → promoted score 0.85
  Hit 2: score 0.82 (hot, boost 3.0) → promoted score 2.46 ✅ RERANKED TO TOP
  Hit 3: score 0.79 (engaged, boost 1.2) → promoted score 0.95
           ↓
Reranked: [Hit 2, Hit 3, Hit 1]
           ↓
ACE context assembled with Hit 2 prioritized
           ↓
Gemma4 generates answer (better sourcing because promoted chunk ranked first)
           ↓
User: "Exactly what I needed" ✅
           ↓
outcome-ledger: { tool: "rag_search", sourceRef: "Hit 2", reward: 0.99, timestamp: ... }
           ↓
Next time this chunk is queried → promotionState advances: "hot" → stays "hot" (already at max)
           ↓
🔄 Loop: retrieval → reward → promotion → better ranking
```

---

## Success Criteria

- [ ] **Card promotion states load** from `memory/rewards/sourceRef-performance.json`
- [ ] **Promotion boost applied** to Qdrant hits before reranking (3.0× for hot, 1.8× for warm, etc.)
- [ ] **chunk_hit_log tracks promotion state** (new columns: promotion_state, promotion_boost)
- [ ] **outcome-ledger appended** when tool calls succeed with rewards
- [ ] **Periodic refresh** of promotion states (hourly or on-demand)
- [ ] **Langfuse traces** show promotion boost impact on final ranking
- [ ] **Metrics**: "hot" cards retrieve 3-5× more frequently than "fresh" (after 2-week burn-in)

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/server/ace/card-promotion-loader.ts` | CREATE | Load promotion states from outcome ledger |
| `src/lib/server/analytics/search-analytics.ts` | MODIFY | Add promotion_state + promotion_boost columns to ChunkHit |
| `scripts/atlas/refresh-promotion-states.mjs` | CREATE | Periodically rebuild promotion states from outcome ledger |
| `src/lib/server/ace/context-assembler.ts` | MODIFY | Call loadCardPromotionStates() + apply boost before reranking |
| `sveltekit-frontend/src/routes/api/ace/stream/+server.ts` | MODIFY | Pass promotion metadata to client for transparency |

---

## Why This Matters

1. **Closes the RL loop**: Retrieval → reward → promotion → better retrieval
2. **Emergent ranking**: No hardcoded heuristics, just learned from usage
3. **Feedback at inference time**: Hot cards get boosted *immediately* after promotion
4. **Scales learning**: As more events accumulate in outcome-ledger, more cards get promoted
5. **Audit trail**: Every boost is traced (Langfuse shows promotion_state + promotion_boost in search analytics)

---

## Atlas Maturity After Phase 19B Integration

| Component | Before | After |
|-----------|--------|-------|
| ACE Context Assembly | 92% | 95% (now with feedback) |
| Atlas Routing Matrix | 70% | 80% (promotion states feed routing) |
| Reward Attribution | 25% | 60% (outcome ledger → promotion states → ranking) |
| LoRA Training Readiness | 40% | 65% (outcome ledger + chunk_hit_log = training pairs) |
| **Overall Atlas Maturity** | **67%** | **80%** |

---

## Next Checkpoint After This

Once Phase 19B integration is live (2-3 days of testing):
1. Let the system run for 1-2 weeks, accumulate reward signals
2. **Phase 20**: Extract (sourceRef, outcome, promotion_state) triplets as LoRA training pairs
3. **Phase 21**: Fine-tune Gemma4-legal on those pairs (3-5 epochs on H100/A100)
4. Deploy fine-tuned model, measure improvement in downstream task accuracy

This is where the "learning" part of the system actually kicks in.
