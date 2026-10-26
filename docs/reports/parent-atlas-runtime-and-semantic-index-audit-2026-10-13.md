# Parent Atlas Runtime and Semantic Index Audit — 2026-10-13

## Decision

Repository semantic indexing is **not proven complete**. The available semantic-corpus receipt is explicitly blocked, and the newer manifest is a plan with no canonical authority. The Master TOC, OpenWiki/document acquisition, lexical OpenSpec preview, import smoke tests, and fixture graph tests are useful but prove different, narrower capabilities.

## Evidence-ranked status

| Area | State | Evidence and limit |
|---|---|---|
| OpenSpec workboard | **Generated; not portfolio completion** | `openspec-workboard-v1.json` reports 7,228/11,729 tasks checked (61.6%) and 4,501 open. This is checkbox/task projection, not proof-weighted phase completion. |
| Semantic corpus | **Blocked** | `semantic-corpus-admission-v1.json` (2026-09-16) reports `SEMANTIC_CORPUS_ADMISSION_BLOCKED`: 328,348 owner-collection points, 5,730 duplicate canonical IDs, and 328,318 points missing source and workspace revisions. This receipt is historical; it is not a fresh live census. |
| Current semantic manifest | **Planned; not authoritative** | `current-semantic768-corpus-manifest-plan-v1.json` has `canonicalAuthority=false`, unresolved choice between `codebase_chunks_768` and `_v2`, null PostgreSQL packet/Qdrant point totals, and `importAllowed=false`. It uses `embeddinggemma:latest`, not a pinned model digest. |
| Source-file indexing replay | **File-admission parity only** | `replay-semantic-admission-v1.json` reports 10,135 matching rows. Its scope is scanner/manifest eligibility parity, not embedding execution, vector persistence, source lineage, or retrieval quality. |
| Master TOC / OpenWiki docs | **Navigation and acquisition** | TOC records and `.okf` crawls establish indexed documentation/navigation or acquisition. The architecture owner explicitly says these do not establish semantic corpus admission. Repo `.okf` is a local contract, distinct from Google's external OKF format. |
| Deep Agents / LangChain | **Dependencies/import smoke; not wired execution** | Package pins exist in `packages/atlas-orchestrator/package.json`; the smoke imports modules with `agentsInstantiated=0`, `databaseConnections=0`, and `canonicalWrites=0`. No evidence here of a production SvelteKit agent flow. |
| Windows Python | **Verified CPU environment** | Fresh import check: repo `.venv` has PyTorch `2.13.0+cpu`, NetworkX `3.6.1`, OAKlib `0.7.4`, XGBoost `3.2.0`; `torch.cuda.is_available()` is false. LangChain, Deep Agents, simdjson, cuGraph, and cuVS were not importable there. |
| WSL2 / RTX Python | **Prior report says installed; current refresh timed out** | The 2026-10-13 runtime inventory reports WSL RAPIDS PyTorch `2.13.0+cu130`, CUDA available, XGBoost CUDA build, cuGraph/cuVS. My current WSL import check did not return, so this is not freshly confirmed. Package presence still does not prove the 8098 sidecar is using that interpreter or that a GPU job works. |
| CUDA Tile / SIMT | **No execution proof** | Documentation and alignment notes exist; no current kernel compile/run receipt was verified. Treat cuTile as unproven and keep ordinary PyTorch/cuBLAS/cuVS paths separate. |
| Resident BFS / cuGraph | **Fixture-only** | `atlas-resident-bfs-proof-2026-10-13.json` states `FIXTURE_ONLY`, `liveBfsRequestPerformed=false`, and `gpuExecutionPerformed=false`. The five passing tests prove fixture/reference behavior, not live graph residency or RTX execution. |

## What “semantic indexing complete” must mean

Do not equate a file scan, TOC, embedding dimension, Qdrant point count, or successful import with completion. A promotion-grade repo index needs one consistent, reproducible chain:

`current file bytes + workspace revision → canonical source/chunk identity → admitted chunk text → pinned EmbeddingGemma model digest and recipe → semantic_768 vector + representation revision → PostgreSQL canonical row → Qdrant projection parity → exact/ANN retrieval evaluation → current-source readback`

The current receipts do not prove this chain corpus-wide. Keep legacy 384-D values historical; do not pad, relabel, or convert them.

## Next gates

1. **SEM-INDEX-01 — Choose and freeze one corpus owner.** Resolve the configured Qdrant collection against PostgreSQL canonical rows; export exact counts and unique identity coverage. Do not merge `_768` and `_768_v2` populations.
2. **SEM-INDEX-02 — Qualify source and model provenance.** Require current source/workspace revisions, source digests, canonical packet/chunk identity, and immutable EmbeddingGemma model artifact/revision. Exclude missing or conflicting rows.
3. **SEM-INDEX-03 — Prove bounded parity.** For a frozen sample, verify PostgreSQL-to-Qdrant vector identity/numeric parity and canonical candidate readback; record checksums and failure reasons.
4. **SEM-INDEX-04 — Evaluate retrieval.** Use a frozen query/judgment set and exact PostgreSQL oracle; compare projection results and report Recall@K, latency, and admission success.
5. **SEM-INDEX-05 — Scale only after the canary passes.** Produce a full-corpus coverage receipt. Keep ACE/BitFrost cache use downstream of admitted ContextManifest evidence.
6. **RUNTIME-01 — Refresh WSL and sidecar evidence.** Check the actual WSL RAPIDS interpreter and the live 8098 health/capabilities independently; do not treat installed packages as service wiring.
7. **GPU-01 — Separate executors.** Only after a qualified frozen graph/vector snapshot exists, run CPU reference then GPU parity for the specific cuGraph/cuVS/cuTile operation. No hidden states, KV cache, or raw tensors in stores.

## Validation and mutation boundary

This audit used repository receipts and import-only checks. It did not run a full Svelte check, invoke a live MCP tool, query or mutate PostgreSQL/Qdrant/Redis, write ACE packets, rebuild Graphify, train models, or launch GPU kernels. WSL verification timed out and remains **unverified**, not failed.

`likely_cause`: Navigation inventories, package/import smoke tests, task checkboxes, and fixture proofs were being conflated with end-to-end semantic indexing and live execution.

`evidence`: `docs/reports/semantic-corpus-admission-v1.json`; `docs/reports/current-semantic768-corpus-manifest-plan-v1.json`; `docs/reports/replay-semantic-admission-v1.json`; `docs/reports/openspec-workboard-v1.json`; `docs/reports/python-ml-runtime-inventory-2026-10-13.md`; `docs/reports/atlas-resident-bfs-proof-2026-10-13.json`; `docs/reports/mastra-deepagents-install-20260926.md`; `docs/architecture/atlas-store-ownership-and-derived-representations-v1.md`.

`patch_targets`: `docs/reports/parent-atlas-runtime-and-semantic-index-audit-2026-10-13.md`.

`safe_next_command`: `npm run atlas:docs:toc:check` (navigation integrity only; not semantic-index proof).

`smoke_command`: `node -e "const r=require('./docs/reports/current-semantic768-corpus-manifest-plan-v1.json'); if(r.canonicalAuthority || r.importAllowed) process.exit(1); console.log(r.status, r.qdrantCollectionRoles.liveCorpusSelection)"`.

`report_path`: `docs/reports/parent-atlas-runtime-and-semantic-index-audit-2026-10-13.md`.
