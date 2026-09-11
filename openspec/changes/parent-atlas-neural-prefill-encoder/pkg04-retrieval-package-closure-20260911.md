# PKG-04 — Retrieval Package Closure Reconciliation (2026-09-11)

Status: **IMPLEMENTATION_REPAIRED_WORKSTATION_PROOF_PENDING**

This note reconciles the standalone `@deeds/parent-atlas-retrieval` package boundary without moving live retrieval ownership out of SvelteKit.

## Findings

The package manifest and root barrel had drifted from the package source tree:

- `package.json` advertised `./turbovec`, `./qdrant`, and `./pipeline` subpaths that did not exist under `src/`;
- `src/index.ts`, `crossencoder-client.ts`, and `crossencoder-rerank-orchestrator.ts` imported nonexistent package-local `turbovec/*` modules;
- `./bifrost` and `./gpu` export targets pointed at `index.js` files whose TypeScript sources did not exist;
- `bifrost-provider.ts` imported `@ai-sdk/openai-compatible` without declaring it in this package;
- production `tsc` included co-located `*.test.ts` / `*.spec.ts` files;
- the package declared `native/`, `node-gyp`, a `build:native` command, and a `NATIVE_ADDON_PATH` even though this package contains no native addon directory. Native discovery actually belongs to the GPU/SIMD bridge and resolves the external `simd-bridge` artifact.

## Ownership decision

Do **not** copy the live SvelteKit TurboVec implementation into this package merely to make historical package imports compile.

The package boundary is now:

```text
@deeds/parent-atlas-retrieval
├── Bifrost support contracts / disposable cache helpers
├── CrossEncoder client + refinement adapter
├── minimal retrieval-hit compatibility contracts
└── GPU / SIMD bridge adapters

SvelteKit application
├── TurboVec executor/adapter owner
├── Qdrant retrieval/projection owner
└── SearchRuntime / fusion owner
```

CrossEncoder accepts an optional application-owned `BaseReranker`. The application can adapt its live TurboVec/reranking owner into that interface. Absence of a base reranker preserves incoming order; it does not silently synthesize a TurboVec implementation.

## Repairs landed

- Added `crossencoder/retrieval-contract.ts` with minimal hit/rerank contracts and injected `BaseReranker`.
- Removed package-local imports of nonexistent TurboVec modules.
- Added real `bifrost/index.ts`, `crossencoder/index.ts`, and `gpu/index.ts` barrels.
- Removed nonexistent `turbovec`, `qdrant`, and `pipeline` package exports.
- Declared `@ai-sdk/openai-compatible` and Node types explicitly.
- Excluded co-located test/spec files from production `tsc`.
- Removed false package-owned native-addon build/binary declarations.
- Added `audit:boundary` and `scripts/atlas/audit-parent-atlas-retrieval-package-boundary-v1.mjs`.
- Added focused CrossEncoder injected-reranker boundary tests.

## Required workstation proof

Do not close PKG-04 solely from source inspection. Run on the reconciled checkout:

```powershell
cd C:\Users\james\Videos\deeds-web-app

npm --prefix packages/parent-atlas-retrieval run audit:boundary
npm --prefix packages/parent-atlas-retrieval run typecheck
npm --prefix packages/parent-atlas-retrieval run build
npm --prefix packages/parent-atlas-retrieval test
```

Required results:

```text
PARENT_ATLAS_RETRIEVAL_PACKAGE_BOUNDARY_PROVEN
TYPECHECK = PASS
BUILD = PASS
TESTS = PASS
```

Only after those four facts are observed should `PKG-04` be marked complete in `tasks.md`.

## Non-authority statement

This repair changes package/source boundaries only.

```text
TurboVec owner changed         false
SearchRuntime owner changed    false
Qdrant owner changed           false
canonicalAuthority             false
production retrieval enabled   unchanged
canonical/store writes         0
```
