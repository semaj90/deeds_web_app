# Native Addon Contract Audit

As of 2026-09-27, the explicitly selected out-of-tree CUDA/LibTorch addon loaded and exposed 39 classified exports. This audit describes one local binary; it is not an application deployment or production liveness claim.

| Declared backend | Exports | Count |
| --- | --- | ---: |
| `libtorch_cuda` | LibTorch GPU operations | 14 |
| `cuda_kernel` | CUDA kernel/graph operations | 9 |
| `cpu_fallback` | CPU-owned or host-runtime operations | 14 |
| `unavailable` | Known unavailable/stub exports | 2 |

The exact export lists, addon SHA-256, build metadata, and bounded probe evidence are in [native-addon-contract-audit.json](native-addon-contract-audit.json).

The startup probe distinguished the two important cases: `batchCosineSimilarity` was `CUDA_LIVE` only after a matching scalar-oracle comparison and `cuda_execution=1`; `graphSimilarity` was `CPU_FALLBACK` with matching CPU-oracle output. The CUDA runtime memory query returned 5,855 MiB free of 8,191 MiB. The cuBLAS availability field was corrected to use the CMake `SIMD_HAVE_CUBLAS` definition.

Limits: per-export metadata is capability classification, not execution evidence. Only named operations with counters and parity have a bounded execution claim. No database, vector-store, or cache writes occurred; no model was called; no semantic representation or canonical identity was promoted.
