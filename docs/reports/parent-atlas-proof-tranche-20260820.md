# Parent Atlas proof tranche — 2026-08-20

Status: IMPLEMENTED_UNPROVEN

This tranche preserves the distinction between WRITTEN, WIRED, and PROVEN.

## Structural proof order

1. GPH-15 bounded failure isolation remains PROVEN from the existing workstation proof.
2. GPH-15 production batch contract is IMPLEMENTED_UNPROVEN.
3. GPH-16 bounded changed/unchanged/delete orchestration remains BOUNDED_PROVEN.
4. GPH-16 production batch delta contract is IMPLEMENTED_UNPROVEN.
5. GPH-17 invocation is WIRED_BEHIND_FLAG; live reachability remains PENDING.
6. `GRAPHIFY_NATIVE_STRUCTURAL_APPLY=1` remains blocked.
7. Durable lifecycle persistence/readback remains GPH-18 PENDING.

## Node Tree-sitter challenger

The Node provider is a challenger behind the existing `AstProvider` boundary. It does not mint or promote canonical identity.

Proof runner:

```text
npx tsx scripts/atlas/prove-node-treesitter-provider-parity.mts
```

Allowed outcomes:

- `PARITY_PROVEN_ON_FIXTURES`
- `PARITY_MISMATCH`
- `BLOCKED_RUNTIME_UNAVAILABLE`

A fixture parity pass does not transfer ownership from the current 8095/GIS path. Native old-tree reuse (`tree.edit()` + parse with the edited old tree) is a separate optimization proof.

## EMB3-F1A first-loss classification

The live audit reported that revision authority is not populated upstream:

- `atlas_packets.workspace_revision` is present but sampled rows remain zero.
- `atlas_packets` has no canonical `source_revision` column.
- the semantic packet writer persists representation lineage but does not accept/populate workspace/source revision authority.
- the Qdrant sync payload builder serializes downstream values and must not invent missing authority.

Therefore the current expected classification remains:

```text
workspace_revision  -> CANONICAL_SOURCE_GAP or NOT_PROVEN
source_revision     -> CANONICAL_SOURCE_GAP
```

until a canonical revision owner is proven.

The first-loss classifier supports these exact outcomes per field:

- `CANONICAL_SOURCE_GAP`
- `SNAPSHOT_PROJECTION_GAP`
- `OUTBOX_REFERENCE_GAP`
- `BUILDER_PROPAGATION_GAP`
- `LIVE_PROJECTION_STALE`
- `PAYLOAD_INDEX_GAP`
- `NOT_PROVEN`
- `NONE`

A Qdrant writer patch is allowed only when the aggregate first loss is `BUILDER_PROPAGATION_GAP`. Upstream lineage gaps explicitly block such a patch.

## No mutation claims

This tranche does not perform:

- Postgres writes
- Qdrant writes
- Valkey writes
- Neo4j writes
- Graphify APPLY
- canonical identity promotion
- semantic representation migration
- payload-index creation

## Workstation execution sequence

From `sveltekit-frontend`:

```text
npx vitest run --config vitest.lane-contracts.config.ts \
  src/lib/server/atlas/indexing/graphify-structural-batch-v1.spec.ts \
  src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.spec.ts \
  src/lib/server/atlas/retrieval/emb3a-lineage-first-loss-v1.spec.ts
```

Then with 8095 live:

```text
npx tsx scripts/atlas/prove-graphify-structural-batch-integration.mts
npx tsx scripts/atlas/prove-node-treesitter-provider-parity.mts
```

Only after those proofs should GPH-17 reachability run with:

```text
GRAPHIFY_NATIVE_STRUCTURAL=1
GRAPHIFY_NATIVE_STRUCTURAL_APPLY=0
```

EMB3A writer changes remain blocked until the live lineage audit identifies a first loss below the canonical source boundary.
