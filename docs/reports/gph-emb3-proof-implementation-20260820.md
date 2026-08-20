# GPH + EMB3 Proof Implementation — 2026-08-20

## Authority

Branch: `agent/gph-emb3-lineage-proof-20260820`  
Base: current merged `main` at start of tranche  
Mode: **PROOF / no production mutation**

PR11 (`feature/parent-atlas-live-graph-proof-v2`) remains an unmerged draft challenger and is not imported into this proof line.

## Implemented in this tranche

### GPH-15 / GPH-16 production delta contract

Added:

- `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-batch-v1.ts`
- `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-batch-v1.spec.ts`
- `sveltekit-frontend/scripts/atlas/prove-graphify-structural-batch-integration.mts`

The batch contract:

- wraps the existing `GraphifyStructuralMaterializer` rather than adding another production parser;
- rejects duplicate normalized `sourceRef` values before parsing;
- skips unchanged UPSERTs before invoking the parser;
- re-extracts changed UPSERTs through the selected `AstProvider`;
- emits DELETE as `GraphifyStructuralTombstoneV1` without invoking the parser;
- isolates a failed file from neighboring inputs;
- emits one deterministic `atlas.graphify-structural-batch.v1` receipt;
- performs no canonical persistence.

The live proof runner uses the real 8095 provider and writes only proof reports. It intentionally leaves these gates false:

- `productionPersistenceReadback=false`
- `graphifyDailyReachability=false`
- `canonicalOwnerAccepted=false`
- `applyAuthorized=false`

Therefore a successful dry run may advance GPH-15/16 only; it cannot close GPH-17/18/19.

### Canonical lifecycle handoff

Added `sveltekit-frontend/src/lib/server/atlas/indexing/canonical-lifecycle-reconciler-v1.ts`.

This is contract-only. It consumes `GraphifyStructuralTombstoneV1` and records that the accepted PostgreSQL lifecycle owner still must prove:

1. canonical lifecycle ownership;
2. revision comparison;
3. persistence readback;
4. projection invalidation receipt.

It authorizes neither canonical mutations nor projection invalidation.

### Node Tree-sitter challenger

The repository already contained the official Node Tree-sitter runtime for structured values, so this tranche did not create a second runtime owner.

Added `sveltekit-frontend/src/lib/server/atlas/language/node-tree-sitter-ast-provider.ts` and widened the existing `AstProviderResult.provider` discriminator to permit `node-tree-sitter-challenger`.

The challenger:

- uses the existing `tree-sitter`, `tree-sitter-typescript`, and `tree-sitter-javascript` packages;
- implements the same `AstProvider` interface as 8095;
- emits exact syntax spans and ERROR/MISSING diagnostics;
- deliberately emits no upstream/canonical IDs, keeping `canonicalPromotionAllowed=false` through existing provenance checks;
- contains a GPH-16B helper that edits the old tree and supplies it to the next parse for incremental reuse;
- performs no persistence and remains `CHALLENGER_ONLY` until parity is proven.

### ts-morph / ast-grep

No duplicate ts-morph or ast-grep subsystem was added.

Current `main` already has:

- `atlas/language/ts-morph-semantic-enrichment.ts` for compiler definitions, references, implementations and types while inheriting structural coordinates;
- `atlas/language/ast-grep-structural-topk.ts` for deterministic structural candidates without canonical identity or extra lane votes.

Those owners are retained.

### API observation contract

Added `sveltekit-frontend/src/lib/server/atlas/contracts/api-contract-observation-v1.ts`.

It defines a read-only `ApiContractObservationV1` for HTTP/gRPC/MCP/A2A/ACP/internal handlers with schema refs, auth requirements, side-effect classification, structural/compiler provenance, and explicit `canonicalWritesAllowed=false`.

No endpoint registration or mutation path is changed by this contract.

### EMB3A revision-owner audit

Added `sveltekit-frontend/scripts/atlas/audit-emb3a-upstream-revision-owner.mts`.

The audit is read-only. It:

- reads PostgreSQL `information_schema`, `atlas_packets`, and `atlas_ast_nodes` with SELECT only;
- inspects source code for the semantic writer, Qdrant payload builder, and Qdrant sync worker;
- reads Qdrant collection metadata and scrolls a bounded payload sample with vectors disabled;
- reports payload population separately from payload-index presence;
- refuses to infer revision authority from vector dimension, timestamps, Qdrant point IDs, or representation revision.

Target report paths:

- `docs/reports/emb3a-upstream-revision-owner-audit.json`
- `docs/reports/emb3a-upstream-revision-owner-audit.md`

If authoritative revisions are not fully populated upstream, the terminal state remains `REVISION_OWNER_NOT_PROVEN`. This audit does not patch the Qdrant writer.

## Proof commands to run on the workstation

From `deeds_web_app/sveltekit-frontend` with 8095 available:

```bash
npx vitest run --config vitest.lane-contracts.config.ts \
  src/lib/server/atlas/indexing/graphify-structural-batch-v1.spec.ts

npx tsx scripts/atlas/prove-graphify-structural-batch-integration.mts

npx tsx scripts/atlas/audit-emb3a-upstream-revision-owner.mts
```

Do not set `GRAPHIFY_NATIVE_STRUCTURAL_APPLY=1` in this tranche.

Only after the first two commands produce passing evidence should GPH-17 reachability be attempted with:

```text
GRAPHIFY_NATIVE_STRUCTURAL=1
GRAPHIFY_NATIVE_STRUCTURAL_APPLY=0
```

and the existing `graphify:daily` owner.

## Current proof classification

| Item | State after code implementation |
| --- | --- |
| GPH-15 production batch isolation | IMPLEMENTED_UNPROVEN |
| GPH-16 production delta orchestration | IMPLEMENTED_UNPROVEN |
| GPH-16B native Node incremental reuse | CHALLENGER_IMPLEMENTED_UNPROVEN |
| GPH-17 live daily reachability | WIRED_BEHIND_FLAG / NOT_PROVEN |
| GPH-18 persistence readback | PENDING |
| GPH-19 canonical owner acceptance | BLOCKED |
| canonical lifecycle reconciler | CONTRACT_ONLY_OWNER_UNRESOLVED |
| ts-morph semantic enrichment | EXISTING OWNER RETAINED |
| ast-grep structural observation | EXISTING OWNER RETAINED |
| API contract observation | IMPLEMENTED_UNPROVEN |
| EMB3A revision owner | AUDIT_IMPLEMENTED_UNPROVEN |
| EMB3A Qdrant writer patch | NOT ATTEMPTED |

No production PostgreSQL, Qdrant, Valkey, Neo4j, or Graphify data was changed by this repository tranche.
