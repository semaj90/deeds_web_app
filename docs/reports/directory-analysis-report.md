# Directory Role Map
_Generated: 2026-05-16T18:53:38.996Z_

## Summary
| Role | Count |
|------|-------|
| `source` | 8 |
| `migrations` | 5 |
| `tests` | 3 |
| `generated_reports` | 3 |
| `external_docs_normalized` | 4 |
| `scripts` | 6 |
| `archive` | 2 |
| `binary_artifact` | 10 |
| `build_cache` | 3 |
| `diagnostic_log` | 4 |
| `external_docs_raw` | 3 |
| `config` | 6 |

## All Entries
| Path | Role | rg Mode | Owner |
|------|------|---------|-------|
| `sveltekit-frontend/src` | `source` | default rg OK | SvelteKit App |
| `sveltekit-frontend/src/routes` | `source` | rg -u required | SvelteKit routes |
| `sveltekit-frontend/src/lib/server/db` | `source` | rg -u required | Drizzle schema files |
| `sveltekit-frontend/src/lib/db` | `source` | default rg OK | DB client entry |
| `sveltekit-frontend/drizzle` | `migrations` | rg -u required | Drizzle ORM |
| `sveltekit-frontend/drizzle/manual` | `migrations` | rg -u required | Manual SQL sidecars |
| `sveltekit-frontend/drizzle/meta` | `migrations` | rg -u required | Drizzle journal |
| `sveltekit-frontend/tests` | `tests` | default rg OK | Vitest + Playwright |
| `tests` | `tests` | default rg OK | Root-level tests |
| `docs/reports` | `generated_reports` | rg -u required | Atlas audit output |
| `docs/graph` | `generated_reports` | rg -u required | Graph / atlas JSON blobs |
| `docs/llms` | `external_docs_normalized` | rg -u preferred | LLMS.txt for AI context |
| `sveltekit-frontend/docs/atlas-index` | `external_docs_normalized` | rg -u required | Atlas index snapshots |
| `sveltekit-frontend/memory` | `external_docs_normalized` | rg -u required | Karpathy memory store |
| `scripts` | `scripts` | default rg OK | Atlas / audit scripts |
| `scripts/atlas` | `scripts` | default rg OK | Atlas audit scripts |
| `sveltekit-frontend/scripts` | `scripts` | default rg OK | Frontend tooling |
| `next_steps` | `scripts` | default rg OK | Operator roadmap documents |
| `sveltekit-frontend/src/lib/server/db/archived-schemas` | `archive` | skip / ignore OK | Legacy schema files |
| `granite-docling-258M` | `binary_artifact` | skip / ignore OK | Docling model weights |
| `turbovec` | `binary_artifact` | skip / ignore OK | Turbovec binary |
| `sveltekit-frontend/static` | `binary_artifact` | skip / ignore OK | Static assets (WASM, fonts, images) |
| `sveltekit-frontend/.svelte-kit` | `build_cache` | skip / ignore OK | SvelteKit build cache |
| `sveltekit-frontend/node_modules` | `build_cache` | skip / ignore OK | Frontend npm deps |
| `node_modules` | `build_cache` | skip / ignore OK | Root npm deps |
| `artifacts` | `diagnostic_log` | rg -u required | Build/test artifacts |
| `audit` | `generated_reports` | rg -u required | Root-level audit output |
| `data` | `external_docs_raw` | rg -u required | Raw data files |
| `deeds_labs` | `archive` | skip / ignore OK | Gitignored lab/experimental code |
| `docker` | `config` | default rg OK | Docker Compose / Caddy / service configs |
| `drizzle` | `migrations` | rg -u required | Root-level legacy drizzle (pre-monorepo) |
| `karpathy-wiki` | `external_docs_raw` | rg -u required | Karpathy wiki raw notes |
| `lawpdfs` | `binary_artifact` | skip / ignore OK | Legal PDF source documents |
| `llm` | `external_docs_raw` | default rg OK | LLM notes / timelines |
| `logs` | `diagnostic_log` | skip / ignore OK | Runtime and task output logs |
| `memory` | `external_docs_normalized` | rg -u required | Root-level Claude memory files |
| `minio-data` | `binary_artifact` | skip / ignore OK | object storage data |
| `minio` | `config` | default rg OK | object storage configuration |
| `models` | `binary_artifact` | skip / ignore OK | ML model weights |
| `nginx` | `config` | default rg OK | Nginx proxy config |
| `onnx` | `binary_artifact` | skip / ignore OK | ONNX model files |
| `pgvector-precompiled` | `binary_artifact` | skip / ignore OK | Precompiled pgvector binaries |
| `playwright_todos` | `tests` | default rg OK | Playwright TODO tracking |
| `proto` | `source` | rg -u required | gRPC protobuf definitions |
| `python` | `scripts` | default rg OK | Python utility scripts |
| `qdrant-windows` | `binary_artifact` | skip / ignore OK | Qdrant Windows binary |
| `qdrant` | `config` | default rg OK | Qdrant config / data |
| `redis` | `config` | default rg OK | Redis config |
| `scratch` | `diagnostic_log` | skip / ignore OK | Scratch / temp files |
| `services` | `source` | default rg OK | Go / auxiliary microservices |
| `simd-bridge` | `source` | default rg OK | C++ N-API SIMD/LibTorch bridge |
| `sql` | `migrations` | rg -u required | Root-level raw SQL files |
| `ssl` | `config` | skip / ignore OK | TLS certificates (gitignored) |
| `storage` | `binary_artifact` | skip / ignore OK | Local object storage data |
| `test-results` | `diagnostic_log` | skip / ignore OK | Playwright / Vitest test result outputs |
| `tools` | `scripts` | default rg OK | Developer tooling |
| `vscode-extension` | `source` | default rg OK | VS Code extension source |
