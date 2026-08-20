# Parent Atlas structural enrichment integration — 2026-08-20

Status: **IMPLEMENTED_UNPROVEN**

This branch composes the existing `agent/gph-production-integration-proof` tranche with the structural/language capabilities already present on `main`. It does not import PR #11, does not replace the current `semantic_768` EMB proof line, and performs no Postgres, Qdrant, Valkey, Neo4j, or canonical projection mutations.

## Reconciliation findings

- The GPH production batch tranche exists on `agent/gph-production-integration-proof` and is cleanly ahead of the current merged `main`; this branch inherits it rather than recreating it.
- `main` already contains a Node `tree-sitter` runtime adapter, an `@ast-grep/napi` structural candidate/ranking lane, `ts-morph` compiler-semantic enrichment, and language-intelligence authority contracts.
- The old `agent/atlas-ts-morph-semantic-enrichment` branch is heavily diverged and is not merged wholesale; its responsibility is already represented by newer code on `main`.
- PR #11 remains a separate draft challenger and is not evidence for this branch.

## Added in this integration branch

### Node Tree-sitter challenger

`node-tree-sitter-ast-provider.ts`

- implements the existing `AstProvider` boundary;
- uses Node Tree-sitter for TypeScript/TSX/JavaScript/JSX;
- emits `atlas.ast.evidence.v1` structural observations;
- detects `ERROR`/`MISSING` syntax recovery diagnostics;
- carries file/declaration spans plus bounded imports/exports/calls;
- intentionally leaves upstream/canonical node, file, chunk, symbol, packet, and revision identities unminted;
- therefore remains a parity challenger, not a canonical owner.

`GraphifyStructuralMaterializer` now admits `node-tree-sitter` as an injectable provider kind while preserving `treesitter-chunker-8095` as the default/current executor.

### Canonical lifecycle reconciliation contract

`canonical-lifecycle-reconciler-v1.ts`

- consumes `GraphifyStructuralTombstoneV1`;
- validates canonical identity/source reference;
- validates workspace revision;
- compares the tombstone `priorContentHash` with current canonical content lineage;
- explicitly treats the deletion `sourceVersionAnchor` as event identity, not the prior source revision;
- emits only a `READY_FOR_PERSISTENCE_OWNER` proposal when freshness is proven;
- cannot write canonical lifecycle or projection state.

This preserves the invariant **observation != mutation authority**.

### API/schema observation lane

`api-contract-observation-v1.ts`

- revision-qualified transport/schema observation;
- preserves Tree-sitter/GIS coordinates when available;
- links executable schema references instead of replacing OpenAPI/Protobuf/Zod/etc.;
- stable observation IDs are computed after canonicalizing set-valued fields;
- requires downstream canonical promotion and cannot write canonical state.

`sveltekit-api-contract-observer-v1.ts`

- recognizes only exported HTTP method handlers in SvelteKit `+server.ts` / `+server.js` files;
- derives route from the grounded source path;
- accepts schema/auth/side-effect references only as separately grounded evidence;
- does not infer them from names or prose.

### OKF projection

`okf-projection-v1.ts`

- pure Markdown/YAML-frontmatter renderer;
- emits under `docs/.okf/parent-atlas/{contracts,pipelines,api,evidence,gaps,representations}/`;
- carries source/workspace/source revisions and evidence references;
- explicitly records `canonical_authority: false` and `canonical_writes_allowed: false`;
- produces a deterministic SHA-256 content digest;
- performs no file/database writes itself.

## Tests added but not executed in the connector session

- `node-tree-sitter-ast-provider.spec.ts`
- `canonical-lifecycle-reconciler-v1.spec.ts`
- `api-contract-observation-v1.spec.ts`
- `sveltekit-api-contract-observer-v1.spec.ts`
- `okf-projection-v1.spec.ts`

These remain **IMPLEMENTED_UNPROVEN** until executed on the workstation.

## Workstation proof order

From `deeds-web-app/sveltekit-frontend`:

```powershell
npx vitest run --config vitest.lane-contracts.config.ts \
  src/lib/server/atlas/indexing/graphify-structural-batch-v1.spec.ts \
  src/lib/server/atlas/indexing/canonical-lifecycle-reconciler-v1.spec.ts \
  src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.spec.ts \
  src/lib/server/atlas/language/api-contract-observation-v1.spec.ts \
  src/lib/server/atlas/language/sveltekit-api-contract-observer-v1.spec.ts \
  src/lib/server/atlas/knowledge/okf-projection-v1.spec.ts
```

Then, with the existing 8095 structural service live:

```powershell
npx tsx scripts/atlas/prove-graphify-structural-batch-integration.mts
```

Only after the GPH-15/16 dry-run receipt is green should `graphify:daily` reachability be exercised with native structural migration enabled and apply disabled.

## Explicitly deferred

- Node Tree-sitter canonical-owner promotion;
- old-tree incremental reuse / `tree.edit()` optimization;
- canonical lifecycle persistence writer;
- Qdrant/Neo4j/Valkey invalidation execution;
- PostgreSQL 18 AIO/bitmap performance benchmarking;
- WSL2/N-API transport replacement;
- PR #11 semantic_512/GPU claims;
- EMB3A revision-owner population fixes.

## Safety result

- Postgres writes: **false**
- Qdrant writes: **false**
- Valkey writes: **false**
- Neo4j writes: **false**
- canonical identity writes: **false**
- canonical projection writes: **false**

`likely_cause`: The repository already had the individual Tree-sitter, ast-grep and ts-morph capabilities, but lacked a single proof-safe integration boundary for a Node AST challenger, DELETE lifecycle handoff, API contract observations and OKF projection.

`safe_next_command`: `npx vitest run --config vitest.lane-contracts.config.ts src/lib/server/atlas/indexing/graphify-structural-batch-v1.spec.ts src/lib/server/atlas/indexing/canonical-lifecycle-reconciler-v1.spec.ts src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.spec.ts src/lib/server/atlas/language/api-contract-observation-v1.spec.ts src/lib/server/atlas/language/sveltekit-api-contract-observer-v1.spec.ts src/lib/server/atlas/knowledge/okf-projection-v1.spec.ts`

`smoke_command`: `npx tsx scripts/atlas/prove-graphify-structural-batch-integration.mts`

`report_path`: `docs/reports/parent-atlas-structural-enrichment-integration-20260820.md`
