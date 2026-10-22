# Directory usage and runbook (2026-10-21)

Status legend: TESTED, DIAGNOSTIC, DRY_RUN, APPLIED, READBACK_PROVEN, ADMITTED. Nothing here is ADMITTED. Production writes, Qdrant writes, cache promotion, and training are disabled. Nothing is committed.

## 1. Directory map

| Path | What lives here | Status of its contents |
|---|---|---|
| `sveltekit-frontend/src/` | Application source (6,640 eligible `.ts/.js/.mjs/.svelte` files) | Coverage run in progress; not yet measured |
| `sveltekit-frontend/src/lib/server/atlas/feature-labels/` | Read-only label admin loader and contract tests | Tests pass; no writes |
| `sveltekit-frontend/src/lib/server/atlas/context/` | `ContextEvidenceAssemblerV1` (pure function) and tests | 24/24 tests reported |
| `sveltekit-frontend/src/routes/(app)/admin/feature-labels/` | Read-only admin route | Renders with dev auth bypass; access control not verified |
| `sveltekit-frontend/src/lib/server/db/schema/` | Drizzle declarations, including `atlas-feature-identity.ts` (V2) | Not exported to drizzle-kit |
| `sveltekit-frontend/drizzle/manual/` | Unapplied SQL drafts and rollbacks | `20261021_feature_identity_v2.sql` is the current draft |
| `sveltekit-frontend/scripts/atlas/` | Atlas scripts (embedding writers, audits, backfills) | Several writers; see section 4 |
| `scripts/atlas/` (repo root) | Repo-level Atlas tools, including `verify-single-chain-provenance.mjs` and `pipeline-status-v1.mjs` | Diagnostics |
| `scripts/atlas/lib/` | Shared Atlas libraries, including the AST V2 contract and writer | AST V2 tests 29/29 reported |
| `python/` | Sidecars (`miniforge_nlp_sidecar.py`, v2), CUDA and cuTile probes, the ast-grep guard test | Guard test 4/4 |
| `python/atlas_compute/` | cuDF, cuGraph, and cuVS code; latent autoencoder | Import-level only; no corpus run |
| `services/` | Go services: embedding (:8097), retrieval, search, codeintel | Embedding healthy, CPU |
| `openspec/changes/` | OpenSpec change packages | Coordinating change: `parent-atlas-source-qualified-corpus-admission/` |
| `docs/.okf/pinned/` | Pinned reference docs (SvelteKit, svelte5-runes) | Reference only, not code evidence |
| `docs/.okf/dev/raw/` | Raw doc pages | Reference only |
| `docs/reports/` | Committed receipts and reports | Mixed |
| `docs/repo-analysis/` | `atlas.md` (progress log), this report | Progress entries appended |
| `.tmp/atlas/` | Local receipts and manifests (gitignored) | All receipts in this report live here |
| `.tmp/atlas/sveltekit2-code-analysis/` | Kit code manifest (161 files), AST chunks, symbol and relation proposals, receipt | DIAGNOSTIC |
| `.tmp/atlas/sveltekit2-docs-corpus-analysis/` | Docs manifest, terms, hierarchy, search results, domain proposals | Bounded, not global |
| `.tmp/atlas/symbol-coverage-app/` | Application coverage run output (`per-file.jsonl`, `summary.json`) | In progress (846 of 6,640 at last check) |
| `claude-mem/` | Nested git repo with its own `node_modules` | Excluded from the main repo |
| `docker/` | Compose files, including `docker-compose.gpu.yml` | Runtime config |
| `openspec/changes/parent-atlas-*` | Overlapping responsibility packages (ontology kernel, workspace runtime, ingestion, lineage, ACE/BitFrost) | Consolidate under the coordinating change; do not duplicate |

## 2. Services and ports

| Port | Service | Used for | Notes |
|---|---|---|---|
| 5434 | `legal-ai-postgres` (PostgreSQL 18.4 + pgvector + pg_search) | Canonical truth | Read-only queries only in this round |
| 6333 / 6334 | Qdrant REST / gRPC | Mirror | v2 has 52,816 points; scratch collection `atlas_scratch_content_768_v1` has 1,020 points |
| 6379 | Valkey | Cache | Password-protected; do not use for evidence |
| 8081 | llama-server, EmbeddingGemma F16 GGUF | Embedding parity probe | Read-only use |
| 8090 | llama-server, Ornith 1.5 (chat/tools) | Synthesis | Stop only for a GPU run, after checking `/slots` is idle |
| 8095 | Python NLP and AST sidecar | `/ast/chunk`, `/analyze`, `/pos` | Restart needed to load the ast-grep guard |
| 8097 | Go embedding service | Embeddings (CPU) | Healthy |
| 8788 | TRACE MCP server (TypeScript) | Tool calls for models | Dense search runs here |
| 11434 | Ollama | `embeddinggemma:latest` | Being phased out; keep until replacement is proven |
| 5173 | SvelteKit dev server | Admin routes | Dev auth bypass active |

## 3. Runbook (read-only unless marked WRITE)

### 3.1 Health and state
```
node scripts/atlas/pipeline-status-v1.mjs                       # read-only status receipt
node scripts/atlas/verify-single-chain-provenance.mjs           # read-only chain check (chainIntact: false, QDRANT_POINT_MISSING)
curl -s http://127.0.0.1:8095/health                            # sidecar
curl -s http://127.0.0.1:6333/collections                       # Qdrant
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -At -c "SELECT count(*) FROM codebase_chunk_index"
```

### 3.2 Application coverage (in progress)
```
node .tmp/atlas/symbol-coverage-app/run.mjs     # started; writes per-file.jsonl and summary.json
```
Read `summary.json` for: VALID_SYMBOLS, PROPOSALS_ONLY, NO_EXPECTED_SYMBOLS, EMPTY_SOURCE, PARSER_FAILURE. Threshold is pending (80% vs 90%).

### 3.3 Dependency AST (done)
Receipt: `.tmp/atlas/sveltekit2-code-analysis/receipt.json`. Rebuild only if the kit version changes:
```
# 1) manifest and file hashes (already written)  -> .tmp/atlas/sveltekit2-code-analysis/manifest.json, files.jsonl
# 2) per-file AST chunks                          -> ast-chunks.jsonl
# 3) proposals and receipt                        -> ast-proposals.jsonl, symbol-proposals.jsonl, relation-proposals.jsonl, graph-preview.json, receipt.json
```

### 3.4 Docs corpus (bounded)
Outputs in `.tmp/atlas/sveltekit2-docs-corpus-analysis/`: `manifest.json`, `terms.json`, `hierarchy.json`, `search-results.jsonl`, `search-receipt.json`, `domain-proposals.json`, `domain-receipt.json`. Source: `docs/.okf/pinned/sveltekit/raw/*.md` and `chunks.jsonl` (233 records).

### 3.5 Tests (focused)
```
cd sveltekit-frontend
npx vitest run src/lib/server/atlas/feature-labels/feature-labels.contract.test.ts    # 12/12
npx vitest run src/lib/server/atlas/context/context-evidence-assembler-v1.test.ts     # 4/4 (24/24 reported after guards)
cd ..
MSYS_NO_PATHCONV=1 wsl -d Ubuntu --exec bash -lc "cd /mnt/c/Users/james/Videos/deeds-web-app/python && /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python -m unittest test_ast_grep_language_dispatch -v"   # 4/4
node --test scripts/atlas/lib/atlas-ast-nodes-v2-proposal-contract-v1.test.mjs scripts/atlas/lib/indexed-source-batch-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-independent-readback-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-writer-v1.test.mjs   # 29/29
```

### 3.6 Disposable PostgreSQL 18 (migration validation, no production)
Start a scratch instance (loopback only), apply the draft, test, then remove:
```
docker run -d --name <scratch> -e POSTGRES_PASSWORD=scratchonly -e POSTGRES_USER=scratch -e POSTGRES_DB=scratch -p 127.0.0.1:55xxx:5432 pgvector-pgsearch:pg18-local
docker exec -i <scratch> psql -U scratch -d scratch -v ON_ERROR_STOP=1 < sveltekit-frontend/drizzle/manual/20261021_feature_identity_v2.sql
docker rm -f <scratch>
```
Current V2 result: applies, re-applies, rejects bad rows, concurrency race gives one winner. Rollback not yet run.

### 3.7 Admin route (dev only)
```
cd sveltekit-frontend && npm run dev         # port 5173; dev auth bypass active
```
Playwright probe: rendering and limits pass; authenticated access control not tested.

### 3.8 WRITE operations (need explicit authorization each time; none run)
- Applying any `drizzle/manual/*.sql` to `legal_ai_db`.
- Minting canonical concepts or registering source identities.
- Writing crosswalk decisions or labels.
- Qdrant upserts (including the scratch collection beyond its current 1,020 points).
- Stopping `:8090` for a GPU run.
- Restarting the sidecar on :8095.
- Any backfill (`backfill-codebase-chunk-embeddings.mjs` is fail-closed; do not bypass).

## 4. Writers of `codebase_chunk_index.content_embedding_768`

| Writer | Recipe | Status |
|---|---|---|
| `sveltekit-frontend/scripts/atlas/backfill-codebase-chunk-embeddings.mjs` | raw content (`content`), bulk SET | Fail-closed on `--apply`; the Oct 20 run used a one-off script with the same recipe |
| `sveltekit-frontend/scripts/atlas/apply-lineage-qualified-semantic-768-backfill-v1.mjs` | lineage-qualified (Oct 7) | Guarded; receipts not located |
| One-off `backfill-semantic-768-raw.mjs` (scratchpad, Oct 20) | raw | Wrote 274,428 vectors total; report in scratchpad |

Tag reality: the 2,654 rows labelled `:eg-task-prefix-v1` reproduce the raw recipe (median cosine 0.99998), not title-and-text (0.89). The tag is misleading.

## 5. Identity and label drafts

| File | Role | Status |
|---|---|---|
| `drizzle/manual/20261021_feature_identity_v2.sql` | Current draft: concepts, source identities, crosswalk, labels, views | Disposable-proven |
| `drizzle/manual/20261021_feature_identity_v2.rollback.sql` | Refuses to drop populated tables | Written, not run |
| `drizzle/manual/20261020_canonical_feature_concepts_v1.sql` | Superseded draft | Do not apply |
| `drizzle/manual/20261020_atlas_feature_labels_v1.sql` | Superseded label draft (FK now to concepts) | Do not apply |
| `src/lib/server/db/schema/atlas-feature-identity.ts` | V2 Drizzle declarations | Written; parity not tested |
| `src/lib/server/db/schema/atlas-feature-labels.ts` | V1 Drizzle declaration; changed outside this session, still references `atlasFeatures` | Needs reconciliation |
| `.tmp/atlas/identity-review-manifest-v1.jsonl` | 319 multi-source IDs and 7 candidates, all unresolved | PASS (classification only) |

## 6. Gates (current)

| Gate | Status |
|---|---|
| Symbol registry coverage (app) | In progress |
| Symbol registry coverage (dependency) | Baseline 82.5% of files |
| Svelte LSP on frozen snapshot | NOT QUALIFIED (hypothesis: missing dependencies) |
| AST V2 writer readback | NOT PROVEN |
| Feature identity and labels (production) | BLOCKED |
| Embedding provenance | UNKNOWN for encoder and revision; sample shows raw recipe |
| Canonical retrieval slice | NOT BUILT |
| ContextEvidenceAssembler | Prototype, tested; no integration proof |
| Production writes, promotion, training | DISABLED |

## 7. Speed options (cache and workers)

1. Concurrency (4–8 in-flight sidecar requests) in the coverage script: largest win.
2. Local content-addressed cache on NVMe, keyed by `sha256(bytes) + parser revision`. A hit skips a call but still needs its own receipt.
3. Valkey or BitFrost for shared cache: only after the local cache works; revision-checked keys only.
4. CPU workers: useful around the sidecar calls, not for the sidecar itself.
5. Langextract: NLP extraction, not parsing; not a speed-up for AST coverage.

## 8. Open decisions

- Coverage threshold: 80% (earlier message) or 90% (provisional note). Apply separately to app and dependency source.
- Stop `:8090` for RAPIDS/cuML runs: approved in principle; execute only when the run starts.
- Domain vocabulary: nine technical domains, product capabilities, and ontology concepts stay separate, with typed crosswalks.
- Identity: source-local identities plus approved canonical concepts; 94 dotted IDs need individual review; nothing auto-merged.
- P20 source-revision writes: keep locked.

## 9. Added helpers: Karpathy, LangGraph, deep agents, OpenWiki

Verified present in the repo on 2026-10-21 (existence only; none were run in this session).

| Helper | Files | Role | Gate |
|---|---|---|---|
| Karpathy GPU enrichment | `scripts/atlas/karpathy-gpu-enrich.mjs`, `scripts/atlas/run-karpathy-gpu-admitted-v1.mjs` | Blends PageRank, attention, and authority into Redis `gpu:karpathy:*` keys. Use only the `:admitted` entry point. | Legacy reference. Writes to Redis. Not admission evidence. |
| LangGraph bridge | `packages/atlas-core/src/langgraph/` (`index.ts`, `clients.ts`, `example-usage.ts`) | Loop controller only; no datastore ownership | Orchestration only. Writes are blocked by policy. |
| LangChain doc chunking | `python/test_langchain_doc_chunking_adapter.py` | Test for a doc chunking adapter | Test only. |
| Deep agents | Not located as a dependency or runtime in this repo | None | Do not claim a deep-agents runtime exists. |
| OpenWiki | `openwiki/` (generated evidence index, optional just-in-time context) | Read-only context lookup; do not hand-edit generated pages | Regenerated by the scheduled workflow. |

Rules that apply to all of them:
- No direct writes to Postgres, Qdrant, Redis, Neo4j, or SeaweedFS from a graph node.
- Karpathy blend output is a rerank signal, not canonical evidence.
- OpenWiki pages are evidence pointers. Read the source before trusting a page.

## 10. Handoff: state for resumption after context compaction

Snapshot taken 2026-10-21T03:33Z.

### 10.1 What is running
- **Application symbol coverage** (`.tmp/atlas/symbol-coverage-app/run.mjs`), started as a detached node process.
- Progress at snapshot: 1,716 of 6,640 eligible files written to `per-file.jsonl` (about 2.6 files per second, so roughly 30 more minutes).
- Output: `per-file.jsonl` (one line per file: path, sourceRevision, status, symbols, chunks, error), then `summary.json` when the loop ends, plus `run.log`.
- Read-only: it calls only the 8095 `/ast/chunk` route and writes nothing to Postgres, Qdrant, or any cache.

### 10.2 How to check it after compaction
```
wc -l .tmp/atlas/symbol-coverage-app/per-file.jsonl          # should approach 6,640
ls .tmp/atlas/symbol-coverage-app/summary.json               # present only when finished
tail -c 300 .tmp/atlas/symbol-coverage-app/run.log            # errors, if any
```
If `summary.json` exists, read its `counts` and `fileCoveragePct`. The `threshold` field is still provisional (80% vs 90% pending).

### 10.3 Important caveat before restarting
`run.mjs` truncates `per-file.jsonl` at startup (`writeFileSync(log, '')`). Restarting it as-is discards the 1,716+ results already written. Before any restart, add a resume step: read the existing `per-file.jsonl`, skip paths already recorded, and append instead of truncating. Concurrency (4–8 in flight) can go in the same change.

### 10.4 Resumption order (after compaction)
1. Check the coverage run (10.2). If it finished, record the app coverage receipt; if it stopped early, add resume logic (10.3) before restarting.
2. Confirm the coverage threshold (80% or 90%) and whether it applies to app and dependency source separately.
3. Run the bounded integration proof: one real Svelte source → host-only Svelte and embedded TypeScript results → crosswalk resolution (no guessing) → `ContextEvidenceAssemblerV1` → ContextManifest with independent readback → receipt in the OpenSpec `tasks.md`.
4. Stop `:8090` only when a GPU run actually starts (check `/slots` is idle first).

### 10.5 Things that must not be done without a separate authorization
- Applying any `drizzle/manual/*.sql` to `legal_ai_db`.
- Minting canonical concepts or registering source identities.
- Qdrant upserts, cache promotion, backfills, training, commits, or pushes.
- Changing the P20 source-revision lock.
- Editing source files automatically. The edit gate in the OpenSpec change applies first.

### 10.6 Files that changed outside this session (verify before relying on them)
- `sveltekit-frontend/src/lib/server/db/schema/atlas-feature-labels.ts` still references `atlasFeatures`. Reconcile with the V2 declaration before any parity test.
- `openspec/changes/parent-atlas-source-qualified-corpus-admission/tasks.md` and `context-evidence-assembler-v1.ts` / `.test.ts` were edited outside this session.
