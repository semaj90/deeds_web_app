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
Status: **IMPLEMENTED_UNPROVEN**

Branch: `agent/gph-production-integration-proof`
Base: `main@1893c56fe4259d984e3e217a8af4eaba0eaf347a`

This tranche intentionally performs no canonical promotion and does not change retrieval scoring/filter semantics.

## GPH-15 / GPH-16

Implemented:

- `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-batch-v1.ts`
- `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-batch-v1.spec.ts`
- `sveltekit-frontend/scripts/atlas/prove-graphify-structural-batch-integration.mts`

Required workstation proof:

```bash
cd sveltekit-frontend
npx vitest run src/lib/server/atlas/indexing/graphify-structural-batch-v1.spec.ts
npx tsx scripts/atlas/prove-graphify-structural-batch-integration.mts
```

Expected gates:

- `gph15ParseFailureIsolation = true`
- `gph16ProductionDeltaOrchestration = true`
- persistence/readback remains `false`
- graphify daily reachability remains `false`

Do not enable canonical APPLY as part of this proof.

## GPH-17 reachability

Current merged state already invokes `native-structural-materializer.mts` when `GRAPHIFY_NATIVE_STRUCTURAL=1`.

After GPH-15/16 dry-run proof only:

```text
GRAPHIFY_NATIVE_STRUCTURAL=1
GRAPHIFY_NATIVE_STRUCTURAL_APPLY=0
```

Run the existing `graphify:daily` path and capture a receipt proving the native structural stage was reached. This gate proves reachability only. It does not establish canonical owner acceptance or authorize APPLY.

## Node Tree-sitter challenger

Implemented:

- additive `AstProviderId` discriminator supporting `node-tree-sitter-challenger`
- `node-tree-sitter-ast-provider.ts`
- `node-tree-sitter-ast-provider.spec.ts`
- `prove-node-tree-sitter-provider-parity.mts`

The default Graphify provider remains `treesitter-chunker-8095`.

The Node challenger intentionally emits no fabricated `upstream_*` IDs. Therefore a clean syntax parse remains `COMPATIBILITY_ONLY` for canonical promotion until GIS/canonical identity joins real native identifiers.

Run:

```bash
npx vitest run src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.spec.ts
npx tsx scripts/atlas/prove-node-tree-sitter-provider-parity.mts
```

If the Node `tree-sitter` / grammar packages are unavailable, the parity runner must report `BLOCKED_RUNTIME_UNAVAILABLE`; it must not install dependencies or silently substitute another parser.

Native old-tree reuse is a challenger optimization only and does not block GPH-16 delta correctness.

## Existing compiler-semantic / structural rule lanes

Do not create duplicates. Merged `main` already contains:

- `atlas/language/ast-grep-structural-topk.ts`
- `atlas/language/ts-morph-semantic-enrichment.ts`
- `atlas/language/language-intelligence-plan.ts`

Those owners already preserve the intended authority split:

```text
Tree-sitter -> syntax coordinates/source order
ast-grep   -> deterministic structural query candidates
TS-morph   -> TypeScript compiler-semantic observations
GIS/Postgres -> canonical identity/revision/lifecycle
```

This tranche adds `ApiContractObservationV1` as a revision-qualified evidence contract. It refuses to compile an observation without an inherited canonical `treeNodeId`; it cannot authorize writes or add a retrieval vote.

Run:

```bash
npx vitest run \
  src/lib/server/atlas/language/ast-grep-structural-topk.spec.ts \
  src/lib/server/atlas/language/ts-morph-semantic-enrichment.spec.ts \
  src/lib/server/atlas/language/api-contract-observation-v1.spec.ts
```

## EMB3 F1A — Qdrant lineage audit

Implemented:

- `sveltekit-frontend/scripts/atlas/audit-emb3a-qdrant-lineage.mjs`

Default qualification:

```text
collection = codebase_chunks_768_v2
representation = semantic_768
dimension = 768
```

The audit is read-only. It reads Postgres schema/population, collection-qualified builder source, Qdrant collection info/payload schema, and a bounded live payload sample. It does not write Postgres, Qdrant, Valkey, RabbitMQ, Graphify state, or retrieval policy.

Run:

```bash
node scripts/atlas/audit-emb3a-qdrant-lineage.mjs
```

Expected reports:

- `docs/reports/emb3a-qdrant-lineage-audit.json`
- `docs/reports/emb3a-qdrant-lineage-audit.md`

The audit must preserve these invariants:

1. `payloadIndexPresent != qdrantPayloadPresent`.
2. Vector dimension never synthesizes `representation_id`.
3. Missing `workspace_revision` / `source_revision` is never repaired by inference from timestamps, hashes, model metadata, or representation metadata.
4. Representation assertions are collection-qualified.
5. Patch only the first broken lineage boundary after the report identifies it.
6. Payload indexes are reconciled only after payload population is proven and only for fields actually used by filters.

Known source evidence before runtime execution:

- the current direct `codebase_chunks_768_v2` backfill selects chunk/vector fields but does not select packet/tree/symbol/workspace/source/representation revision lineage;
- its payload writes `representation_name=semantic_768`, `representation_id=null`, and `model_revision=null`;
- `atlas_packets.workspace_revision` exists but has a legacy default of `0`, which is not authority proof;
- `atlas_packets` has no `source_revision` column;
- `atlas_ast_nodes.source_revision` exists but is nullable;
- `atlas_symbol_versions` has non-null `workspace_revision` and `source_revision`, but a join from the Qdrant projection population to those version rows still has to be proven.

Therefore no Qdrant writer patch is authorized before F1A identifies the first broken boundary on the live workstation.

## Promotion boundary

Nothing in this tranche changes these states yet:

```text
GPH-15/16 new batch integration  IMPLEMENTED_UNPROVEN
GPH-17 live reachability          PENDING
GPH-18 persistence/readback       PENDING
GPH-19 owner acceptance           BLOCKED
EMB3 F1A live lineage             IMPLEMENTED_UNPROVEN
Node Tree-sitter challenger       IMPLEMENTED_UNPROVEN
API contract observation          IMPLEMENTED_UNPROVEN
```

The next state transition must be receipt-driven, not inferred from code presence.
