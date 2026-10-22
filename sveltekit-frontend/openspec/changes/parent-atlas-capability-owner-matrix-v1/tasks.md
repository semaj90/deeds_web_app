# Tasks: capability owner matrix (v1)

Status vocabulary: CREATED / WIRED / DRY_RUN_PROVEN / APPLY_PROVEN / NOT_PROVEN / BLOCKED (repo CLAUDE.md).
This change defines owners and gaps. It creates no runtime code and writes nothing outside its own folder.
Spec: `specs/capability-owners/spec.md`. Receipt: `receipt-verify-v1.txt` (exclusive create, read-only).

## Result of the first verification (2026-10-21)

- 24 capability rows. 21 owner files exist, which is CREATED only.
- 3 rows MISSING: NES LUT 256/512 hash map, bit encoding spec, GPU tensor transport (Arrow or mmap).
- GPU MLP backprop is NOT covered by its row. The file it points at is a forward-pass probe, so backprop is MISSING too.
- 1 duplicate: `packet-bitmap.ts` exists in `src/lib/server/cache/` and `src/lib/server/langgraph/cache/`. Both are recorded. Neither is deleted.
- 1 conflict: NES palette values differ between the Node palette and `ace_compiler.py` (8 of 10 domains disagree; see the NES LUT section of the repo CLAUDE.md; no dedicated canonical change exists yet).
- No caller check was run. Nothing is WIRED yet.

## Capability matrix

| # | Capability | Layer | Language | Canonical owner | Status |
|---|---|---|---|---|---|
| 1 | HLL telemetry | CPU | TS | `atlas/telemetry/atlas-hll-telemetry.ts` | CREATED (no consumer) |
| 2 | BitFrost cache | CPU | TS | `ai/bitfrost-hot-vector.ts` | CREATED |
| 3 | OaK enrichment | CPU | TS | `atlas/agentic/oak-query-enrichment-v1.ts` | CREATED |
| 4 | OaK kernel | CPU | Python | `python/atlas_oak_kernel.py` (:8095) | CREATED |
| 5 | Top-k paginated | CPU | TS | `retrieval/topk-paginator.ts` | CREATED |
| 6 | Top-k inverse | CPU | TS | `graph/phase109a-inverse-lookup.ts` | CREATED (one file, partial) |
| 7 | PageRank GPU | GPU | TS over cuGraph | `graph/cugraph-pagerank-adapter.ts` | CREATED |
| 8 | PageRank CPU oracle | CPU | Python | `python/parent_atlas_networkx_pagerank.py` | CREATED |
| 9 | PCA and SVD | CPU | Python | `python/freeze_pca_svd_basis_v1.py` | CREATED (no GPU path) |
| 10 | Ornith tool loop | CPU | TS | `ai/gemma4-tool-controller.ts` | CREATED |
| 11 | HMM tool selection | CPU | TS | `retrieval/hmm-tool-selector.ts` | CREATED (challenger) |
| 12 | MCP tool selection | CPU | Node | `scripts/atlas/runtime-mcp-tool-selector.mjs` | CREATED (tool_manifest empty) |
| 13 | Packet bitmap | CPU | TS | `cache/packet-bitmap.ts` | CREATED (DUPLICATE, see below) |
| 14 | Feature matrix | CPU | TS | `ace/ranking/packet-feature-matrix.ts` | CREATED |
| 15 | Semantic RPC | CPU | TS | `ace/transport/semantic-rpc.ts` | CREATED |
| 16 | NES LUT (palette) | CPU | Node | `scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs` | CREATED (conflicts with #17) |
| 17 | NES LUT (ACE palette) | CPU | Python | `python/parent_atlas_learning/ace_compiler.py` | CREATED (DUPLICATE, conflicts with #16) |
| 18 | NES LUT 256/512 hash map | CPU | — | none | MISSING |
| 19 | Bit encoding spec | CPU | — | none | MISSING |
| 20 | GPU tensor transport (Arrow IPC or mmap) | GPU | — | none | MISSING |
| 21 | GPU MLP backprop | GPU | Python | none (forward probe only) | MISSING |
| 22 | Graph-Qdrant alignment | CPU | TS | `atlas/graph/graph-qdrant-fanout-alignment.ts` | CREATED |
| 23 | Ranking CPU/GPU alignment | GPU | Python | `python/prove_ranking_cpu_gpu_alignment_v2.py` | CREATED (needs parity receipt) |
| 24 | Synthesis (Ornith, :8090) | GPU | llama-server | external process, not a repo owner | CREATED (verify live) |

## Tasks

- [x] **M1 Define the matrix** — 24 rows above, each with one canonical owner or MISSING.
- [x] **M2 Existence check** — read-only, receipt `receipt-verify-v1.txt`.
- [x] **M3 Caller check (WIRED gate)** — completed 2026-10-21 for all 21 existing owners (see results below) — for every CREATED row, find at least one non-test importer under `src/` or `scripts/` (ripgrep with a file-name pattern, timeboxed). Record the importer path. No importer means the row stays CREATED.
  - Partial run 2026-10-21 (timeboxed, 10 of 21 owners):
    - WIRED (non-test importer found): OaK enrichment (`routes/api/search/hyperrag/+server.ts`), cuGraph PageRank adapter (`graph/graph-analysis-runner.ts`), HMM tool selector (`runtime-registry.ts`, `routes/api/tools/search/+server.ts`), semantic RPC (`ace/index.ts`), feature matrix (`atlas/atlas-index.ts`), Ornith tool loop (`ai/dev-context-planner.ts`).
    - Scripts only: BitFrost hot vector (imported only by `scripts/atlas/` audit scripts; no runtime importer found in `src/`).
    - CORRECTION 2026-10-22 (M4 reframed): the two `packet-bitmap.ts` files are NOT duplicates. They share a filename but export different contracts. `cache/packet-bitmap.ts` exports `PacketBitmapCache`, imported only by `telemetry/bitmap-telemetry.ts`. `langgraph/cache/packet-bitmap.ts` exports `getPacketBitmapProvider`, `bitmapGateNotConfigured` and the gate result types, imported only by `langgraph/dispatcher-nodes/node-bitmap-gate-scoring.ts`. Migrating either consumer to the other file would break it. Recommendation: rename to distinct names (a rename, not a deletion) and record both owners. No import migration.
    - Earlier note (superseded): the two copies were listed as a duplicate with both imported. `langgraph/dispatcher-nodes/node-bitmap-gate-scoring.ts` imports one copy, `retrieval/packet-bitmap-prefilter.ts` imports the other. Resolve under M4 before either copy is removed.
    - Test-only: top-k paginator (`topk-paginator.spec.ts` is its only importer).
    - No non-test importer: HLL telemetry (confirmed unwired).
    - Second pass, remaining owners:
      - WIRED: OaK kernel (`oak-resolution-evidence-client.ts`, admin ontology page); NetworkX PageRank oracle (`pagerank-analysis-adapter.ts`, `compute-pagerank-networkx.mjs`); MCP tool selector (`src/mcp/server.ts`, `routes/api/acp/tools/+server.ts`); graph-Qdrant alignment (`fanout-admission-v1.ts`).
      - Probably wired, verify the import: Phase 109a inverse lookup (referenced by `db/neo4j-client.ts`).
      - Scripts only: NES Node palette (`audit-lowrank-hll-radix-cugraph-toc-v1.mjs`); ACE Python palette (`prove-episode-group-v1.py`, package `__init__.py`).
      - Probe chain only: GPU forward probe (`atlas_gemma_rank_cuda_*` probes import each other; no runtime caller).
      - No non-test caller: PCA and SVD basis (`freeze_pca_svd_basis_v1.py`), ranking CPU/GPU alignment (`prove_ranking_cpu_gpu_alignment_v2.py`).
      - Synthesis (#24) is an external llama-server process and has no repo caller to check.
- [ ] **M4 Duplicate resolution (decision)** — for #13 and #17 record which copy is canonical, with evidence. Archive, never delete. Decision needed from the operator.
- [ ] **M5 NES canonical LUT (decision)** — choose the palette (#16 or #17), then design the 256/512 hash map (#18). Blocked until the operator decides which palette is canonical.
- [ ] **M6 Bit encoding spec (#19)** — write a spec with bit width, layout, endianness and checksum. Blocked on M5 for the byte mapping.
- [ ] **M7 GPU tensor transport (#20)** — define Arrow IPC or mmap, with a CPU reader as oracle. Parity receipt required before DRY_RUN_PROVEN.
- [ ] **M8 GPU MLP backprop (#21)** — define a training step with a CPU oracle and a bounded GPU run. Parity receipt required. Keep under about 1 GiB of VRAM while Ornith is running on :8090.
- [ ] **M9 MCP tool_manifest (#12)** — populate, or record the registry fallback as the accepted state. Read-only audit first.
- [x] **M11 Offline artifact chain spec (#20)** — written in `specs/offline-artifact-chain/spec.md`: index → CouchDB reduce → Arrow IPC → RPC descriptor, 64-byte alignment, SHA-256 checksums, CPU oracle, no bulk writes outside the offline job. Status: CREATED.
- [ ] **M12 Chain job (not written)** — one offline job that runs the four stages in order and writes a receipt per stage. Blocked until the operator approves the file layout and the CouchDB push gate.
- [x] **M13 Checksum read check** — `scripts/atlas/lib/arrow-artifact-checksum-v1.mjs` (`verifyArtifactChecksum`) hashes the whole file and refuses on mismatch, with no partial read. `arrow-artifact-checksum-v1.test.mjs`: 5/5 pass (`node --test`), covering match, corrupted file, malformed descriptor, missing file and uppercase hex. Status: fixture-proven. Not yet called by any reader, so not WIRED.
- [x] **M15 Fixture execution replay and manifest** — `scripts/atlas/offline-execution-replay-v1.mts` runs validate → Arrow IPC write → independent read-back (M13 checksum) → msgpack RPC descriptor → token-budgeted ContextManifest, then writes `execution-manifest.json` under `reports/offline-replay/<run_id>/` (exclusive create, no store writes). Normal run: `COMPLETED`, 6/6 processed. `--corrupt` run: `BLOCKED` at `ARROW_READBACK` (`CHECKSUM_MISMATCH`), 0 processed, 6 failed. Fixture data only; `canonicalAuthority:false`. Graph and workspace revisions are fixture values, so the run does not prove Graphify admission. Status: fixture-proven, not WIRED to production data.
- [ ] **M14 DuckDB overlap (decision)** — `packages/atlas-duckdb` already runs an offline analytics stage with read-only PostgreSQL attach and Parquet export for Python training. The chain spec uses Arrow IPC. Decide whether DuckDB exports Arrow IPC too, or stays on Parquet and the chain keeps Arrow IPC for mmap reads. Not decided here.
- [~] **M10 HLL telemetry receipt and consumer (#1)** — Status: WIRED, not PROVEN.
  - Shared contract: `scripts/atlas/lib/deep-audit-telemetry-receipt-v1.mts` (one schema for writer and consumer). `z.strictObject` rejects unknown fields. Authority is split: `receiptFilesCreated` (one receipt file, authorized) versus `writesPerformed` (valkey, postgres, qdrant, neo4j must all be false).
  - Writer `scripts/atlas/deep-audit-hll-telemetry-v1.mts` creates the receipt with an exclusive create, then validates it with the shared contract, and exits 1 with `TELEMETRY_RECEIPT_INVALID` on failure. The writer is the only executable deep-audit owner in the repo; the deep-audit command is a markdown spec, not a runner.
  - Writer run on the probe graph: `VALIDATED`, receipt `reports/deep-audit/telemetry/telemetry-2026-10-22-18a98f5a4d.json`, SHA-256 `c559a459…8542`, validator `deep-audit-telemetry-receipt-v1@1`.
  - Boundary tests `scripts/atlas/lib/deep-audit-telemetry-receipt-v1.test.mts`: 13/13 pass (`node --import tsx --test`). They cover the writer output, deterministic counts, a bad calendar date, namespace, hash, count, unknown field, write flag, canonical flag, two created files, a missing receipt, an empty set, and no silent substitution.
  - Legacy receipts `telemetry-2026-10-21-18a98f5a4d.json` and `telemetry-2026-10-22-5325902f29.json` FAIL under the stricter contract (`writesPerformed:unrecognized_keys`, the old `files` field). They are kept, not edited or deleted, and are superseded by the new receipt.
  - Not PROVEN: no independently checked execution receipt yet, and the deep-audit gate set does not yet call the writer. The consumer CLI is WIRED to the shared contract. — wire a deep-audit telemetry consumer. Must not touch the canonical `AtlasEvent` contract.

## CPU and GPU language per capability

- **CPU, server:** TypeScript (SvelteKit server, `src/lib/server`). Python for numerical CPU work (PCA, SVD, NetworkX oracle, OaK kernel). Node `.mjs` for scripts.
- **GPU:** Python with PyTorch CUDA and XGBoost CUDA (`device="cuda"`) where available. cuGraph through the WSL RAPIDS environment (`atlas-rapids-cu13`, Python). WGSL in the browser (oracle only). llama-server on :8090 for synthesis (GPU, process boundary).
- A GPU result is promotable only after a CPU oracle produces the same result within a stated tolerance.

## Gates to run against this change

- G-OWN: each row has one canonical owner or is MISSING. Pass if no row names two canonical owners.
- G-EXIST: owner files exist. Pass on the 21 existing rows. Receipt done (M2).
- G-WIRED: at least one importer per CREATED row (M3). Not run yet.
- G-PARITY: GPU rows (#7, #20, #21, #23) need a CPU oracle receipt. Not run yet.
- G-READONLY: no writes outside this folder. The M2 receipt confirms this.

## Milestone results (2026-10-22, execution receipts)

Format: task_id · state · source_revision · input_sha256 · output_sha256 · tests · writes · blockers · receipt_path.
Fixture data only. Every item below stays below PROVEN unless its line says otherwise.

| task_id | state | source_revision | input_sha256 | output_sha256 | tests | writes_performed | blockers | receipt_path |
|---|---|---|---|---|---|---|---|---|
| M10 telemetry consumer and writer | WIRED (not PROVEN) | fixture-src-1 (probe graph, workspaceRevision null) | probe sha256 in receipt | receipt c559a459…8542 | 13/13 boundary tests | run-scoped receipt file only | no independent execution receipt; gate runner does not call the writer | reports/deep-audit/telemetry/telemetry-2026-10-22-18a98f5a4d.json |
| M13 Arrow admission (Phase B) | CREATED + fixture-proven | fixture-src-1 | per fixture | n/a | 9/9 admission tests, 5/5 checksum tests | none | not yet called by any production reader | scripts/atlas/lib/arrow-artifact-admission-v1.mjs |
| M12 fixture offline chain (Phase C) | fixture PROVEN for the chain only | fixture-src-1 | b2cd64ca…6292 | execution-manifest 7be92810…68 · artifact 24018918…baa · descriptor 9eb5c06b…44d0 · context 5792fc65…b638 | normal COMPLETED 6/6; corrupt BLOCKED 0/6 (READBACK CHECKSUM_MISMATCH) | .tmp/atlas/offline-pipeline/<run-id>/ only; no CouchDB, Valkey, Postgres, Qdrant, Neo4j or canonical graph writes | not wired to production data; graph and workspace revisions are fixture values | .tmp/atlas/offline-pipeline/pipe-2026-10-22T00-39-18-369Z-cd198c1f/ |
| M4 packet bitmap | open, reframed | n/a | n/a | n/a | n/a | none | not duplicates: two different contracts (see M4 correction above) | sveltekit-frontend/src/lib/server/{cache,langgraph/cache}/packet-bitmap.ts |
| M5 NES palette | open, blocked on semantic approval | n/a | n/a | n/a | n/a | none | 8 of 10 domains disagree (table below) | n/a |
| M14 DuckDB overlap | open, decision | n/a | n/a | n/a | n/a | none | Parquet for analytics and training; Arrow IPC optional for runtime artifacts (recommendation, not yet approved) | n/a |
| Graphify currentness | blocked | n/a | canonical and probe rows differ | n/a | duplicate analysis only | none (read-only) | workspaceRevision null in both graphs; no lifecycle receipt; no promotion | see duplicate analysis below |

### M5 palette discrepancy (Node nesHex vs ACE python byte)

| domain | Node `nesHex` | ACE `byte` | agree |
|---|---|---|---|
| auth | 0x16 | 0x16 | yes |
| ui | 0x2A | 0x2A | yes |
| retrieval | 0x21 | 0x1A | no |
| network | 0x2C | 0x21 | no |
| database | 0x12 | 0x28 | no |
| cache | 0x27 | 0x2C | no |
| agent | 0x24 | 0x14 | no |
| graph | 0x1A | 0x24 | no |
| ml | 0x14 | 0x11 | no |
| general | 0x0F | 0x20 | no |

Also: the Node palette has `lutByte` 0x00–0x09 (a different field). The DB table `atlas_nes_lut_v1` copies the Node `nes_hex` values. Selecting a canonical mapping needs a reviewed semantic decision, not a test.

### Graphify duplicate analysis (read-only)

- Canonical graph (2026-10-17): 34,183 rows, 27,323 distinct `rel`, 6,860 duplicated paths. All duplicate groups are identical rows.
- Probe graph (2026-10-21): 35,237 rows, 26,519 distinct `rel`, 7,002 duplicated paths. All identical. Some paths repeat 135 times (e.g. `.vscode/extensions/mcp-context7-assistant/src/mcpServerManager.ts`). The walker revisits paths and also scans outside `sveltekit-frontend/src`.
- Earlier "117 duplicates" was the `src`-prefix count (6,456 rows vs 6,339 distinct). This is a different number for a different slice.
- Neither graph carries `workspaceRevision`. Promotion stays blocked until identity and coverage are qualified, and a lifecycle receipt exists.

## ENR milestone record (2026-10-22, from the enrichment review)

| task_id | state | evidence | writes_performed | blockers |
|---|---|---|---|---|
| ENR-03 pure assembler (read-only) | fixture-proven, not WIRED | extended `src/lib/server/atlas/context/context-evidence-assembler-v1.ts` (existing prototype, not a second assembler); Vitest 15/15 pass | 0 (`writesPerformed: 0`, `canonicalAuthority: false`) | no production caller; `AtlasRevisionSet` not in this repo; no evidence-text compilation |
| ENR-01 Svelte AST 8095 HTTP 500 | unverified | not run | none | needs a live 8095 request |
| ENR-02 AST writer and readback | BLOCKED | not started | none | needs write authorization |
| ENR-04 to ENR-07 | not started | n/a | none | depends on ENR-03 wiring and tokenizer |

Facts from the review checked locally:
- `context-evidence-assembler-v1.ts` exists and was already a prototype. The review's claim that no assembler exists is wrong for this checkout.
- A `context-manifest.ts` file with `buildContextManifest()` was not found under `src/lib/server/atlas` by exact name. Manifest owners present: `context/context-manifest-prompt-plan-v1.ts`, `graph/context-manifest-v2.ts`, `graph/context-manifest-v2-readback-contract-v1.ts`, `tensors/context-manifest-traversal-adapter-v1.ts`. Which of these is the V1 owner needs confirming before any integration.
- `AtlasRevisionSet` (workspace, source, graph, feature) was not found in this checkout, so it can't be reused yet.
- The review's 4-token-per-chunk estimate (`estimateEntryTokens` at 3 characters per token) was not found by name here.

Added this round: `kind` is required (missing = rejected), AST needs producer revision and a valid byte span, edges need producer revision, a snapshot option rejects stale joins, unresolved taxonomy is reported and never accepted, and the result reports zero writes.

## ContextManifest owner (confirmed 2026-10-22, read-only)

- V1 schema owner: `src/lib/server/atlas/graph/graph-runtime-contracts.ts`, `ContextManifestV1Schema` (`schema: 'atlas.context-manifest.v1'`). Keep it unchanged for existing consumers.
- Consumers of V1: `context/ace-context-manifest-admission-v1.ts`, `context/ace-packet-v3-context-manifest-bridge-v1.ts`, `cache/bitfrost-token-fsm-v1.ts`.
- V2 (CM-02): `graph/context-manifest-v2.ts` builds on V1 and adds ordered selection checksums. It is the materialized-manifest candidate named by the review.
- Prompt plan: `context/context-manifest-prompt-plan-v1.ts`, `buildManifestBoundPromptPlanV1`.
- Not found: a `buildContextManifest()` function and any producer of `atlas.context-manifest.v1` objects in `src/lib/server/atlas`. The V1 contract has consumers but no producer in this checkout.
- Integration point (proposed, not wired): the ENR-03 assembler output feeds a V2 manifest producer, which then feeds the existing V1 consumers through the ACE packet v3 bridge. Wiring it is a production change and needs a decision.

## ENR-01 result (2026-10-22, read-only probe)

- Probed `POST http://127.0.0.1:8095/ast/chunk` with `LLMSelector.svelte` (svelte), `context-evidence-assembler-v1.ts` (typescript) and an unknown language. All three returned HTTP 200 in under a second. The reported "Svelte AST 8095 HTTP 500" did not reproduce for this file and request shape.
- Svelte response: `scan_completeness: COMPLETE`, 9 chunks, 8 edges. Diagnostics are informational only (`CONSILIENCY_LF_BYTE_SPAN_REMAPPED`).
- FAIL-OPEN BUG found: an unsupported language returned `scan_completeness: COMPLETE` with 0 chunks and `UnsupportedLanguageError` only in diagnostics. A downstream consumer would treat an empty scan as complete.
- Fix applied: `python/miniforge_nlp_sidecar_v2.py` `_native_ast_evidence` (language-error branch) now sets `scan_completeness="PARTIAL_AST_FAILED"` and `scan_failure=<language error>`. Verified by calling the function directly under Windows Python 3.13: returns PARTIAL_AST_FAILED.
- Regression test appended: `python/test_miniforge_nlp_sidecar_v2_revision.py::test_unsupported_language_is_partial_not_complete`, passes. The file's other 9 tests pass; `test_ast_chunk_http_route_accepts_large_source` fails with `Client.__init__() got an unexpected keyword argument 'app'` (httpx/Starlette TestClient mismatch, pre-existing, not caused by this change).
- NOT yet live: the running 8095 container still serves the old code until the sidecar is restarted or rebuilt. That needs an operator decision.
- `python/miniforge_nlp_sidecar.py` (v1, non-live) has the same unsupported-language pattern at its `UnsupportedLanguageError` branch (around line 3236–3259). Not changed in this pass.

## Engineering corpus Phase 1 (partial, read-only, 2026-10-22)

- Grammars: the sidecar's tree-sitter language pack exposes 167 languages (`SupportedLanguage`, read inside the container). This is a grammar list, not a claim that each language is covered by a parser test or an LSP.
- LSP servers installed in `sveltekit-frontend/node_modules`: `typescript-language-server`, `svelte-language-server`, `vscode-langservers-extracted`. `@sveltejs/language-tools` is absent. No LSP was found for most of the 167 grammars.
- Domain taxonomy: `domain_taxonomy_v1` has 17 rows.
- Concepts and entities: all concept and entity tables are empty (see the duplicate-table review).
- Not done: GitHub Linguist comparison, per-language capability matrix, documentation source registry (Phase 2), ontology combiner (Phase 3), subhelpers (Phase 4), validation fixtures (Phase 5).
- Gap to note: the request said "140 languages"; the installed grammar pack has 167 entries. The two numbers come from different sources and are not reconciled.

## Handoff (2026-10-22)

### Where things stand
- Milestones M3, M10, M11, M13, M15 and the fixture chain (M12 Phase C) are recorded above. Only fixture-level proof exists; nothing is PROVEN in production.
- Live sidecar `:8095` (container `miniforge-nlp-sidecar`, Linux, Python 3.13.15) was restarted on 2026-10-22. Both sidecar fixes are live: unsupported language returns `PARTIAL_AST_FAILED`, and the provider revision reports `tree-sitter=0.25.2` and `tree-sitter-language-pack=0.9.0`. Package list unchanged (234 lines).
- ENR-03 assembler extended (existing prototype). ENR-01 probe: the reported Svelte 500 did not reproduce.
- Engineering corpus Phase 1 is partly done (grammars and LSPs recorded above). Phases 2 to 5 have not started.

### How to verify (all read-only or under `.tmp`)
- `node --test scripts/atlas/lib/arrow-artifact-checksum-v1.test.mjs scripts/atlas/lib/arrow-artifact-admission-v1.test.mjs` → 14/14
- `cd sveltekit-frontend && node --import tsx --test ../scripts/atlas/lib/deep-audit-telemetry-receipt-v1.test.mts` → 13/13
- `cd sveltekit-frontend && npx vitest run src/lib/server/atlas/context/context-evidence-assembler-v1.test.ts` → 15/15 (if it hangs at `RUN`, stop the process and rerun alone)
- `cd sveltekit-frontend && npx tsx ../scripts/atlas/offline-execution-replay-v1.mts` → `COMPLETED` (writes `.tmp/atlas/offline-pipeline/<run-id>/`)
- Live: `curl -s -X POST http://127.0.0.1:8095/ast/chunk ...` with an unsupported language → `PARTIAL_AST_FAILED`
- Known env issue: `python/test_miniforge_nlp_sidecar_v2_revision.py::test_ast_chunk_http_route_accepts_large_source` fails with a TestClient `app` argument mismatch (pre-existing).

### Open decisions (need the operator)
1. M4: rename the two `packet-bitmap.ts` files (they are different contracts, not duplicates). No import migration.
2. M5: canonical NES palette. Node vs ACE disagree on 8 of 10 domains (table above).
3. M14: DuckDB format. Recommendation: Parquet for analytics and training; Arrow IPC optional for runtime artifacts.
4. Taxonomy: `domain_taxonomy_v1` vs `atlas_domain_ontology` (same 17 IDs; different metadata; no writer found for `domain_taxonomy_v1`).
5. Concept and entity tables: both pairs are empty. Choose canonical before populating.
6. Graphify: the canonical graph is stale (2026-10-17). Probe has identical duplicate rows (walker revisits paths, scans outside `src`). No promotion until identity, coverage and a lifecycle receipt exist.

### Not started / blocked
- Engineering corpus Phases 2 to 5 (documentation registry, ontology combiner, Top-K subhelpers, validation fixtures).
- Linguist comparison: the local search timed out, so existence is unknown. Fetching the official list needs approval.
- M12 production: needs file-layout approval and the CouchDB publishing gate (kept disabled).
- M13 wiring: the admission gate has no production caller yet.
- ENR-02 (AST writes) needs write authorization. ENR-04 to ENR-07 depend on ENR-03 wiring.
- v1 sidecar `python/miniforge_nlp_sidecar.py` has the old unsupported-language pattern. Not live on the `/ast/chunk` route; still imported by the synthesis router and by tests.

### Gotchas
- Live sidecar code comes from the bind-mounted `python/` folder, but the process loads it only on restart. Restart with `docker restart miniforge-nlp-sidecar`; do not rebuild.
- The sidecar checks `sourceRevision` against the source bytes (sha256). A wrong hash returns 422 `SOURCE_REVISION_MISMATCH`.
- Telemetry receipts `telemetry-2026-10-21-18a98f5a4d.json` and `telemetry-2026-10-22-5325902f29.json` fail the stricter contract. Kept, not edited.
- `rg` over the whole `sveltekit-frontend` tree times out; use path-scoped searches.
- Editor diagnostics for `scripts/*.mts` (missing Node types) are editor-only; `tsx` runs fine.
- Tree-sitter (TypeScript lane, Node) and `treesitter-chunker` (Python lane, sidecar) are separate owners.
- Per the request, no production writes, no CouchDB publishing, no GPU executors, and no canonical graph promotion without separate approval.

### Next actions (in order)
1. Operator decisions 1–6 above.
2. Confirm or fetch the Linguist language list (needs approval for network).
3. Start Phase 2 (official documentation source registry) in a fresh session, using this file as the starting point.
