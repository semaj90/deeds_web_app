# ACE storage/runtime alignment — 2026-08-22

## Frozen diagnosis

`LIVE_DATABASE_UNDER_MIGRATED != MISSING_SCHEMA_DESIGN`

The canonical schema owners already exist:

- `sveltekit-frontend/drizzle/manual/20260516_storage_tier_routing.sql` owns the storage-tier fields on `codebase_chunk_index`: `centroid_id uuid REFERENCES centroid_registry(id)`, `compressed_embedding vector(64)`, `reconstruction_error real`, and `routing_tier varchar(10)`.
- `sveltekit-frontend/drizzle/manual/20260606_route_packet_tables.sql` owns `route_runtime_packets.raw`, `packet_version`, `source_ref_quality`, and the broader route-packet provenance surface.

The August-22 repair ALTER files duplicated those canonical owners and are removed on this branch. This branch does not introduce a new database migration.

## Drizzle mirror repair

`src/lib/server/db/schema/search-analytics.ts` now mirrors the canonical storage-tier migration:

- `compressedEmbedding: vector('compressed_embedding', { dimensions: 64 })`
- `reconstructionError: real('reconstruction_error')`
- `centroidId: uuid('centroid_id')`
- `routingTier: varchar('routing_tier', { length: 10 }).default('cold')`

`gpuCluster` remains an integer clustering/routing label. `centroid_id` remains the UUID identity of the durable `centroid_registry` artifact. They are not interchangeable.

## Valkey centroid contract

The new `atlas.centroid-cache-envelope.v1` applies to `taxonomy:clusters:gpu:*` only.

It freezes:

- `clusterId`
- `vector[768]`
- `dimension = 768`
- `representationId = semantic_768`
- `sourceCollection = codebase_chunks_768`
- `representationRevision | null`
- `producerRevision | null`
- `topoClass | null`
- `topoByte | null`
- `lineageQualified`

Legacy GPU-centroid records remain readable in both historical forms:

- `number[768]`
- `{ vector:number[768], topoClass?, topoByte? }`

Legacy values normalize with null revisions and `lineageQualified=false`; no lineage is fabricated.

New GPU-cluster writes use the versioned envelope. SOM centroid keys intentionally remain on their separate existing array contract in this tranche.

## Valkey ownership

`redis.ts` is a compatibility facade over the shared Valkey client. `src/lib/server/cache/valkey-client.ts` remains the single ioredis configuration owner.

Terminology:

- **Valkey**: actual cache service / connection owner.
- **Redis API**: compatibility naming and wire/API surface.

## Runtime behavior

`centroid-cache.ts` now:

- normalizes versioned and legacy GPU centroid records on read;
- writes versioned envelopes for direct writes, Qdrant centroid builds, and Postgres warm-up;
- skips an individually malformed cached centroid rather than collapsing the entire nearest-cluster lane;
- normalizes old/new records before Postgres persistence;
- does not invent representation or producer revisions when the producing path does not supply them.

## Proof state

- Canonical storage-tier migration: **REPO_CONFIRMED**
- Canonical route-packet migration: **REPO_CONFIRMED**
- Duplicate August repair migrations: **REMOVED_ON_BRANCH**
- `centroid_id` Drizzle UUID mirror: **IMPLEMENTED_UNPROVEN**
- `compressed_embedding(64)` Drizzle mirror: **IMPLEMENTED_UNPROVEN**
- `routing_tier` Drizzle mirror: **IMPLEMENTED_UNPROVEN**
- Centroid envelope V1: **IMPLEMENTED_UNPROVEN**
- Legacy centroid normalization: **IMPLEMENTED_UNPROVEN**
- Versioned Valkey read-through/write: **IMPLEMENTED_UNPROVEN**
- Centroid contract tests: **WRITTEN_UNRUN**
- ACE optional-lane degraded receipt/fallback: **OPEN**
- Real ACE chat replay after migration repair: **NOT RUN IN THIS BRANCH**

## Next gates

Run from repository root:

```text
node scripts/atlas/audit-ace-storage-runtime-alignment.mjs
```

Then from `sveltekit-frontend`:

```text
npx vitest run \
  src/lib/server/retrieval/centroid-cache-contract-v1.spec.ts \
  src/lib/server/atlas/retrieval/semantic-storage-boundary-v1.spec.ts
```

After those pass, run the bounded real ACE chat probe. Only if an optional retrieval/cache lane still produces an unchecked `undefined`/collection failure should the exact return boundary be patched to a typed degraded receipt or empty bounded contribution. Authoritative identity/exact-promotion failures remain fail-closed.

## Non-goals

- No new Postgres schema design.
- No new migration replacing the May/June owners.
- No destructive Valkey rewrite.
- No semantic representation rename from `semantic_768`.
- No promotion of Valkey centroids to canonical semantic identity.
