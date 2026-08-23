# AST / Native Bridge Alignment — 2026-08-23

Status: `WIRED / PARTIAL_PROVEN / PACKAGE_BOUNDARY_BLOCKED`

Repository convergence: the working checkout is
`archive/orphaned-root-src-tree-20260822`, currently `17` commits ahead and
`132` commits behind `origin/main`. These results are therefore checkout-local
until the dirty work is selectively reconciled onto current main.

## Verified

- `@ast-grep/napi` is used by the SvelteKit AST extractor.
- Parent Atlas has a Zod-validated ast-grep observation adapter.
- Structural extraction and sidecar provenance tests pass `6/6`.
- The ast-grep structural top-k test passes `5/5`.
- The Rust TurboVec N-API package loads on Windows and `turbovecSmoke(8, 4)` returns `ok dim=8 bits=4`.
- The C++ CUDA N-API addon loads from `simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node`, reports CUDA available, and exposes GPU, cuVS compression, and simdjson functions.
- The Rust simdjson N-API artifact loads and exposes parse/batch functions.
- The simdjson bridge tests pass `2/2`.
- The retrieval package public barrel was reconciled with the implementations:
  Bifrost, TurboVec, CUDA, and GPU pipeline exports now use the names that
  actually exist in their source modules.
- Post-repair native smoke checks pass: TurboVec N-API returns `ok dim=8
  bits=4`, Rust simdjson parses `{}`, and the CUDA addon reports available.

## Blocked

`packages/parent-atlas-retrieval` still does not typecheck as an isolated
package. Its current `tsconfig.json` includes the full source tree but has no
SvelteKit `$lib` path mapping or consumer-boundary project reference. The
remaining failure is dominated by missing `$lib/server/*` modules and missing
app-local retrieval modules; the stale public export names were corrected.

This is a package-boundary problem, not evidence that the native addons are
missing. Do not solve it by adding Prisma, duplicating SvelteKit services, or
turning CPU fallbacks into GPU proof.

## Required next gates

1. Define whether `packages/parent-atlas-retrieval` is a standalone package or
   a SvelteKit consumer adapter.
2. If standalone, remove `$lib` imports from the package and inject interfaces
   for Redis, Qdrant, env, and observability dependencies.
3. If consumer-bound, create an explicit consumer-only typecheck config and do
   not publish the package as independently buildable.
4. Decide the package boundary before claiming package build health. The
   export barrel is aligned, but standalone typecheck remains blocked until
   SvelteKit dependencies are injected or the package is explicitly marked as
   a consumer adapter.
5. Add one native-addon receipt that records addon path, ABI/runtime, CUDA
   availability, and fallback status without promoting a production owner.

No database, Qdrant, Neo4j, Valkey, or canonical graph writes were performed.
