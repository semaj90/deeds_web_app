# Atlas Capability Health Receipt

Read-only capability check, 2026-08-24.

## Results

| Capability | Result | Evidence |
| --- | --- | --- |
| Postgres | HEALTHY container | `legal-ai-postgres` Docker health status healthy |
| Qdrant REST | WORKING | `http://127.0.0.1:6333/collections` returned HTTP 200 and active collections including `codebase_chunks_768_v2` |
| Valkey | HEALTHY container | `legal-ai-valkey` Docker health status healthy |
| Go embedding service | HEALTHY container | `legal-ai-go-embedding` Docker health status healthy; host HTTP endpoint returned an empty reply on `/health`, so application route semantics remain separately unverified |
| Go retrieval service | HEALTHY container | `legal-ai-go-retrieval` Docker health status healthy |
| AST-grep NAPI | WORKING | `@ast-grep/napi@0.44.0` resolved and parsed a TypeScript function on Windows |
| MCP TypeScript SDK | INSTALLED / SUBPATH WORKING | `@modelcontextprotocol/sdk@1.22.0`; server subpath import passed. Root-package `require()` is not a valid test of this package's exports |
| MCP config | PRESENT | `.mcp.json` contains `playwright`, `trace`, `atlas-tools`, and `socraticode`; secrets were not printed |
| simdjson bridge | AUDITED | native memory audit scanned 12 C++ files and emitted 104 findings; this is audit evidence, not a parser benchmark |
| cuGraph | WORKING in RAPIDS env | WSL2 `/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python3`, cuGraph `26.06.00`; spectral modularity, Leiden, and SSSP symbols present |
| cuVS | WORKING in RAPIDS env | cuVS `26.06.00` imported successfully |
| PyTorch/NetworkX | INSTALLED in RAPIDS env | module discovery passed; combined import/GPU telemetry was not promoted because the process exceeded the bounded check window |
| cuTile | NOT INSTALLED | `cutile` and `cuda.tile` were absent from the RAPIDS environment |
| OKF domain dry run | READ_ONLY_COMPLETE | 4,365 candidates, 3,535 classified, 830 fallback, identity/evidence coverage 100%, no writes |

## Interpretation

The active production acceleration lane is WSL2 RAPIDS cuGraph/cuVS, not cuTile.
cuTile should remain an optional custom-kernel lane until installed and proven
with a bounded CPU/GPU parity receipt. The logical feature contracts remain
independent of physical tile layout.

No Postgres, Qdrant, Valkey, Neo4j, or source data was modified by this check.

