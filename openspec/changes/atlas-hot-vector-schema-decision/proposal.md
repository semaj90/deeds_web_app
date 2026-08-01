## Why

`atlas_hot_vectors_v1` is a Valkey hot-vector index whose provisioner
(`scripts/atlas/ensure-valkey-hot-vector-index.mjs`) was, until this
session, a complete stub: `--preflight` never connected to Valkey and
`--apply` printed "implementation deferred" and exited 0. Both were fixed
this session (real connect/authenticate/inspect, real `FT.CREATE` with
read-back verification, honest `blocked`/`ready_to_provision`/
`proven_existing`/`schema_drift`/`provisioned` classification — see
commits `fc88d74404` and `91030eeaac`) using only the minimal schema
that had any real documentation backing: `vector` (FLOAT32[768], COSINE)
+ `representation_id` (TAG, `embeddinggemma_300m_768_native_v1`).

While fixing the provisioner, a broader search (`rg` across `src/`,
`scripts/`, `docs/`, `memory/`, `next_steps/`, `openspec/`, `.opencode/`
for `atlas_hot_vectors_v1`, `atlas:hot-vector:`, and
`embeddinggemma_300m_768_native_v1`) found **zero real consumers** —
no writer populates this index, no reader queries it, and no design
doc specifies its full intended shape. The only place a richer schema
was ever proposed (`packet_id`/`symbol_id`, `workspace_revision`,
`source_revision`, `representation_revision`, `content_hash`,
`domain`/topic tags, `centroid_id`) was a hypothetical sketch in a
conversation, explicitly flagged there as "do not invent this schema
until the actual readers are traced" — advice this change proposal
follows.

The provisioner is now honest and safe to run, but the *index itself*
remains an infrastructure capability with no product behind it. Before
extending its schema, something needs to actually read or write
through it.

## What Changes

- Identify (or build) the first real consumer of `atlas_hot_vectors_v1`
  — most likely candidate per the existing architecture docs: ACE
  packet assembly's Qdrant-ANN-latency-bound retrieval path, since the
  provisioner's own contract note says this index exists to serve
  "measured retrieval latency ... vector caching is needed" /
  "high-frequency access to same vectors" / "ACE packet assembly
  throughput is bounded by Qdrant ANN latency."
- Only after a real consumer's access pattern is known, extend the
  Valkey hash schema (candidate fields per the earlier sketch:
  `packet_id`, `workspace_revision`, `source_revision`,
  `representation_id` (already present), `representation_revision`,
  `content_hash`, domain/topic tags, `centroid_id`) — trimmed to
  whatever that consumer actually needs, not the full speculative list.
- Define TTL/eviction policy once real write volume and staleness
  tolerance are known (currently undefined — the provisioner's schema
  has no TTL field).
- Wire the real writer and reader, with tests, once the schema is
  fixed.

## Capabilities

### New Capabilities
- `atlas-hot-vector-cache`: bounded, disposable, rebuildable Valkey
  vector cache for ACE hot-path retrieval — a working-set projection
  layered in front of Qdrant's full-corpus ANN, never itself the
  source of truth.

### Modified Capabilities
(none yet — no existing spec covers this index)

## Impact

- `scripts/atlas/ensure-valkey-hot-vector-index.mjs` — provisioner
  already fixed (this session); schema constants (`DIMENSIONS`,
  `DISTANCE_METRIC`, `VECTOR_FIELD`, `REPRESENTATION_ID`, `KEY_PREFIX`)
  will need extension once a real schema is decided.
- `sveltekit-frontend/scripts/atlas/smoke-atlas-hot-vectors.mjs` —
  smoke test asserts the current minimal contract; will need new gates
  for any added fields.
- Likely candidate consumer: `src/lib/server/ace/context-assembler.ts`
  or the retrieval orchestrator path that currently hits Qdrant ANN
  directly for hot-path packet lookups (not yet confirmed — this is
  exactly the tracing this change exists to do).
- No production data currently lives in this index — it is safe to
  design without a migration.
