# gRPC Binary Memory Registry Master Todo

**Status**: Canonical execution todo
**Scope**: Queue/dequeue binary packets for DAG hits, open-memory routing, and packet reuse
**Owner**: Parent Atlas / Phase 8 packet plumbing

## Objective

Wire a binary packet path that lets the system:

1. validate the canonical packet envelope
2. serialize it to protobuf or another binary transport
3. land the bytes in a temporary registry keyed by `packet_key`
4. hydrate the canonical envelope back on read
5. feed DAG-assisted Gemma4, BitFrost, TurboVec, and Neo4j without re-parsing JSON in the hot path

## Canonical Rules

- Postgres remains canonical truth.
- `packet_id` is the UUID row identity.
- `packet_key` is the cross-system join key.
- `packet_ulid` is optional ordering lineage.
- `title_id` and `feature_id` are grouping keys only.
- Do not key cache identity on raw generated text.
- Do not let the binary registry become a source of truth.

## Current Evidence

Already wired:

- canonical packet envelope schema exists
- `latent_64` bytea already exists on `atlas_packets`
- gRPC/protobuf transport surfaces already exist
- Neo4j GDS / PageRank / Louvain lanes already exist
- BitFrost hot cache lanes already exist
- packet-key dedup audit already exists
- HyperRAG materialization now best-effort warms the binary registry lane for DAG-hit reuse

Still missing:

- ingress route that writes binary payloads after validation
- read route that hydrates binary packets before fan-out

Live wiring gap:

- `packet-rpc` ingress is still JSON-first, so the binary lane is not yet the live edge
- the codec surface exists, but it is not yet the default live edge round trip
- binary registry warmup is now connected to materialization, but ingress/egress still needs promotion

## Docs Audit

Before implementation or promotion, validate this work against the canonical docs:

- `docs/architecture/phase8-query-optimization-taxonomy.md`
- `docs/architecture/CANONICAL-PACKET-WIRING-BLUEPRINT.md`
- `docs/architecture/grpc-binary-memory-registry-plan.md`
- `sveltekit-frontend/src/lib/server/db/packet-topology-envelope.ts`
- `sveltekit-frontend/src/lib/server/db/schema/packet-binary-registry.ts`

Audit questions:

- Does every lane keep `packet_key` as the cross-system join key?
- Does the binary registry remain a transient landing zone, not canonical truth?
- Does the transport edge still avoid raw-generated-text identity?
- Does the open-lane router hydrate from the binary registry before fan-out?
- Do the docs agree on `Postgres -> mirror/cache/transport` ordering?
- Are the official helpers the only contract surface used by the lane?

Official helpers to prefer:

- `validatePacketEnvelope`
- `coerceToPacketEnvelope`
- `validatePacketBatch`
- `validateAcpRpcPackets`
- `encodePacketToMsgpack`
- `decodePacketFromMsgpack`

## Master Todo

### 0. Audit docs and lock the contract

- compare the plan against the phase-8 taxonomy and wiring blueprint
- reconcile any mismatch between the docs and live schema barrels
- keep the doc audit as a promotion gate before transport work

### 1. Define the binary registry contract

- add a dedicated temporary registry for binary packet payloads
- key it on `packet_key`
- store `packet_id`, `packet_ulid`, `title_id`, `feature_id`, `source_ref`
- include `transport_type`, `payload_format`, `payload_hash`, `ttl_seconds`
- keep the blob mutable only by overwrite, not append
- migrate the live DAG-hit helper from `dag_hit_envelope_cache` to the canonical binary registry contract

### 2. Implement real binary encode/decode

- prefer protobuf for typed transport
- keep MsgPack only as an optional compatibility layer
- make decode deterministic and lossless for required fields
- wire the codec through the official envelope validators, not ad hoc parsing
- promote the binary route from helper use to live ingress / egress use

### 3. Wire queue/dequeue containers

- queue container validates and serializes canonical packets
- dequeue container hydrates the packet from the binary registry
- both must preserve `packet_key`
- both must reject missing canonical identity fields
- queue/dequeue must use the canonical packet envelope helpers above
- queue/dequeue must become the live edge before the legacy JSON ingress path

### 4. Add a canonical materializer

- materialize packet rows from canonical envelope + topology fields
- preserve `title_id`, `feature_id`, `community_id`, `som_row`, `som_col`
- attach `latent_64` only as derived state

### 5. Add open-lane routing facade

- route by `packet_key`, `title_id`, `feature_id`, `community_id`
- resolve the next hop into Postgres, BitFrost, Qdrant, Neo4j, or TurboVec
- keep raw generated text out of routing identity

### 6. Keep DAG-assisted Gemma4 downstream

- Gemma4 receives assembled packets, not identity state
- summaries stay as derived semantic labels
- DAG hits should reuse the binary registry and BitFrost cache

## Required File Targets

- `sveltekit-frontend/src/lib/server/db/packet-topology-envelope.ts`
- `sveltekit-frontend/src/lib/server/serialization/packet-msgpack-codec.ts`
- `sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts`
- `sveltekit-frontend/src/lib/server/db/schema/atlas-packets.ts`
- `sveltekit-frontend/src/lib/server/db/schema/memory-registry.ts`
- `sveltekit-frontend/src/lib/server/db/schema/atlas-memory-address-registry.ts`
- `sveltekit-frontend/src/lib/server/grpc/*`
- `scripts/atlas/phase8-deduplication-gate.mjs`

## Acceptance Gates

### Gate 0: Docs alignment

- phase-8 taxonomy agrees with the binary registry plan
- canonical wiring blueprint agrees with the lane separation
- live schema files match the documented identity contract

### Gate A: Canonical envelope

- envelope validates
- required IDs present
- topology fields preserved

### Gate B: Binary round trip

- encode envelope
- store binary payload
- decode payload
- recover same canonical identity
- prove the round trip uses the official codec and validator helpers
- prove the live route uses the binary registry, not just the helper

### Gate C: Queue/dequeue behavior

- queue writes a binary packet record
- dequeue hydrates it without JSON reparse
- idempotent overwrite works by `packet_key`
- live edge route does not bypass the canonical helpers
- legacy DAG-hit cache helper is either replaced or documented as compatibility-only

### Gate D: DAG hit reuse

- temporary packet reuse works for open-memory routing
- BitFrost keys remain canonical
- Postgres remains truth

## Execution Order

1. Add or confirm the temporary binary registry table.
2. Replace the codec scaffold with a real binary encoder/decoder.
3. Wire queue/dequeue containers around the canonical envelope.
4. Hydrate the open-lane routing facade from the binary registry.
5. Prove DAG-hit reuse and BitFrost warmup on canonical keys.

## Non-Goals

- No new canonical store.
- No raw-text cache keys.
- No identity rewrite in Neo4j, Qdrant, TurboVec, or Redis.
- No mixing transport payloads with truth rows.

## Practical Definition of Done

This todo is complete when:

- the binary registry exists
- queue/dequeue is wired
- the codec is real
- the open-lane router consumes the registry
- DAG-assisted Gemma4 can reuse packets without reparsing JSON
