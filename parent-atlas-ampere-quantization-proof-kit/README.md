# Parent Atlas — Ampere SM86 Quantization Proof Kit

This kit is intentionally narrow. It does **not** create another feature matrix,
semantic representation, packet identity, or retrieval owner.

## Ownership

- `semantic_768` remains canonical semantic identity.
- FP32 remains the exact/oracle path.
- INT4/INT8 are storage/residency encodings.
- FP16/BF16 are hot compute lanes.
- INT4 V1 uses `packed INT4 -> dequantize -> FP16/FP32 score`.
- CUTLASS native INT4 MMA is explicitly experimental.
- FP8 and floating-point FP4 are rejected as native SM86 execution assumptions.

## Suggested repo paths

- `sveltekit-frontend/src/lib/server/atlas/contracts/gpu-quantization-v1.ts`
- `sveltekit-frontend/src/lib/server/atlas/contracts/gpu-quantization-v1.spec.ts`
- `scripts/atlas/gpu/test_ampere_quantization.py`
- `scripts/atlas/gpu/smoke_ampere_quantization.py`

## Integration

Before committing, replace the two integration constants in
`gpu-quantization-v1.ts` with imports from the existing
`feature-extraction-v1.ts` canonical semantic constants, if those constants are
already exported. Do **not** create a second semantic identity owner.

Export the schema from the existing contracts index rather than creating a new
contract registry.

## TypeScript proof

```powershell
npm exec -- vitest run src/lib/server/atlas/contracts/gpu-quantization-v1.spec.ts
```

## Python unit / GPU proof

```powershell
pytest -q scripts/atlas/gpu/test_ampere_quantization.py -s
python scripts/atlas/gpu/smoke_ampere_quantization.py
```

## Real corpus proof

Export or adapt the frozen semantic_768 corpus/query artifacts to `.npy` for the
test harness, then:

```powershell
$env:ATLAS_SEMANTIC_768_NPY="C:\path\semantic_768.npy"
$env:ATLAS_QUERY_768_NPY="C:\path\queries_768.npy"
pytest -q scripts/atlas/gpu/test_ampere_quantization.py -s -k live
```

Do not set a promotion threshold until the first real distribution is recorded.
After review, a versioned gate can set `ATLAS_INT4_MIN_RECALL10`.

## Required promotion receipt

The real Parent Atlas promotion decision should compare to the existing T3a
FP32/cuVS oracle and persist:

- representation revision
- quantization revision
- block size
- Recall@1/10/100
- top-1 identity
- score error mean/p95/max
- bytes/vector including scale overhead
- dequantization time
- candidate scoring time
- exact-rescore time

INT4 remains `CACHE_HINT_ONLY` until that receipt explicitly promotes a stronger
role.
