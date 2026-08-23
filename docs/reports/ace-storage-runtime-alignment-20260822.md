# ACE storage/runtime alignment — 2026-08-22

Scope: Parent Atlas/ACE relational-vector storage, Qdrant projection ownership, Valkey centroid caching, and the live schema-drift failures observed during the bounded `/api/v1/chat/completions` workstation probe.

This report distinguishes repository authority from workstation observations. It does not authorize or perform database, Qdrant, Neo4j, or Valkey mutation.

## Corrected interpretation of the live ACE failures

The workstation observed two real failures before the model call:

1. `codebase_chunk_index.reconstruction_error` / centroid routing columns were absent from the live Postgres table while the ACE retrieval path selected them.
2. `route_runtime_packets.raw`, `packet_version`, and `source_ref_quality` were absent while the telemetry path attempted to insert them.

Repository audit shows these columns were **already designed and owned by canonical migrations**:

- `sveltekit-frontend/drizzle/manual/20260516_storage_tier_routing.sql`
  - `codebase_chunk_index.centroid_id uuid REFERENCES centroid_registry(id)`
  - `compressed_embedding vector(64)`
  - `reconstruction_error real`
  - `routing_tier varchar(10)`
- `sveltekit-frontend/drizzle/manual/20260606_route_packet_tables.sql`
  - `raw jsonb`
  - `packet_version integer`
  - `source_ref_quality numeric`
  - other route-packet provenance fields and indexes

Therefore the primary diagnosis is:

```text
LIVE_DATABASE_UNDER_MIGRATED
!=
MISSING_SCHEMA_DESIGN
```

Do not add new duplicate `ALTER TABLE` migration files for those same columns. The correct gate is migration/readback parity between the canonical migration history, Drizzle schema, and the target database.

## Real repository schema drift still open

`search-analytics.ts` already declares `reconstructionError`, but it currently declares:

```ts
centroidId: integer('centroid_id')
```

while the canonical storage-tier migration declares:

```sql
centroid_id uuid REFERENCES centroid_registry(id)
```

Those are different concepts from `gpuCluster` / `gpu_cluster_centroids.cluster_id`, which are numeric cluster indices.

Freeze the distinction:

```text
gpu_cluster / gpuCluster
  integer routing/topology cluster label

centroid_registry.id
  UUID durable centroid artifact identity

codebase_chunk_index.centroid_id
  UUID FK -> centroid_registry.id
```

The Drizzle mirror must be changed to UUID only after its consumers are checked for assumptions that `centroidId` is numeric. The new read-only audit fails closed until this is reconciled.

The same Drizzle table currently omits the migration-owned `compressed_embedding vector(64)` and `routing_tier` columns. Those are also reported as mirror gaps rather than silently inferred from the migration.

## Redis vs Valkey ownership

The shipping compatibility module is named `redis.ts`, but its connection owner is Valkey:

```text
redis.ts compatibility API
        -> getValkeyClient()
        -> cache/valkey-client.ts
        -> legal-ai-valkey :6379
```

`valkey-client.ts` explicitly describes itself as the single source of truth for ioredis configuration. Parent Atlas should use the vocabulary:

```text
Valkey = cache/runtime owner
Redis = protocol/client compatibility name
```

not two independent cache authorities.

## Centroid-cache payload drift

`centroid-cache.ts` currently has multiple historical shapes under the same key family:

```text
taxonomy:clusters:gpu:<clusterId>

shape A:
  number[768]

shape B:
  {
    vector: number[768],
    topoClass,
    topoByte
  }
```

Different functions read/write different assumptions. That is a real cache-contract defect even if Valkey itself is healthy.

Added on the active branch:

```text
sveltekit-frontend/src/lib/server/retrieval/
  centroid-cache-contract-v1.ts
  centroid-cache-contract-v1.spec.ts
```

The new envelope is:

```text
atlas.centroid-cache-envelope.v1

clusterId
vector[768]
dimension = 768
representationId = semantic_768
sourceCollection = codebase_chunks_768
representationRevision | null
producerRevision | null
topoClass | null
topoByte | null
lineageQualified
```

Legacy array/object payloads are accepted for read-through but **no missing revision is fabricated**. A legacy payload normalizes to `lineageQualified=false`.

This is intentional because the current centroid pipeline is still a native/historical 768-d routing topology lane. It must not be relabeled as the canonical persisted/search `semantic_512` representation merely because both are semantic-derived artifacts.

## pgvector execution options

Current pgvector supports the options discussed in the workstation audit:

- unconstrained `vector` columns can hold different dimensions, but indexed subsets must use a fixed dimension/cast and normally a partial/expression index;
- `subvector(...)` can be expression-indexed and candidates reranked with the full vector;
- `halfvec` can reduce ANN index memory;
- `binary_quantize(...)` + bit HNSW can nominate candidates that are reranked using the original vector;
- HNSW iterative scans can recover candidates under post-index filtering.

Parent Atlas should use these as **executor/index artifacts**, not representation identity shortcuts.

Recommended ownership:

```text
MODEL-NATIVE MATRIX
semantic_768 FP32
  immutable source representation / exact-oracle source where admitted

PERSISTED SEARCH REPRESENTATION
semantic_512
  explicit MRL projection + renormalization + revision lineage

OPTIONAL EXECUTOR ARTIFACTS
subvector_128/256/512 index
halfvec HNSW index
binary-quantized HNSW index
Qdrant HNSW/quantized projection
CAGRA graph ANN
TurboVec compressed index

all -> CandidateOrdinal
all identityAuthority = false
all independentFusionVote = false
```

For an unconstrained mixed-dimension pgvector table, require at minimum:

```text
representation_id
representation_revision
producer_revision
dimension
source_content/revision binding
```

and make each ANN index representation-qualified. `model_id` alone is not enough to establish Parent Atlas representation lineage.

## ACE failure containment

Even after the live database is aligned, ACE retrieval remains required to degrade safely when an optional retrieval/cache subsystem fails.

Required behavior:

```text
Postgres/Qdrant/Valkey/graph optional lane failure
        -> typed degraded receipt
        -> empty/bounded lane contribution
        -> synthesis may continue if minimum evidence gate is satisfied

NOT
optional lane throws
        -> undefined collection
        -> buildACEPrompt .length crash
        -> HTTP 500
```

This does not mean source-truth or exact-promotion failures should be hidden. Hard authority gates still fail closed. The distinction is between optional lane degradation and authority violation.

## New executable audit

Added:

```text
scripts/atlas/audit-ace-storage-runtime-alignment.mjs
```

It is read-only and checks:

- canonical migration ownership of `reconstruction_error`, UUID `centroid_id`, compressed 64-d vector, routing tier;
- canonical route packet migration ownership of `raw`, `packet_version`, `source_ref_quality`;
- Drizzle mirror parity;
- Valkey single-owner wiring behind the Redis-compatible API;
- centroid cache representation contract presence;
- whether versioned centroid read/write wiring has actually been integrated.

Expected current gaps before the next patch:

```text
CODEBASE_INDEX_CENTROID_ID_DRIZZLE_TYPE_MISMATCH
CODEBASE_INDEX_COMPRESSED_EMBEDDING_MIRROR_MISSING
CODEBASE_INDEX_ROUTING_TIER_MIRROR_MISSING
CENTROID_CACHE_VERSIONED_READ_THROUGH_NOT_WIRED
CENTROID_CACHE_VERSIONED_WRITE_NOT_WIRED
```

## Proof state

```text
CANONICAL STORAGE-TIER MIGRATION OWNER
REPO_CONFIRMED

CANONICAL ROUTE-PACKET MIGRATION OWNER
REPO_CONFIRMED

LIVE DB MISSING COLUMNS
WORKSTATION OBSERVED / USER REPORTS REPAIRED

DUPLICATE NEW MIGRATION REQUIRED
NO

ROUTE_RUNTIME_PACKETS DRIZZLE MIRROR
REPO_PRESENT

CODEBASE reconstruction_error DRIZZLE MIRROR
REPO_PRESENT

CODEBASE centroid_id UUID DRIZZLE MIRROR
MISMATCH / OPEN

CODEBASE compressed_embedding(64) DRIZZLE MIRROR
MISSING / OPEN

CODEBASE routing_tier DRIZZLE MIRROR
MISSING / OPEN

VALKEY SINGLE CACHE OWNER
REPO_CONFIRMED

CENTROID CACHE VERSIONED ENVELOPE
IMPLEMENTED_UNPROVEN

LEGACY CENTROID READ-THROUGH CONTRACT
IMPLEMENTED_UNPROVEN

CENTROID CACHE LIVE WIRING
NOT YET INTEGRATED

CENTROID CACHE TESTS
WRITTEN_UNRUN

ACE GRACEFUL OPTIONAL-LANE DEGRADATION
AUDIT REQUIRED
```

## Workstation checks

```powershell
cd C:\Users\james\Videos\deeds-web-app
node scripts/atlas/audit-ace-storage-runtime-alignment.mjs
```

Then:

```powershell
cd sveltekit-frontend
npx vitest run `
  src/lib/server/retrieval/centroid-cache-contract-v1.spec.ts `
  src/lib/server/atlas/retrieval/semantic-storage-boundary-v1.spec.ts
```

After the Drizzle UUID/mirror patch and centroid-cache wiring, rerun the bounded real `/api/v1/chat/completions` probe and require:

```text
HTTP response body present
no missing-column error
no undefined/.length crash
route_runtime_packets telemetry write accepted or explicitly degraded
Valkey centroid read either versioned or legacy-normalized
no canonical identity sourced from centroid/Qdrant executor IDs
```
