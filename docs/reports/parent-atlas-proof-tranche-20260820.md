# Parent Atlas proof tranche — 2026-08-20

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
