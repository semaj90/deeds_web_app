# Karpathy KB ↔ NES/CHR97 Cartridge Wiring — Design Doc

**Status**: design-only, not implemented. Ship in a future session after operator review.
**Created**: 2026-05-09
**Scope**: connect the Karpathy GPU authority blend (`gpu:karpathy:scores`) to the CHR97 cartridge format (`src/lib/server/cartridge/chr97-builder.ts`) so notecards become addressable as cartridge runes, fetched into ACE Stage A0, and cached as `llm_synthesis` payloads.

---

## Goal in one sentence

Take a notecard (`graph_file_cards.jsonl` row) → pack it into a CHR97 RuneBlock with its 768-d embedding → make it addressable by Karpathy blend rank → let ACE Stage A0 pull the top-K cartridge slice in O(1) instead of round-tripping Qdrant.

## Current state of the parts (verified 2026-05-09)

| Layer | File | What it does today | Wired to Karpathy? |
|---|---|---|---|
| Notecards | `scripts/kb/build-embedding-jobs.mjs` | Emits `embedding_jobs.jsonl` with `text`, `text_hash`, `rank`, `rank_score` | Reads `rank.json` only — no Karpathy blend |
| CHR97 binary | `src/lib/server/cartridge/chr97-builder.ts` | Packs `RuneData` → 4096B header + 36B runes + FP16 tensor bank + CSR graph + metadata | No |
| Cartridge API | `/api/cartridge/{export,search,stats,invalidate}` | LokiJS+IndexedDB tensor cache, Fuse.js search | No |
| Karpathy scores | Redis `gpu:karpathy:scores` (24h TTL) | Per-file `{pr, attn, authority, blend}` | Standalone — not consumed by cartridge yet |
| ACE Stage A0 | `src/lib/server/ace/context-assembler.ts:352` | Topo-byte prefilter → Redis cache hit (300s) → Qdrant fallback | Reads topo cache, not cartridge |
| llm_synthesis cache | Bifrost L2 + Redis L1 | Caches LLM completions by content hash | Independent of retrieval |

**The four pieces exist; nothing currently joins them.**

---

## The materialization-time question (the load-bearing decision)

**When does the cartridge get built?**

### Option A — Build at summary write time (eager)

```
N9b consumer writes embedding to Qdrant
  ↓
SAME pass: pack RuneBlock into in-memory cartridge buffer
  ↓
Every N writes (e.g., 256 cards): flush cartridge to Redis + MinIO
```

**Pros**:
- Cartridge always reflects current notecard state — no rebuild lag.
- ACE Stage A0 always finds a fresh cartridge.
- Operator can `cat` a cartridge file at any time and audit what the agent saw.

**Cons**:
- Couples N9b consumer to cartridge format (currently independent layers).
- Karpathy blend changes (24h refresh) → cartridge ordering goes stale until next N9b run.
- Multiple writers → cartridge slot contention (need locks or per-writer slabs).

### Option B — Build at retrieval time (lazy)

```
ACE Stage A0 receives query
  ↓
Cache miss on cartridge slot for {query_topo, kb_snapshot_hash, karpathy_rev}
  ↓
Fetch top-K notecards from Qdrant + Karpathy scores from Redis
  ↓
Pack into ephemeral cartridge → cache by composite key
  ↓
Return slice to context assembler
```

**Pros**:
- Decouples N9b from cartridge — N9b stays simple.
- Cartridge ordering always reflects current Karpathy blend.
- Cache key includes `karpathy_rev` so blend updates invalidate cleanly.

**Cons**:
- First request after Karpathy refresh pays the pack cost (~50–200ms for 256 runes).
- Cold cache → no offline cartridge files for audit.
- Doesn't materialize the "single binary cartridge per topology cluster" mental model.

### Option C — Hybrid (recommended)

```
Eager pack on N9b write → "cold cartridge" written to MinIO/disk per topo class
                         (canonical record, audit-friendly)
Lazy reorder on retrieval → "warm cartridge" in Redis with karpathy_rev key
                         (pulls cold cartridge, reorders by current blend, caches)
```

**Why this wins**:
- Cold cartridge is the deterministic, auditable artifact (matches Phase 0B + preset emit hash discipline).
- Warm cartridge handles blend rotation without rebuilding the whole pack.
- Cache key on the warm side: `cartridge:warm:{topo_class}:{kb_snapshot_hash}:{karpathy_rev}` — three-axis invalidation, explicit.

---

## Cache-key contract (must be explicit before any code)

```
# Cold (canonical, write-once per content hash)
cartridge:cold:{topo_class}:{kb_snapshot_hash}
  → MinIO bucket cartridges-codebase/cold/{topo_class}/{kb_snapshot_hash}.chr97
  → Redis pointer:  STRING, value = MinIO URL, TTL = 7 days

# Warm (reordered by current Karpathy blend, in-Redis only)
cartridge:warm:{topo_class}:{kb_snapshot_hash}:{karpathy_rev}
  → Redis BYTES, TTL = 24h (matches gpu:karpathy:scores TTL)
  → Refreshed on Karpathy run

# Karpathy version stamp
gpu:karpathy:rev
  → INCR on every karpathy:gpu run; warm cache uses this as invalidation axis
```

**Three keys, three jobs**:
- Cold cartridge survives Redis restarts (lives in MinIO).
- Warm cartridge dies with the Karpathy rev (cheap to rebuild from cold).
- Rev counter is the single source of truth for "did Karpathy change?"

---

## ACE Stage A0 hookup

`fetchACPKnowledgeResults()` in `context-assembler.ts:334` currently does:

```
1. Compute query topo class
2. Check ace:topo:{class}:{queryHash} (300s TTL)  ← Stage A0 cache
3. On miss: Qdrant ANN with topo_class filter
4. Score + return
```

**Proposed insertion**:

```
1. Compute query topo class + current karpathy_rev
2. Check ace:topo:{class}:{queryHash}              ← unchanged
3. On miss: try cartridge:warm:{topo_class}:{kb_snapshot_hash}:{karpathy_rev}
4. On warm miss: pull cold cartridge → reorder by Karpathy blend → write warm
5. On cold miss: Qdrant ANN (current path) → trigger background eager-pack
6. Score + return
```

**Why insert at Stage A0**:
- Cartridge IS a topo-class-aligned slice. The natural fit.
- 300s `ace:topo` cache wraps the whole thing — cartridge resolution only fires on Stage A0 cache miss.
- Existing Stage A0 metrics (`TopoPrefilterStats`) already flow to `ACEContext.retrievalTrace.topoPrefilter` — extend with `cartridge: 'warm' | 'cold' | 'miss'` field.

---

## llm_synthesis cache integration

The Bifrost L2 cache currently keys on `(model, messages, temperature, maxTokens)` content hash. To wire cartridge state into `llm_synthesis`:

```
bifrost:kb:llm_synthesis:v1:{kb_snapshot_hash}:{karpathy_rev}:{semantic_query_hash}
                            └── ensures cartridge reorder invalidates synthesis cache
```

**Without `karpathy_rev` in the key**: Karpathy refreshes invalidate retrieval but the LLM still serves stale synthesis. With it: any blend change forces a fresh synthesis, even if the prompt text is byte-identical.

Tradeoff: **more cache misses** when Karpathy refreshes nightly. Mitigation: only include `karpathy_rev` for queries flagged `mode=fresh` or where the top-K cartridge slice actually changed. This is a v2 optimization; v1 should always include the rev.

---

## What stays the same

- N9b consumer (`run-embedding-jobs.mjs`) keeps writing to Qdrant + pgvector. Cartridge build is a downstream subscriber, not a replacement.
- `gpu:karpathy:scores` Redis hash schema unchanged.
- ACE Stage A0 short-circuit on cache hit unchanged (`ace:topo:{class}:{queryHash}`).
- CHR97 binary format unchanged.
- Notecard schema unchanged.

## What needs new code (effort estimate)

| Task | File | Effort |
|---|---|---|
| Add `gpu:karpathy:rev` INCR to `karpathy-gpu-enrich.mjs` | `scripts/karpathy-gpu-enrich.mjs` | XS |
| Cold cartridge writer subscriber (RabbitMQ `cartridge.pack` queue) | `src/workers/cartridge-pack-worker.ts` (new) | M |
| Warm cartridge resolver | `src/lib/server/cartridge/warm-resolver.ts` (new) | S |
| ACE Stage A0 hook | `src/lib/server/ace/context-assembler.ts` (~30 line addition) | S |
| Bifrost cache key extension | `src/lib/server/cache/redis-exact-match.ts` (add `karpathy_rev` to key) | XS |
| Cartridge stats endpoint extension | `src/routes/api/cartridge/stats/+server.ts` | XS |
| Smoke test: pack-warm-resolve round-trip | `scripts/smoke-cartridge-wiring.mjs` (new) | S |

**Total**: ~1 working day if done sequentially with tests. **Do not start without operator nod** — the materialization-time question is reversible but expensive to flip later.

---

## Hard rules

1. **Never bypass Qdrant on the cold path.** Cartridges accelerate retrieval; they don't replace the source of truth. If a cartridge resolve fails, fall through to Qdrant transparently.
2. **Cold cartridges are byte-deterministic.** Same `topo_class` + same `kb_snapshot_hash` → same `.chr97` bytes. Test with `sha256sum` gate, same discipline as Phase 0B + preset emit + notecard hash.
3. **Warm cartridges live in Redis only.** No disk writes. They're cheap to rebuild from cold.
4. **`karpathy_rev` is monotonic.** Never reset. Old warm cache entries die naturally via TTL.
5. **No agent-facing tool reads cartridges directly.** Cartridges are an internal cache layer for ACE; agents see the M-cards / L-cards that come out of Stage A0. CHR97 binary stays inside `src/lib/server/cartridge/`.
6. **Cartridge build is async via RabbitMQ.** Never block N9b on pack — it's a write-amplification path.

## Open questions for operator

1. **One cartridge per topo class, or one per cluster?** Topo class is coarser (~16 classes); cluster is finer (~50–100 per repo). Topo per default; cluster as future optimization.
2. **MinIO bucket naming** — `cartridges-codebase` vs `cartridges/codebase/cold/`? Match existing `evidence/` convention.
3. **Should the warm cartridge include the L-cards** (LLM synthesis surface) or just S/M-cards? L-cards are bigger; tradeoff is round-trips vs cartridge size.
4. **Eviction policy** when MinIO bucket fills: LRU by last-fetched-at, or oldest-first by `kb_snapshot_hash` revision? LRU matches request patterns; revision-based matches the "fresh corpus" mental model.
5. **What happens to a notecard that drops out of top-K when Karpathy refreshes?** Stays in cold cartridge, demoted in warm cartridge. Agreed?

## Cross-references

- CLAUDE.md §"Karpathy GPU Authority Blend + Redis ACE Cache" — current state of Karpathy lane
- CLAUDE.md §"Redis L1 + Bifrost L2 Cache System" — existing 3-tier cache architecture
- CLAUDE.md §"FastMCP Agentic Tools (9)" — `glyph_metadata` tool already exists, may surface cartridge stats
- `src/lib/server/cartridge/AGENTS.md` — cartridge module conventions
- `src/lib/server/ace/AGENTS.md` — ACE pipeline conventions
- `memory/reconstruction/NEXT-SESSION-TODO.md` §"KB Notecard Optimization Lane" — N9a/N9b shipped state
- `memory/reconstruction/NEXT-SESSION-TODO.md` §"Karpathy GPU + Gemma4 KV-cache lane" — token-savings architecture this plugs into

## Decision needed before implementation

**Pick A, B, or C** (or reject and propose D). Without a decision on materialization timing, every other piece is unstable. My recommendation: **C (hybrid)** because it preserves auditability AND reactivity to Karpathy blend changes, but it's the most code. Operator may prefer B (lazy) for speed of first ship.
