# Candidate feature GEMM bridge — 2026-08-22

Status: `CPU_GEMM_REFERENCE_TEST_PROVEN`

Implemented in the main checkout:

- `sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gemm-v1.ts`
- `sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gemm-v1.spec.ts`

The oracle consumes the existing revision-qualified `CandidateFeatureColumnarV1`
fabric and emits deterministic float32 feature-head scores keyed by the existing
CandidateOrdinal rows. The receipt includes input and score checksums and is
explicitly non-authoritative: no identity, promotion, GPU residency, or store
write is authorized.

Validation in `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`:

```text
candidate-feature-gemm-v1.spec.ts       3 passed
candidate-feature-gpu-pack-v1.spec.ts  6 passed
dense-executor-candidate-ordinal-v1    5 passed
total                                  14 passed
```

Not proven:

- native LibTorch/CUDA or cuBLAS/cuBLASLt parity;
- real RTX kernel timing or `KernelPerfReceiptV1`;
- FANOUT-01 or graph revision-owner acceptance;
- Qdrant, Neo4j, Valkey, Postgres, or canonical writes.

The clean proof worktree also exposed an existing dependency setup gap: the
SvelteKit consumer there cannot resolve `@deeds/parent-atlas` until the package
build/link dependencies are installed. The main checkout’s focused tests resolve
the package successfully.

## CUDA parity follow-up

The main-checkout proof command returned
`CANDIDATE_FEATURE_GPU_PARITY_BOUNDED_PROVEN`:

- PyTorch `2.8.0+cu128`, CUDA `12.8`.
- Device: NVIDIA GeForce RTX 3060 Ti.
- Logical rows `3`, physical rows `32`, padding rows `29`.
- Selected rows `2`; feature count `12`.
- Maximum feature delta `0`.
- Ordinal, feature value, presence, lane, degraded-identity, padding-mask,
  and padding-zero parity all passed.
- All store and canonical-write flags were false.

This is bounded CUDA gather/parity proof, not a production residency lease,
kernel-performance receipt, FANOUT admission, or canonical promotion proof.
