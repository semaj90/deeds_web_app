# Compact KNN Ordinal-Gate Hot-Path Proof

## Result

Added a CPU reference path that binds the candidate tile to the frozen ordinal-map snapshot/checksum, filters ordinals through the compiled bitset gate, then reads and scores only selected candidate vector rows before deterministic tile-local Top-K. The focused regression fixture includes a masked-out `NaN` vector row and confirms that selection excludes it without scoring it.

## Validation

- Focused Vitest suites: 3 files, 18 tests passed.
- Strict OpenSpec validation: `parent-atlas-tensor-residency-integration` valid.
- Scoped `git diff --check`: passed.
- No database, cache, GPU, device-transfer, or production SearchRuntime operation was run.

## Qualification boundary

This proves the CPU selection/scoring reference and serialized logical layout only. It does not prove physical memory alignment, PostgreSQL bytea round-trip, native N-API or GPU buffer alignment, a production executor caller, or live retrieval quality. Keep the OpenSpec task unchecked until those owner-specific gates have independent evidence.

likely_cause: The ordinal bitset contract previously stopped at a selector helper and did not have a scoring hot path demonstrating filtering before vector access.
evidence: `compact-knn-topk.ts`, `candidate-ordinal-bitset-selection-v1.spec.ts`, `aligned-bitset-blob-v1.spec.ts`, and the focused 18-test run.
patch_targets: `sveltekit-frontend/src/lib/server/atlas/retrieval/compact-knn-topk.ts`, `sveltekit-frontend/src/lib/server/atlas/features/candidate-ordinal-bitset-selection-v1.spec.ts`, `openspec/changes/parent-atlas-tensor-residency-integration/tasks.md`.
safe_next_command: `npx vitest run src/lib/server/atlas/features/candidate-ordinal-bitset-selection-v1.spec.ts src/lib/server/atlas/retrieval/compact-knn-topk.spec.ts src/lib/server/atlas/tensors/aligned-bitset-blob-v1.spec.ts --reporter=dot --pool=forks --poolOptions.forks.singleFork=true`
smoke_command: `npx openspec validate parent-atlas-tensor-residency-integration --strict`
report_path: `docs/reports/compact-knn-ordinal-gate-hot-path-20261017.md`
