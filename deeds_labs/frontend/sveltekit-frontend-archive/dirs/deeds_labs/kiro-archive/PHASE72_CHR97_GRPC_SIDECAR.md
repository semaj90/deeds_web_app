# Phase 72 + CHR97 Binary gRPC Sidecar

## Overview

Slot CHR97 (128-byte runes, SIMD/AVX2, GPU shaders) into Phase 72 as a **fast binary sidecar** that the agent can query without rebuilding context.

**Goal**: Agent makes decisions based on:
- ACA-72 summaries (what we've done)
- CHR97 heat map (where in the codebase are we)
- Citation rankings (saved vs search)
- Neo4j cluster metrics (error counts, patch success rates)

All without stuffing everything into the LLM prompt.

---

## 1. CHR97 gRPC Surface

### Proto Definition

```protobuf
syntax = "proto3";

package chr97;

// Request for a batch of runes
message RuneBatchRequest {
  string session_id = 1;         // "phase72:deeds-web-app:main"
  string view = 2;               // "ts-errors", "citations", "clusters"
  int32 limit = 3;               // max runes to return
  repeated string filters = 4;   // optional: ["cluster_7", "file_*.ts"]
}

// Tightly-packed rune batch (128 bytes per rune)
message RuneBatch {
  bytes data = 1;                // N * 128-byte runes
  int32 count = 2;               // number of runes
  string view = 3;               // which view this is
}

// Metadata about a rune (for debugging)
message RuneMetadata {
  uint32 id = 1;
  uint32 tile_index = 2;
  uint32 cluster_id = 3;
  string case_id = 4;            // "phase72:deeds-web-app:main"
  uint32 chunk_index = 5;
  float heat_u16_normalized = 6; // 0.0 - 1.0
  string tag = 7;                // "TS1005", "TS2322", etc.
}

service Chr97Runtime {
  // Get a batch of runes (binary)
  rpc GetRuneBatch(RuneBatchRequest) returns (RuneBatch);

  // Get metadata for a single rune (for debugging)
  rpc GetRuneMetadata(RuneBatchRequest) returns (RuneMetadata);

  // Compute similarity between query and runes (GPU-accelerated)
  rpc ComputeSimilarities(SimilarityRequest) returns (SimilarityResponse);
}

message SimilarityRequest {
  string session_id = 1;
  bytes query_emb16 = 2;         // 16 floats (64 bytes)
  int32 limit = 3;               // top-k results
}

message SimilarityResponse {
  repeated SimilarityResult results = 1;
}

message SimilarityResult {
  uint32 rune_id = 1;
  float similarity = 2;          // cosine similarity
  bytes rune_data = 3;           // 128-byte rune
}
```

### Go Implementation (Stub)

```go
package chr97

import (
    "context"
    "log"
)

type Chr97RuntimeServer struct {
    // Redis cache for runes
    // GPU context for similarity computation
}

func (s *Chr97RuntimeServer) GetRuneBatch(
    ctx context.Context,
    req *RuneBatchRequest,
) (*RuneBatch, error) {
    // 1. Fetch runes from Redis (or GPU memory)
    // 2. Pack into 128-byte format
    // 3. Return tightly-packed bytes

    log.Printf("GetRuneBatch: session=%s view=%s limit=%d",
        req.SessionId, req.View, req.Limit)

    // Stub: return empty batch
    return &RuneBatch{
        Data:  []byte{},
        Count: 0,
        View:  req.View,
    }, nil
}

func (s *Chr97RuntimeServer) ComputeSimilarities(
    ctx context.Context,
    req *SimilarityRequest,
) (*SimilarityResponse, error) {
    // 1. Decode query_emb16 (16 floats)
    // 2. Use GPU shader to compute cosine similarity
    // 3. Return top-k results

    log.Printf("ComputeSimilarities: session=%s limit=%d",
        req.SessionId, req.Limit)

    // Stub: return empty response
    return &SimilarityResponse{
        Results: []*SimilarityResult{},
    }, nil
}
```

---

## 2. Agent Query Pattern

### Before LLM Call

```python
# In Phase 72 agent driver

# 1. Get ACA-72 context (summaries + plan)
aca_ctx = aca72.ensure_summaries(session_id, goal)

# 2. Query CHR97 for hot clusters
chr97_client = Chr97RuntimeClient("localhost:50051")
rune_batch = chr97_client.GetRuneBatch(
    session_id=session_id,
    view="clusters",
    limit=10
)

# 3. Parse runes (128 bytes each)
hot_clusters = parse_runes(rune_batch.data)

# 4. Get top citations (saved vs search)
top_cits = aca72.get_top_citations(session_id, limit=5)

# 5. Build agent prompt with all signals
system, user = aca72.build_phase72_prompt(
    session_id=session_id,
    default_goal=goal,
    user_message=f"""
    Current hot clusters: {hot_clusters}
    Top citations: {top_cits}
    What should we fix next?
    """
)

# 6. Call LLM
response = granite.generate(system + "\n\n" + user)
```

### After LLM Call

```python
# 1. Parse action from response
action = parse_action(response)

# 2. Record to timeline
aca72.append_timeline(
    session_id,
    "agent-decision",
    {"action": action, "reasoning": response}
)

# 3. Check context overflow
aca72.maybe_compact_context(session_id, goal)

# 4. Return action to CLI
return {
    "action": action,
    "aca_marker": aca_ctx["latent_marker"],
    "hot_clusters": hot_clusters,
    "top_citations": top_cits
}
```

---

## 3. Citation Ranking (Inverse Ranking)

### Concept

- **Saved citations**: User explicitly approved (e.g., "this fix is good")
  - Stored in `phase72:saved_citations:{session_id}` (ZSET)
  - Boosted 3x when computing combined score

- **Search citations**: Transient results from searches
  - Stored in `phase72:search_citations:{session_id}` (ZSET)
  - Normal weight

### Usage

```python
# When user saves a citation (VS Code command)
aca72.add_saved_citation(
    session_id="phase72:deeds-web-app:main",
    citation_id="fix_ts1005_svelte_route",
    score=1.0
)

# When a search returns a citation
aca72.add_search_citation(
    session_id="phase72:deeds-web-app:main",
    citation_id="fix_ts2322_drizzle_schema",
    score=0.85
)

# Get top citations (saved boosted 3x)
top_cits = aca72.get_top_citations(
    session_id="phase72:deeds-web-app:main",
    limit=10,
    saved_boost=3.0
)
# Returns: [
#   ("fix_ts1005_svelte_route", 3.0),      # saved, boosted
#   ("fix_ts2322_drizzle_schema", 0.85),   # search
#   ...
# ]
```

### Agent Sees

```
Top citations (by combined score):
1. fix_ts1005_svelte_route (saved, score 3.0)
   → "We've successfully fixed TS1005 in svelte routes"
2. fix_ts2322_drizzle_schema (search, score 0.85)
   → "Drizzle schema TS2322 needs attention"

Decision: Focus on TS2322 next (unexplored cluster)
```

---

## 4. Glyphs → Shaders → Agent Context

### Flow

```
CHR97 Runes (128 bytes each)
  ├─ id, tile_index, cluster_id
  ├─ manifold_float32 (4D coordinates)
  ├─ heat_u16 (usage count)
  ├─ emb16 (16D embedding)
  └─ tag (error type: "TS1005", "TS2322", etc.)
        ↓
GPU Shader (Three.js / WebGPU)
  ├─ Render as glyphs (points in 3D space)
  ├─ Color by heat (cold → hot)
  ├─ Glow by similarity (search highlight)
  └─ Cluster by tile_index
        ↓
Agent Context
  ├─ "We've mostly worked on svelte routes (high heat)"
  ├─ "Drizzle schema still cold (low heat)"
  └─ "Next: focus on cold clusters"
```

### Implementation

```python
# In agent driver

# 1. Get CHR97 heat map
rune_batch = chr97_client.GetRuneBatch(
    session_id=session_id,
    view="heat",
    limit=1000
)

# 2. Parse runes
runes = parse_runes(rune_batch.data)

# 3. Compute cluster heat
cluster_heat = {}
for rune in runes:
    cluster_id = rune.cluster_id
    heat = rune.heat_u16 / 65535.0  # normalize
    cluster_heat[cluster_id] = cluster_heat.get(cluster_id, 0) + heat

# 4. Identify hot vs cold clusters
hot_clusters = sorted(
    cluster_heat.items(),
    key=lambda x: x[1],
    reverse=True
)[:5]

cold_clusters = sorted(
    cluster_heat.items(),
    key=lambda x: x[1]
)[:5]

# 5. Include in agent prompt
summary = f"""
Hot clusters (high usage):
{hot_clusters}

Cold clusters (unexplored):
{cold_clusters}

Recommendation: Focus on cold clusters for maximum impact.
"""
```

---

## 5. Multi-Cache "Storybook" View

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Authoritative Plot (ACA-72)                                 │
│ ├─ Redis plan + summaries + timeline                        │
│ └─ Single source of truth                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Projections / Views (Sampled)                               │
│ ├─ Loki.js / IndexedDB: browser-local logs                  │
│ ├─ RabbitMQ: real-time pipeline events                      │
│ ├─ WebGPU: CHR97 cartridge + visualization                  │
│ └─ XState v5: agent state machine                           │
└─────────────────────────────────────────────────────────────┘
```

### When Context is Tight

Instead of stuffing everything into the LLM prompt:

1. **Keep in prompt**: ACA-72 summaries + last 10 timeline events
2. **Sample from caches**:
   - Loki: fetch 3 most recent error logs
   - Redis: fetch cluster metrics (error count, patch success rate)
   - CHR97: fetch heat map snapshot (top 5 hot clusters)
   - RabbitMQ: fetch last pipeline event

3. **Combine into summary**:
   ```
   Recent progress:
   - Fixed TS1005 in svelte routes (3 patches applied)
   - Cluster 7 (Drizzle schema) still has 42 errors

   Hot areas:
   - svelte routes (heat: 0.8)
   - components (heat: 0.6)

   Cold areas:
   - database schema (heat: 0.1)
   - utils (heat: 0.05)

   Next: Focus on database schema (unexplored)
   ```

4. **Pass to LLM**: This summary + ACA marker

### XState v5 Machine

```typescript
// Phase 72 agent state machine

const phase72Machine = createMachine({
  id: 'phase72',
  initial: 'idle',
  states: {
    idle: {
      on: { START: 'ingest_errors' }
    },
    ingest_errors: {
      on: { DONE: 'cluster_errors' }
    },
    cluster_errors: {
      on: { DONE: 'generate_patches' }
    },
    generate_patches: {
      on: { DONE: 'apply_patches' }
    },
    apply_patches: {
      on: { DONE: 'verify' }
    },
    verify: {
      on: {
        SUCCESS: 'idle',
        FAILURE: 'generate_patches'
      }
    }
  }
});

// Agent reads state from XState + ACA-72
// Both frontend + backend can observe the same state
```

---

## 6. Concrete Next Steps

### Immediate (Today)

1. ✅ Create `phase72_agent_context.py` (ACA-72)
2. ✅ Create `phase72_agent_api.py` (endpoints)
3. ✅ Mount in `main.py`
4. Test with CLI:
   ```bash
   curl -X POST http://localhost:8000/api/phase72/next_step \
     -H "Content-Type: application/json" \
     -d '{
       "session_id": "phase72:deeds-web-app:main",
       "message": "what should I fix next?",
       "spec_files": [".kiro/specs/phase72-neo4j-ast-reducer.md"]
     }'
   ```

### Short Term (This Week)

1. Build CHR97 gRPC server (Go / C++)
2. Wire CHR97 client into agent driver
3. Add citation ranking (saved vs search)
4. Test end-to-end: agent → CHR97 → decision

### Medium Term (This Month)

1. Add XState v5 machine for state management
2. Wire Loki / IndexedDB for browser-local logs
3. Add RabbitMQ event streaming
4. Implement multi-cache sampling

### Long Term (Ongoing)

1. Optimize CHR97 gRPC latency
2. Add GPU shader rendering for glyphs
3. Implement context overflow handling with multi-cache
4. Monitor agent decision quality

---

## 7. Files to Create

### Backend
- ✅ `backend/services/phase72_agent_context.py` (ACA-72)
- ✅ `backend/api/phase72_agent_api.py` (endpoints)
- `backend/services/chr97_grpc_client.py` (gRPC client)
- `backend/services/chr97_runtime_server.go` (gRPC server)

### Frontend
- `sveltekit-frontend/src/lib/phase72/xstate-machine.ts` (XState v5)
- `sveltekit-frontend/src/lib/phase72/chr97-client.ts` (gRPC client)
- `sveltekit-frontend/src/lib/phase72/multi-cache-view.svelte` (UI)

### CLI
- `tools/yo-rha-agent.mjs` (update to use Phase 72 endpoints)

---

## 8. References

- **ACA-72 Implementation**: `backend/services/phase72_agent_context.py`
- **Phase 72 API**: `backend/api/phase72_agent_api.py`
- **CHR97 Runtime**: `chr97-runtime/` (existing)
- **ACA Design**: `.kiro/AGENTIC_CONTEXT_ANCHOR.md`
- **Phase 72 Spec**: `.kiro/specs/phase72-neo4j-ast-reducer.md`

---

## Summary

Phase 72 + CHR97 + ACA-72 gives you:

✅ **Contextual awareness**: Plan + summaries + timeline
✅ **Fast binary queries**: CHR97 gRPC for heat maps + citations
✅ **Inverse ranking**: Saved vs search citations
✅ **Multi-cache sampling**: Only fetch what you need
✅ **Agentic decisions**: Based on all signals, not just LLM

**Status**: Ready to implement. Start with the CLI test above.
