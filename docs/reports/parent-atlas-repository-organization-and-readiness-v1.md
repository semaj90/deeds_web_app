# Parent Atlas Repository Organization and Readiness Audit

**Snapshot:** 2026-10-15

**Scope:** Repository organization and the requested Parent Atlas development path: AST/semantic observations, JSON/MessagePack/RPC transport, packet identity, Top-K retrieval, multi-hop graph traversal, SOM/KMeans, LangExtract on `:8095`, GPU/cache/LUT experiments, ACE/ContextManifest, and kanban/workboard integration.

**Mode:** Read-only source, schema, task-ledger, and existing-report inspection. No services were started, no Graphify refresh was run, and no database, cache, vector, graph, model, or source writes were performed.

## Executive Finding

The repository has ample implementations and experiments, but they are spread across application code, packages, scripts, OpenSpec changes, generated reports, ignored snapshots, and local dependency environments. The main blocker is not another directory or another index: it is proving the handoffs and source identity across one bounded request.

Use one flow:

```text
source bytes
  → language-specific CST/AST and extraction observations
  → PostgreSQL-qualified symbol / packet / chunk identity
  → lexical + semantic + optional structural candidate lanes
  → SearchRuntime normalization, dedupe, single Top-K/RRF owner
  → optional advisory topology/KMeans/rerank
  → exact evidence check and ACE/ContextManifest
  → bounded agent action proposal / approval / execution receipt
```

JSON, MessagePack, gRPC, HTTP, and MCP are transport or interface choices in that flow. They do not create identity, improve retrieval quality by themselves, or authorize writes. Graph, GPU, cache, and LUT results remain derived projections.

## Inventory Counts and Scope

| Measure | Observed | Interpretation |
|---|---:|---|
| Physical directories directly under repository root | 139 | Includes source, tooling, local environments, caches, model/data folders, generated artifacts, and nested repositories. Not all are product code. |
| Git-tracked file paths | 34,731 | Includes docs, tests, OpenSpec, generated/legacy material, and source. This is not a count of runtime files. |
| Parent Atlas OpenSpec change directories | 92 | Parallel/historical change folders exist; they are not 92 active production workstreams. |
| Installed dependency files under `node_modules` / Python environments | Not enumerated | Excluded from the tracked-source count and from code-corpus relevance. Their package manifests/lockfiles are the dependency inventory. |

The root directory count is exact for this checkout at audit time. This report classifies the requested product path and major storage areas; it is not a claim that every one of the 34,731 tracked paths was manually reviewed.

### Directory groups

| Group | Main directories | Use / treatment |
|---|---|---|
| Product runtime | `sveltekit-frontend`, `packages`, `services`, `python`, `simd-bridge`, `proto`, `docker` | Primary application, contracts, service, and executor sources. Search these first for implementation. |
| Build/test/development | `scripts`, `tests`, `__tests__`, `.github`, `.vscode`, `native`, `crates` | Build orchestration, tests, CI, local tasks, and optional native executors. Classify by actual caller/test, not directory name. |
| Specs and operational evidence | `openspec`, `docs`, `reports`, `next_steps`, `memory` | OpenSpec task ledgers are claims; docs are navigation/design; reports are evidence snapshots of varying freshness. |
| External or nested projects | `claude-mem`, `models`, `granite-docling-258M`, `parent-atlas-*` bundles, `triton-*`, `vendor` | Separate repos, models, vendor sources, or experiments. Do not fold them into the application source index by default. |
| Local/generated/ignored | `.tmp`, `.cache`, `.svelte-kit`, `.venv*`, `.python311`, `.pytest_cache`, `node_modules`, `graphify` snapshots | Keep out of normal `rg` and semantic indexing. Inspect only by exact artifact path when a proof or dependency question needs them. Archive/retain under repository policy; do not bulk-delete. |

## Classification Parameters

Apply these parameters consistently to files, directories, and claims.

### 1. File and directory size

| Band | Threshold | Treatment |
|---|---:|---|
| Normal source | <100 KiB | Standard review and test path. |
| Large source/artifact | 100 KiB–10 MiB | Record size and generated-vs-authored status; review before indexing or committing. |
| Oversized artifact | >10 MiB | Keep out of broad source search, semantic ingestion, and routine commit scope unless specifically required. Preserve existing artifacts. |
| Snapshot-scale | >100 MiB | Do not parse during general repo analysis. Require an exact input checksum, explicit consumer, and bounded query/streaming strategy. |
| Dependency tree | >100 files per installed package | Treat as third-party dependency, not authored corpus. Use package name/version, lockfile, license/SBOM and dependency audit; do not index its files as Atlas knowledge. |

The >100-file dependency rule is a relevance rule, not an instruction to count or crawl every installed dependency. File bytes, installed package count, and product relevance are separate measures.

### 2. Relevance score

| Score | Meaning |
|---:|---|
| R3 | Active owner on the requested request path, with a demonstrated caller. |
| R2 | Direct prerequisite, schema, test, receipt, or explicit operational dependency. |
| R1 | Experiment, historical report, generated projection, proposal, or compatibility path. Useful only for a named comparison. |
| R0 | Installed dependency internals, build output, cache, unrelated nested project, or stale artifact without a current consumer. Exclude from routine indexing. |

Do not infer R3 from `rg` match count, code existence, import presence, directory name, generated Graphify edges, or a checked task box alone.

### 3. Readiness state

| State | Requirement |
|---|---|
| `CREATED` | Source/schema/script exists. |
| `WIRED` | Actual application path calls it with the expected contract. |
| `TESTED` | Focused deterministic test or controlled fixture passes. |
| `COMPONENT_LIVE` | Current bounded live service/executor call and receipt exist. |
| `VERTICAL_PARTIAL` | Some handoffs are evidenced; at least one identity, lineage, admission, or readback boundary is missing. |
| `PRODUCTION_QUALIFIED` | Current live request, revision-qualified identity, operational resource limits/fallback, authorization, durable receipt, and independent readback all pass. |

`CREATED`, `TESTED`, and old live observations must never be summarized as production completion.

## Requested Pipeline Readiness

| Stage | Existing owner(s) | Development/test evidence | Production assessment | First qualification gap |
|---|---|---|---|---|
| AST/CST and language routing | 8095 NLP sidecar; `svelte/compiler` Svelte splitter; AST-grep; Tree-sitter paths | Source and focused parser/cross-check reports exist. Prior architecture report records rune/handler cross-checks for a bounded Svelte cohort. | `VERTICAL_PARTIAL` | Parser output must join exact canonical source bytes, symbol/version and packet/chunk identities. AST parser observation alone is not canonical identity. |
| Function registry and symbol identity | `atlas_symbol_registry`, `atlas_symbol_versions`, Function Registry snapshot loader and qualifier | Schema, loader, validation and focused tests exist. | `VERTICAL_PARTIAL` | Live source/symbol/AST/packet/chunk crosswalk and exact source-revision agreement are not proven for a broad cohort. |
| Semantic vectors | PostgreSQL canonical `semantic_768`; EmbeddingGemma; Qdrant projection; Go Retrieval executor | Existing schema, HNSW and executor contracts are present. | `PARTIAL` | Current eligible row/revision coverage, model recipe/checksum parity and one live joined request need receipt-backed verification. |
| Lexical + Top-K/RRF | PostgreSQL FTS/GIN and existing lexical providers; `SearchRuntime` | SearchRuntime and retrieval tests/contracts exist. | `VERTICAL_PARTIAL` | Prove candidate normalization and exact identity survive final Top-K for a current qualified source; keep one fusion owner. |
| Multi-hop graph | Graphify/Neo4j/NetworkX/cuGraph projections and traversal helpers | Frozen algorithm parity and traversal experiments exist. | `NOT PRODUCTION QUALIFIED` | A current source-bound graph snapshot with useful reference edges and candidate-to-source bindings is required. Frozen parity data is not live authority. |
| SOM/KMeans/low-rank | Feature/topology projections; Python/WSL2 RAPIDS/cuML/cuVS challengers | Scripts and experimental contracts exist. | `NOT PRODUCTION QUALIFIED` | Frozen eligible cohort, train/eval split, CPU oracle parity, Recall@K, latency, memory, and projection lineage are not established together. No learned score becomes authority. |
| LangExtract / 8095 | FastAPI/NLP sidecar and extraction helpers | Sidecar and parser/extraction contracts are present; old/live observations are recorded in reports. | `COMPONENT_LIVE` only when a current receipt proves it; otherwise `NOT_VERIFIED` | Preserve exact byte spans, typed evidence, source revision, cancellation/bounds, and downstream consumer receipt. This audit did not probe the service. |
| JSON / MessagePack / RPC | JSON schemas, MessagePack packet/binary paths, gRPC/HTTP/MCP adapters | Multiple transport implementations and contracts exist. | `NOT PRODUCTION QUALIFIED` as a unified path | Demonstrate one producer→consumer request with schema validation, bounded payload, identity/revision fields, retry/idempotency and independent receipt. Serialization format is not the admission gate. |
| ACE packet / ContextManifest | ACE packet assembly, `AcePacketV3`, `ContextManifestV2` | Fixture/bridge tests and packet assemblers exist; architecture index reports prior focused fixture passes. | `VERTICAL_PARTIAL` | A current selected candidate set must pass exact packet/chunk/source checks, tokenization/budgeting, manifest assembly, synthesis citation verification and readback. |
| GPU/RTX/cache/LUT | Native LibTorch/N-API probes; WSL2 RAPIDS/cuVS; BitFrost residency; ordinal maps | Bounded native/fixture receipts exist in prior reports; cache/ordinal contracts exist. | `EXPERIMENTAL / NOT E2E` | Verify correct live executor, bounded GPU memory and transfer, cold/warm/resident distinction, source-bound ordinal map and CPU fallback. Do not treat lookup code or GPU availability as a production speedup. |
| Recommendation / agentic workflow | Existing recommendation engine/workflow, HMM routing, MCP tools, DAG and repair-loop owners | Scripts, schemas, tests and OpenSpec plans exist. | `PARTIAL` | Reviewed relevance/outcome labels, frozen evaluation, one planner/state owner, approval boundary, and bounded execution receipts. Do not auto-learn from unreviewed user signals. |
| Kanban/workboard | OpenSpec `tasks.md`; workboard builder; recommendation-to-kanban adapters | Task ledgers and generated workboard tooling exist. | `WIRED AS REPORTING / NOT SOURCE OF TRUTH` | Keep `tasks.md` authoritative; show each card’s owner, dependency, proof artifact, status, and write capability. Avoid overlapping duplicate boards. |
| Daily Graphify | `sveltekit-frontend` package script → `scripts/startup/run-graphify-daily-startup.mjs` | Script is registered and has Graphify/indexing consumers. | `OPERATIONAL EFFECTS REQUIRE REVIEW` | Script path contains feature-recommendation refresh with `--apply`; do not run for read-only inventory or silently treat it as a cache refresh. |

## Graph and Dependency Artifacts

| Artifact | Current observation | Use decision |
|---|---|---|
| Root `docs/graph/codebase-graph.json` | Tracked; ~25.8 MB; last write observed Aug 30, 2026. Its SHA-256 matched the ignored SvelteKit-path copy at audit. | Existing code references the app-local `sveltekit-frontend/docs/graph/codebase-graph.json` path. Resolve this tracked-vs-ignored path mismatch before treating the graph as a portable build input. |
| `sveltekit-frontend/docs/graph/codebase-graph.json` | Gitignored; same observed ~25.8 MB content/hash as root copy; 2026-08-30 timestamp. | Used by legacy graph tooling/API consumers, but stale relative to this audit date. Diagnostic/compatibility only until rebuilt through its actual owner and revision-bound. |
| `graphify/frozen-graph-snapshot-v2.json` | Gitignored; 486,654,818 bytes; timestamp Aug 8, 2026. | Frozen parity/fixture input, not the current canonical graph. Exclude from general `rg`, indexing, and daily refresh. Use only for named snapshot experiments. |
| `node_modules`, `.venv*`, `.python311`, model/vendor trees | Present as local physical directories; not enumerated as authored source in this audit. | Dependency/build/runtime inventory only. Avoid indexing package internals; use manifests, lockfiles, license and security tools. |

## Organization Rules for Faster Work

1. **One starting index:** Begin with `docs/architecture/runtime-ownership-registry.json`, the focused architecture TOCs, and owning OpenSpec `tasks.md`; do not start by recursively searching every generated folder.
2. **Candidate-first search:** `rg` only `sveltekit-frontend/src`, `packages`, `python`, `simd-bridge`, `scripts/atlas`, `openspec/changes/<owner>`, and selected `docs/reports` receipts. Exclude `node_modules`, `.venv*`, `.tmp`, `.svelte-kit`, `docs/profile-cards`, archives, and frozen graph inputs unless specifically requested.
3. **Separate tracked from ignored:** Use `git ls-files` for versioned source; use `git check-ignore -v <exact-path>` for local-only graphs. Never merge ignored model/dependency data into source corpus statistics.
4. **Use one ledger:** OpenSpec tasks record claims and acceptance evidence; the generated Kanban/workboard is a read projection. Do not copy task status into another authoritative store.
5. **One request slice:** For speed, test one frozen source/symbol candidate end-to-end before expanding cohorts. Record `packetKey`, `symbolVersionId`, `treeNodeId`, `sourceRef`, source/workspace revision, byte span, representation/graph revision, and checksum at every handoff.
6. **Separate cheap CPU checks from GPU runs:** Run parser/schema/identity/Top-K CPU oracle checks first. GPU/cuVS/KMeans are batch challengers; only schedule after input snapshot, VRAM availability, resource cap, parity oracle, and fallback are confirmed.
7. **No routine full Graphify refresh:** `graphify:daily` has apply-capable stages. Use it only as an intentional maintenance operation with a reviewed run plan and receipts, not as an audit or directory-search shortcut.

## Prioritized Gates

| Priority | Gate | Acceptance evidence | Writes |
|---|---|---|---|
| P0 | `REPO-INDEX-PORTABILITY-01` | Resolve tracked/ignored codebase graph path; record producer revision, output digest, freshness and explicit consumers. | Local artifact regeneration only after plan review; no canonical DB writes. |
| P0 | `FUNCTION-SOURCE-CROSSWALK-01` | One symbol’s PostgreSQL owner, 8095/compiler AST observation, packet/chunk, exact bytes/span and revision agree. | Read-only. |
| P0 | `SEARCH-TOPK-ACE-01` | Same candidate survives actual SearchRuntime final Top-K, exact hydration, ACE and ContextManifest with independent readback. | Read-only retrieval/context path; no promotion. |
| P1 | `TRANSPORT-ROUNDTRIP-01` | One bounded RPC/JSON/MessagePack contract replay validates schema, size, identity, idempotency and evidence preservation. | No canonical writes. |
| P1 | `GRAPH-MULTIHOP-01` | Current source-bound reference graph; CPU traversal parity and useful edge coverage before GPU challenger. | Projection only after separate approval. |
| P1 | `RANKER-EVAL-01` | Frozen reviewed labels; lexical/semantic/AST/graph baseline and KMeans/PCA/SVD challenger measured for Recall@K/MRR/nDCG, latency, memory and calibration. | Offline artifacts only. |
| P2 | `GPU-RESIDENCY-01` | Qualified ordinal map, CPU/CUDA parity, transfer/kernel timing, VRAM ceiling, cold/warm/GPU-hit receipts and fallback. | Derived cache/executor state only, after resource approval. |
| P2 | `AGENT-KANBAN-EXECUTION-01` | One planner and task-state writer; approval-gated execution; revision preconditions, idempotency, tests, and append-only outcome receipt. | Bounded approved workspace actions only. |

## Closeout and Limits

- **Implemented:** The repository has owners for AST parsing, function/symbol registries, lexical/semantic retrieval, graph projections, packet assembly, GPU probes, recommendation scripts, and task/workboard generation.
- **Tested:** Focused fixtures and component reports exist; their age and scope vary. This report does not rerun them.
- **Live:** This report performed no service health probes, PostgreSQL query, Qdrant/Valkey/Neo4j access, GPU execution, or end-to-end request.
- **Production:** No claim of production qualification is made. The current acceptance bar requires one exact, revision-bound, readback-verified request and operational controls.
- **Actions deliberately not taken:** no `npm install`, Python imports, `graphify:daily`, Svelte check, test suite, database migration, service restart, model load, graph refresh, bulk indexing, or deletion.

### Evidence paths reviewed

- `docs/architecture/runtime-ownership-registry.json`
- `docs/architecture/_topology_classifier_index.md`
- `docs/architecture/_cuda_rtx_toc.md`
- `docs/architecture/parent-atlas-workstation-compute-fabric.md`
- `docs/parent-atlas-workstation-todo.md`
- `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`
- `openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/tasks.md`
- `sveltekit-frontend/package.json`
- `sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts`
- `scripts/startup/run-graphify-daily-startup.mjs`
- `scripts/atlas/build-openspec-workboard-v1.mjs`
