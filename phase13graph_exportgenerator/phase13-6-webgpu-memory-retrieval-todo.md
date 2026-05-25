# TODO addendum — WebGPU PageRank, Local Memory, Engram State, and SvelteKit Bridge
## Phase 13.6 — WebGPU PageRank + Local Memory Retrieval UI
Goal: add a SvelteKit 2 / Svelte 5 UI layer that can visualize and query local graph memory without letting browser-side caches become the source of truth.
## Core Rule
```txt
Browser memory helps navigation.
Server memory remains truth.
## Architecture
```txt
user query
→ IndexedDB/Loki/Fuse local memory check
→ WebGPU/PageRank local graph hinting
→ fallback to server KB
→ Postgres/Qdrant retrieval
→ optional TurboVec/RTX rerank
→ Redis ACE/NES packet cache
→ Engram state machine
→ Bifrost/Gemma4 synthesis
→ recommendations + sourceRefs
## Storage Roles
```txt
IndexedDB = local browser cache for cards, traces, UI state
Loki.js = in-memory local card collection
Fuse.js = fuzzy local search
WebGPU = local graph/PageRank visualization + lightweight ranking
Postgres = durable source of truth
Qdrant = canonical semantic vector recall
Redis = hot ACE/NES cartridge cache
TurboVec = optional compressed rerank
RTX/cuVS = later acceleration lane
Engram = conversational/local memory bridge
```
## SvelteKit 2 / Svelte 5 UI Tasks
- [ ] Create `src/lib/components/atlas/GraphMemoryPanel.svelte`
  - [ ] Bits UI v2 tabs for:
    - Local Memory
    - Server KB
    - Graph Rank
    - ACE Packet
    - Recommendations
  - [ ] UnoCSS utility styling
  - [ ] Svelte 5 runes:
    - `$state` for query/results
    - `$derived` for filtered cards
    - `$effect` for SSE/WebGPU lifecycle only
- [ ] Create `src/lib/client/memory/local-memory.ts`
  - [ ] IndexedDB wrapper for local cards
  - [ ] Loki.js collection adapter
  - [ ] Fuse.js fuzzy search adapter
  - [ ] fallback when local cache is empty
- [ ] Create `src/lib/client/graph/webgpu-pagerank.ts`
  - [ ] load graph node/edge summaries only
  - [ ] compute lightweight PageRank or centrality hints
  - [ ] never load raw 30MB graph maps into UI state
  - [ ] fail closed to CPU/local summary sort if WebGPU unavailable
- [ ] Create `src/routes/api/retrieval/recommend/+server.ts`
  - [ ] accepts query + local hint IDs
  - [ ] calls server KB:
    - Postgres feature cards
    - Qdrant semantic hits
    - Redis ACE cache
    - Engram recent memory
  - [ ] returns compact recommendation cards
## Backend Retrieval Tasks
- [ ] Add `recommendation_cards` table or view
  - [ ] `id`
  - [ ] `query_hash`
  - [ ] `feature`
  - [ ] `source_refs`
  - [ ] `chunk_ids`
  - [ ] `score`
  - [ ] `reason`
  - [ ] `created_at`
- [ ] Add `engram_state_transitions` table or Redis stream
  - [ ] `from_state`
  - [ ] `to_state`
  - [ ] `intent`
  - [ ] `success`
  - [ ] `frequency`
  - [ ] `last_seen_at`
- [ ] Add retrieval flow:
  - [ ] local hint IDs from browser
  - [ ] Redis ACE cache check
  - [ ] Postgres exact/feature lookup
  - [ ] Qdrant semantic retrieval
  - [ ] TurboVec optional rerank
  - [ ] Engram memory boost
  - [ ] recommendation card synthesis
## Engram / ACE State Machine
- [ ] Define states:

```txt
query_received
local_memory_hit
local_memory_miss
server_kb_lookup
qdrant_hit
graph_expand
turbovec_rerank
ace_packet_build
gemma4_synthesis
recommendations_returned
degraded_answer
```
- [ ] Store transitions:

```json
{
  "from": "local_memory_miss",
  "to": "server_kb_lookup",
  "intent": "feature_mapping",
  "success": true,
  "frequency": 1
}
```
- [ ] Use transitions to recommend:
  - [ ] likely files
  - [ ] likely commands
  - [ ] missing feature cards
  - [ ] follow-up tests
## TurboVec / RTX Lane
- [ ] Start CPU TurboVec rerank first
- [ ] Add RTX/cuVS only later
- [ ] Feature flag:
```txt
ENABLE_TURBOVEC_RERANK=true
ENABLE_RTX_RERANK=false
ENABLE_WEBGPU_PAGERANK=true
- [ ] Fallbacks:
```txt
TurboVec offline → Qdrant order
RTX offline → CPU rerank
WebGPU unavailable → CPU PageRank or server ranking
Redis offline → no-cache packet
Qdrant offline → Postgres hybrid retrieval
## Prompt Engineering / ACE Packet Tasks

- [ ] Add prompt rule:
  - [ ] use local memory hints only as hints
  - [ ] verify against sourceRefs before final answer
  - [ ] never cite browser cache as source of truth
- [ ] Add ACE packet fields:
```ts
type AcePacket = {
  cartridgeId: string;
  queryHash: string;
  localHints: string[];
  serverSourceRefs: string[];
  rankedCards: unknown[];
  recommendations: unknown[];
  engramTransitions: unknown[];
  degraded: boolean;
};
```
## Validation
- [ ] Test with WebGPU disabled
- [ ] Test with Redis offline
- [ ] Test with Qdrant offline
- [ ] Test with TurboVec offline
- [ ] Verify recommendations still return degraded but useful output
- [ ] Verify Gemma4 receives compact packet only
## Do Not Do
- [ ] Do not make IndexedDB the truth layer
- [ ] Do not send raw graph JSON to Gemma4
- [ ] Do not require RTX/CUDA for correctness
- [ ] Do not let WebGPU mutate server state
- [ ] Do not bypass sourceRefs
