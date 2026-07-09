# Session 124 Game-Engine Runtime Cache Audit

Generated: 2026-07-09

## Contract

The app should behave like an old rendering engine:

```text
offline compile
-> compact runtime assets
-> visibility/cache lookup
-> stream only needed packets
-> compose final answer
```

Atlas mapping:

| Rendering concept | Atlas / HyperRAG equivalent | Current state |
|---|---|---|
| scene graph | Neo4j packet/tree graph | wired, graph sync still needs bridge coverage |
| spatial acceleration | Qdrant HNSW / TurboVec ANN | wired, Qdrant point bridge still partial |
| visibility cache | Redis / BitFrost centroid cache | wired server-side |
| display list | ACE / HyperRAG packet envelope | proven on bounded slices |
| asset compiler | packet materializer | proven on bounded slices |
| mip / LOD | summary/title/feature/community/SOM packet levels | partially wired |
| GPU local pass | WebGPU similarity / worker caches | present, not yet production-bound |
| frame composer | Gemma4 synthesis | gated by packet validation |
| render telemetry | packet-centric telemetry / retrieval telemetry | present, needs runtime promotion loop |

## Findings

1. **Server-side cache cascade exists.**
   `sveltekit-frontend/src/lib/server/cache/atlas-cache-cascade.ts` already models L1 Redis, L2 BitFrost, L3 Qdrant, version keys, payload filters, and Qdrant named-vector search.

2. **Redis centroid cache exists and is close to the visibility-cache lane.**
   `sveltekit-frontend/src/lib/server/retrieval/centroid-cache.ts` supports cached GPU/SOM centroids, simdjson parsing, CUDA batch cosine when available, and CPU fallback.

3. **Packet-centric telemetry exists.**
   `sveltekit-frontend/src/lib/server/telemetry/packet-centric-telemetry.ts` normalizes packet identity, feature id, SOM cell, schema version, embedding version, tool version, GPU kernel version, and RPC transport.

4. **Client IndexedDB cache exists.**
   `sveltekit-frontend/src/lib/cache/indexdb-cache.svelte.ts` is a real browser-side TTL cache and can serve as the IndexedDB packet/LOD cache substrate.

5. **WebGPU similarity exists.**
   `sveltekit-frontend/src/lib/webgpu/webgpu-similarity-service.ts` provides GPU/CPU top-k similarity over quantized embeddings.

6. **Service worker currently has placeholder distributed-cache clients.**
   `sveltekit-frontend/src/service-worker.ts` has the desired control shape, but Redis/SOM methods are dummy loggers. It also creates POST cache keys using `Date.now()`, which prevents stable query-result reuse.

## Main Gap

The backend has real cache/retrieval/materializer lanes, but the browser service-worker lane is not yet connected to the real packet/LOD/cache contracts.

The production gap is not "add more ML." It is:

```text
validated packet envelope
-> server cache cascade
-> packet telemetry
-> browser IndexedDB / CacheStorage
-> optional WebGPU local rerank
-> deterministic cache promotion
```

## Required Gates

| Gate | Required proof |
|---|---|
| service-worker no dummy clients | no `Dummy redis` / `Dummy som` paths in production build |
| stable POST cache key | request body hash instead of timestamp |
| packet telemetry on retrieval | packet_context written for retrieval attempts |
| LOD cache manifest | IndexedDB entries keyed by packet/domain/SOM/community |
| WebGPU local rerank | deterministic fixture proving CPU/WebGPU top-k parity |
| hot/warm/cold promotion | winners promoted to Redis/IndexedDB, losers logged to telemetry/archive |
| synthesis gate | Gemma4 synthesis only after packet validation threshold |

## Next Execution Cards

1. Replace service-worker dummy Redis/SOM clients with HTTP endpoints that read server-side cache/centroid state.
2. Replace service-worker POST timestamp cache keys with stable request body hashes.
3. Add a `packet_lod_manifest` JSON shape for browser cache entries:
   `packet_key`, `source_ref`, `feature_id`, `domain_class`, `som_cell`, `community_id`, `qdrant_point_id`, `summary_hash`, `msgpack_ref`.
4. Add an IndexedDB packet LOD cache wrapper over the existing `indexdb-cache.svelte.ts`.
5. Wire retrieval telemetry so each cache promotion records attempt id, packet key, lane, latency, hit/miss, and action state.
6. Add a smoke test for service-worker cache key determinism.
7. Add a WebGPU top-k parity smoke using a small fixed embedding fixture.
8. Keep Gemma4 synthesis behind the HMM tool-router packet-validation rule.

## Priority

Do first:

```text
stable cache keys
-> no dummy service-worker clients
-> packet LOD manifest
-> telemetry promotion ledger
```

Do later:

```text
pixel/glyph encoding
browser SharedArrayBuffer packet slabs
WebGPU topology visualization
client-side SOM navigation
```

