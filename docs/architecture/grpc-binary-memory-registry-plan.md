# Canonical gRPC Binary Memory Registry Plan

**Status**: Draft canonical plan
**Scope**: Temporary binary serialization for DAG hits, packet reuse, and hot-memory hydration
**Goal**: Keep Postgres canonical while adding a binary landing path for gRPC/protobuf packet envelopes

## Why This Exists

The repo already has:

- a canonical packet envelope schema
- packet identity fields (`packet_id`, `packet_ulid`, `packet_key`)
- gRPC and protobuf surfaces
- Redis/BitFrost cache lanes
- Neo4j graph projection lanes
- latent and topology storage lanes

What is still missing is a **real binary landing zone** for temporary DAG-hit packets:

- gRPC/protobuf output can be produced
- canonical envelope validation exists
- but the result does not yet land in a dedicated binary memory registry
- current metadata registries are not enough for fast reuse of temporary packet state

## Canonical Identity Contract

Use these fields consistently:

```text
packet_id   = Postgres row identity
packet_key  = cross-system semantic identity
packet_ulid = optional sortable workflow/event id
title_id    = semantic grouping key
feature_id  = canonical feature grouping key
```

Rules:

- Postgres remains the source of truth.
- Do not key cache identity on raw generated text.
- Do not use `title_id` or `feature_id` as primary keys.
- Do not let TurboVec, Redis, or Neo4j define identity.
- Use `packet_key` for joins across mirrors and accelerators.

## Current State

### Already wired

- Canonical packet envelope Zod schema exists.
- `latent_64` exists as `bytea` on the canonical packet table.
- Packet topology and page-rank fields already exist in Postgres projections.
- gRPC/protobuf surfaces already exist for transport and vector lanes.
- Neo4j GDS PageRank/Louvain lanes already exist.
- Dedup and packet-key audits already exist.

### Still missing

- a real binary codec in the packet transport layer
- a temporary binary registry table or sidecar blob store
- a live route that persists gRPC/protobuf packet payloads into that binary store
- a read path that hydrates the canonical envelope back from the binary store

## Recommended Binary Store

Use a **dedicated temporary sidecar table** keyed by `packet_key`.

Recommended shape:

```text
packet_binary_registry
  - packet_key (primary or unique)
  - packet_id
  - packet_ulid
  - source_ref
  - title_id
  - feature_id
  - transport_type
  - payload_format
  - binary_payload bytea
  - payload_hash
  - ttl_seconds
  - created_at
  - updated_at
```

Why this shape:

- isolates transient binary state from canonical packet rows
- keeps blob cleanup simple
- allows DAG-hit reuse without mutating the source table
- avoids overloading the memory registries with transport blobs

## Canonical Flow

### 1. Ingress

```
gRPC / protobuf request
  -> decode packet envelope fields
  -> validate canonical Zod schema
  -> require packet_key, packet_id, source_ref, feature_id
```

### 2. Canonicalize

```
canonical envelope
  -> normalize title_id / feature_id
  -> preserve packet_id
  -> preserve packet_key
  -> derive packet_ulid only if absent and schema allows it
```

### 3. Serialize

```
canonical envelope
  -> protobuf bytes for transport or blob storage
  -> optional MsgPack only as a compatibility fallback
```

### 4. Persist Temporary Binary State

```
protobuf bytes
  -> packet_binary_registry.binary_payload
  -> keyed by packet_key
  -> TTL-based cleanup
```

### 5. Hydrate on Read

```
packet_key
  -> lookup packet_binary_registry
  -> decode bytes
  -> hydrate canonical envelope
  -> fallback to Postgres if blob missing
```

### 6. Fan-Out and DAG Hits

```
canonical envelope
  -> ACE packet assembly
  -> BitFrost hot cache
  -> Neo4j graph enrichment
  -> TurboVec / Qdrant ranking
  -> DAG hit reuse
```

## What Not To Do

- Do not parse JSON inside TurboVec.
- Do not key binary state on generated summary text.
- Do not turn memory registries into canonical truth stores.
- Do not treat vector mirrors as identity stores.
- Do not mix runtime transport payloads with canonical packet rows.

## Existing Files To Align

- `sveltekit-frontend/src/lib/server/db/packet-topology-envelope.ts`
- `sveltekit-frontend/src/lib/server/serialization/packet-msgpack-codec.ts`
- `sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts`
- `sveltekit-frontend/src/lib/server/db/schema/atlas-packets.ts`
- `sveltekit-frontend/src/lib/server/db/schema/memory-registry.ts`
- `sveltekit-frontend/src/lib/server/db/schema/atlas-memory-address-registry.ts`
- `sveltekit-frontend/src/lib/server/grpc/*`
- `scripts/atlas/phase8-deduplication-gate.mjs`

## Implementation Phases

### Phase 1: Binary codec

- replace scaffolded JSON fallback with a real protobuf encoder/decoder path
- keep MsgPack optional only if a valid dependency is promoted into the workspace
- expose encode/decode helpers for the canonical packet envelope

### Phase 2: Temporary registry table

- add `packet_binary_registry`
- store `binary_payload bytea`
- add `packet_key` uniqueness
- add TTL and cleanup metadata

### Phase 3: Ingress bridge

- adapt the live route to accept typed packet envelopes
- write the binary payload after canonical validation
- keep Postgres write first, then binary mirror

### Phase 4: Read bridge

- hydrate packet envelopes from the binary registry
- fallback to Postgres if the blob is missing
- keep reads deterministic and replayable

### Phase 5: DAG-hit reuse

- consume binary packets for temporary open-memory routing
- key hot buckets on `packet_key`, `title_id`, `feature_id`, and `community_id`
- keep raw generated text out of cache identity

## Promotion Gates

Promote the bridge only when all are true:

- canonical envelope validation passes
- protobuf round-trip is lossless for required fields
- packet binary rows can be written and read back by `packet_key`
- Postgres still owns identity
- BitFrost cache keys remain canonical
- DAG-hit reuse works without JSON parsing in the hot path

## Practical Verdict

This architecture is **partially wired** already.

The missing piece is not the graph or the cache.
The missing piece is the **binary registry landing path**:

```
gRPC/protobuf
  -> canonical envelope
  -> binary payload
  -> temporary registry
  -> hydrate back into envelope
```

That is the right next step for temporary DAG hits and open-memory routing.
