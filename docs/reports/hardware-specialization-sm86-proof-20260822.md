# Hardware specialization SM86 proof — 2026-08-22

## Scope

The historical hardware specialization series was selectively carried onto a
clean local `main` worktree. No GPU benchmark, model training, Postgres,
Qdrant, Neo4j, Valkey, or index mutation was performed.

## Evidence

- Hardware specialization contract, promotion tests, SM86 correction, profile
  materializer, kernel receipt contract, and duplicate cleanup are present in
  the local `main` history.
- Focused validation passed:
  `npx vitest run --config vitest.lane-contracts.config.ts
  src/lib/server/atlas/contracts/hardware-specialization-v1.spec.ts`
  — `5/5` tests.
- `npx tsc --noEmit --skipLibCheck --pretty false` emitted no diagnostics.
- The proof worktree is clean after the cherry-pick series.

## Classification

`HARDWARE_PROFILE_CREATED`  
`SM86_ESTIMATOR_CONTRACT_PROVEN`  
`HARDWARE_SPECIALIZATION_WRITTEN_UNPROVEN`  
`REAL_TARGET_BENCHMARK_NOT_RUN`  
`TARGET_VALIDATED_NOT_PROVEN`

The contract rejects CUTLASS analytical heuristics for `sm_86`, permits a
learned SM86 cost model only as an estimate, and requires a parity-passing
`real_target` receipt with estimator `NONE` for promotion.

## Next gate

Run one bounded representative `[B,F] × [F,H]` benchmark through cuBLASLt,
CUTLASS profiler, cuTile, and LibTorch against the same numerical reference,
then emit a `KernelPerfReceiptV1`. Do not train the SM86 cost model until real
receipts exist.

