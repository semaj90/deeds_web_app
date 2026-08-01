## Context

Postgres is the canonical packet/revision authority. Qdrant owns the
full-corpus semantic retrieval index (`codebase_chunks_768`, 768-dim
embeddinggemma). Valkey/Bifrost is documented repo-wide as a cache and
routing layer only — never a source of truth (see root `CLAUDE.md`
"Canonical Lineage Contract" and "Atlas Data Persistence + Retrieval
Contract").

`atlas_hot_vectors_v1` was scaffolded as an *optional* bounded
hot-vector cache sitting in front of Qdrant, intended for the case
where "measured retrieval latency shows vector caching is needed" or
"ACE packet assembly throughput is bounded by Qdrant ANN latency" (its
own provisioner's documented rationale). As of this session it is a
real, working, but **empty and unconsumed** capability: the provisioner
correctly creates/verifies/refuses-to-drift the index, but nothing in
the app reads or writes through it yet.

## Goals / Non-Goals

**Goals:**
- Establish whether a real hot-vector-cache consumer is actually
  needed, and if so, what its exact access pattern is.
- Once a consumer exists, extend the Valkey hash schema to fit that
  consumer's real needs — not a speculative superset.
- Keep the index disposable and rebuildable from Postgres/Qdrant at
  all times (never a second canonical vector corpus).

**Non-Goals:**
- This change does NOT itself commit to the richer schema sketch
  (`packet_id`, `workspace_revision`, `source_revision`,
  `representation_revision`, `content_hash`, domain tags,
  `centroid_id`) floated during the provisioner-repair session. That
  sketch is recorded below as a candidate, not a decision.
- Not migrating any existing data — none exists in this index today.
- Not touching Postgres/Qdrant ownership or the canonical lineage
  contract.

## Decisions

### Decision: do not extend the schema before a real consumer exists
**Rationale**: `rg` across `src/`, `scripts/`, `docs/`, `memory/`,
`next_steps/`, `openspec/`, `.opencode/` found zero readers/writers of
`atlas_hot_vectors_v1` and zero design docs specifying its full shape
beyond the provisioner's own minimal contract comment. Committing to
a richer schema now would be encoding a guess as infrastructure.
**Alternative considered**: adopt the full candidate schema
immediately (packet_id/workspace_revision/etc.) — rejected because
there is no code to validate the guess against, and per the project's
general principle of not designing for hypothetical future
requirements.

### Decision: keep the provisioner's minimal schema as the floor, not the ceiling
The already-shipped contract (`vector` FLOAT32[768] COSINE +
`representation_id` TAG, HASH storage, `atlas:hot-vector:` prefix) is
correct and stays as-is regardless of how this decision resolves —
any future consumer adds fields to this hash, it doesn't replace the
vector/representation_id pair.

## Risks / Trade-offs

- [Risk] The index sits unused indefinitely, becoming dead
  infrastructure. → Mitigation: it's cheap (bounded, disposable,
  Valkey-native RediSearch, no extra service), and the provisioner
  now honestly reports `ready_to_provision`/`proven_existing` rather
  than lying about its state, so it won't rot silently.
- [Risk] A future implementer invents a schema under time pressure
  without tracing a real consumer first, repeating this session's
  original problem. → Mitigation: this design doc + its Open
  Questions exist specifically to be checked before that happens.

## Migration Plan

Not applicable — no data exists in this index yet. Whenever a real
schema is decided, the deploy path is: extend
`ensure-valkey-hot-vector-index.mjs`'s schema constants → run
`npm run valkey:hot-index:apply` (or `valkey:index:create`, now an
alias for the same) → verify via
`sveltekit-frontend/scripts/atlas/smoke-atlas-hot-vectors.mjs`. The
provisioner already refuses to silently recreate a drifted index, so
a schema change on an *existing* populated index would need an
explicit `FT.DROPINDEX` + backfill step at that time — not needed
today since the index is empty.

## Open Questions

1. **Is a hot-vector cache actually needed?** No measured Qdrant ANN
   latency bottleneck has been documented anywhere found in this
   repo. The provisioner's own text treats this as a prerequisite
   ("Only enable if you have measured a specific hot-vector retrieval
   bottleneck"). First step: find or produce that measurement before
   building a consumer.
2. **If needed, what's the real consumer?** Best current guess is ACE
   packet assembly's Qdrant-bound retrieval path
   (`src/lib/server/ace/context-assembler.ts` or the retrieval
   orchestrator) — not confirmed. Needs tracing the actual retrieval
   call graph, not assumed.
3. **What identity/revision fields does that consumer actually read
   back?** The candidate list (`packet_id`, `workspace_revision`,
   `source_revision`, `representation_revision`, `content_hash`,
   domain tags, `centroid_id`) came from a hypothetical sketch, not
   a traced requirement — likely a subset, possibly with different
   names to match the canonical lineage contract's existing field
   names (`packet_key`, `source_ref`, `feature_id`, etc.) rather than
   inventing new ones.
4. **TTL/eviction policy** — undecided. A hot cache implies bounded
   size and staleness tolerance, neither specified yet.
5. **Who owns invalidation?** Per the canonical lineage contract,
   Redis/Valkey invalidation must happen *after* a Postgres write
   succeeds, never before. This index would need to follow that same
   rule once it has a writer.
