# Parent Atlas Recovery Script Audit

Generated: 2026-06-28

## Current Finding

Live Postgres has `atlas_packet_registry`, `atlas_artifacts`, and `atlas_semantic_diffs`, but all three are empty. The tables needed by most recent Parent Atlas recovery and summary scripts are absent:

- `atlas_packets`
- `atlas_summary_layers`
- `atlas_codebase_packets`
- `atlas_feature_packets`

The missing Gemma4 summaries are not proven data loss. They were not run yet, and the scripts that would run them currently expect packet tables that are missing from the restored database.

## Recommended Recovery Spine

Use the compatibility spine first:

1. Recreate `atlas_packets`.
2. Recreate `atlas_summary_layers`.
3. Rebuild `atlas_packets` from repo scan and surviving local packet artifacts.
4. Run the Gemma4 summary pass.
5. Backfill `atlas_packet_registry` from `atlas_packets`.
6. Rebuild Qdrant, Redis, Neo4j, and topology mirrors from Postgres truth.

This minimizes script churn because most current scripts still target `atlas_packets`.

## Safe Entry Points

### Packet Rebuild

- `scripts/atlas/upsert-whole-codebase-atlas-packets.mjs`
  - Role: rebuilds codebase packet rows from `rg --files`.
  - Target: `atlas_packets`.
  - Status: ACTIVE after patch.
  - Notes: now uses shared env helper and real async file stat.

- `scripts/atlas/sync-parent-atlas-packets-to-postgres.mjs`
  - Role: replays `.tmp/parent_atlas_packets/parent-atlas-packets.ndjson`.
  - Target: `atlas_packets`.
  - Status: ACTIVE if the NDJSON artifact exists.

### Summary Generation

- `scripts/atlas/summary-ranking-retrieval-pipeline.mjs`
  - Role: summary backfill, embedding, centroids, ACE cache.
  - Targets: `atlas_packets` or `codebase_chunk_index`.
  - Status: ACTIVE after `atlas_packets` exists.

- `scripts/atlas/graphify-summary-phase1.mjs`
  - Role: summary and embedding pass for `codebase_chunk_index`.
  - Target: `codebase_chunk_index`.
  - Status: ACTIVE for chunk-index lane only.

- `sveltekit-frontend/scripts/atlas/gemma4-batch-summarize-packets.mjs`
  - Role: packet summary and feature label route call.
  - Target: `atlas_packets`.
  - Status: ACTIVE after `atlas_packets` exists.

### Registry Derivation

- `scripts/atlas/backfill-packet-registry.mjs`
  - Role: derives `atlas_packet_registry` from `atlas_packets`.
  - Target: `atlas_packet_registry`.
  - Status: ACTIVE only after `atlas_packets` is populated.

## Patch Required Before Apply

- `scripts/atlas/upsert-whole-codebase-atlas-packets.mjs`
  - Needs the target table recreated before `--apply`.
  - Feature IDs are path-derived and should be treated as initial labels, not final taxonomy.

- `sveltekit-frontend/scripts/atlas/gemma4-batch-summarize-packets.mjs`
  - Uses direct Redis construction. Prefer shared Redis/env helper later.
  - Fine for recovery after table existence is restored.

- `packages/parent-atlas/src/pipelines/backfill-summary-stubs.ts`
  - Targets `atlas_codebase_packets` and `atlas_summary_layers`.
  - Keep for split-ledger lane, not for the immediate compatibility rebuild.

## Stale Or Deferred For Recovery

- Scripts requiring `atlas_codebase_packets` should be deferred until after the compatibility rebuild or adapted deliberately.
- Scripts requiring populated SOM, AE, GDS, or Neo4j mirrors should not run until packet rows and summaries exist again.
- `atlas_packet_registry` should be derived after packet rebuild, not treated as the only source because it is currently empty.

## Minimal Command Order

Dry run first:

```powershell
node --check scripts\atlas\upsert-whole-codebase-atlas-packets.mjs
node --check scripts\atlas\summary-ranking-retrieval-pipeline.mjs
node --check scripts\atlas\graphify-summary-phase1.mjs
```

Then after recreating `atlas_packets` and required indexes:

```powershell
node scripts\atlas\upsert-whole-codebase-atlas-packets.mjs --apply
npm --prefix sveltekit-frontend run atlas:summary:all:apply
node scripts\atlas\backfill-packet-registry.mjs
```

## Guardrail

Do not run topology, SOM, AE, Qdrant mirror apply, Redis warm, or Neo4j projection before the packet spine and summaries have been restored. Those lanes are mirrors or enrichment; Postgres packet truth comes first.
