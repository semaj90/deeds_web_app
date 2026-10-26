# Production Hardening — Master Report
**Status**: PARTIAL, not production-ready | **Commit**: none (all work uncommitted) | **Date**: 2026-10-17

---

## TL;DR

The legal library (`/library`, `/api/library/search`) existed but held no law. It now holds 35,102 California code sections (60,428 chunks) from the Legislature's official feed, with indexes, a CPU embedding backfill (92% done), and text search verified end to end in a browser. A 202-page crawl, a Drizzle-vs-Postgres audit, and a Kanban-runtime audit found real defects (listed below). The Kanban/agent loop is **NOT_PROVEN**: no production code dispatches it, and one step fabricates its test evidence. Nothing here is promotion; all new Atlas code is shadow/advisory. The pass-2 re-crawl was aborted (dev server ran out of memory), so the file/line back-fill of `error_logs` is still open.

---

## 1. What changed

| Area | Change | State |
|---|---|---|
| Postgres 18.4 | `drizzle/manual/legal_corpus_indexes.sql`: `legal_chunks.tsv` (generated), `legal_nodes` tsv trigger, 2 GIN, HNSW (m16/ef200), 7 lookup/unique indexes, `jurisdictions` = `federal`, `ca` | APPLIED |
| Data | 5 documents, 35,102 nodes, 60,428 chunks (PEN 5,745 / HSC 17,634 / CIV 4,080 / WIC 7,137 / EVID 506); source sha256 `7820ea35…ad28` | APPLIED |
| Embeddings | 55,571 / 60,432 chunks; 2 CPU workers on isolated Ollama `:11435`; docs still `processing_status=embedding` | IN PROGRESS |
| `error_logs` | +69 findings (11 CRITICAL, 13 ERROR, 39 WARNING, 6 INFO); table 322 → 391 | APPLIED |
| Bug fix | `OfficialTextPane.svelte`: effect loop (736 requests / 12 s, text never rendered) | FIXED |
| Bug fix | `daily-graphify-mastra-workflow.mjs:287` `category` → `error_category`; `log-and-audit-errors.mjs` `ORDER BY id` → `created_at` | FIXED |
| Convention fix | jurisdiction `CA` → `ca` (matches upload form) | FIXED |
| New code | ingest + worker + 2 Playwright specs + 3 audits + ACE adapter (see §6) | CREATED |
| Env | DSPy 3.4.1 + GEPA 0.1.4 in isolated venv `/home/james/.venvs/atlas-dspy-exp` (329 MB, no torch); Ollama alias `embeddinggemma-cpu` (unused) | INSTALLED |

---

## 2. Route crawl (202 static pages, mutation-fenced)

| Measure | Result |
|---|---|
| Clean on first full coverage | 184 / 202 (91%) |
| Flagged | 18 → serial re-test on idle server: 15 clean, 3 still failing |
| Still failing | `/admin/all-routes` (`each_key_duplicate`), `/atlas/studio/openspec` (HTTP 504), `/demos/synthesis-chat` (unhandled clipboard rejection) |
| Console errors | 1,200 on 21 routes; 1,165 from `/demos/enhanced-upload` (endless WS reconnect + `effect_update_depth_exceeded`) |
| Buttons (≤12/page, destructive labels skipped) | 529 ok · 265 no visible effect · 79 click failed · 48 unreadable · 119 skipped |
| Fence | 11 non-GET + 1 job-trigger GET fired at load/click and blocked |
| Classified (432 records) | 11 critical · 13 high · 53 medium · 355 low |

**Caveats**: (a) the first run died at route ~60 (Vite heap ≈4.9 GB; 137 refused connections were harness failures, not defects); (b) other sessions edited the components behind most flagged routes before the re-test, so "clean" ≠ "I fixed it"; (c) `/admin/codebase-viewer` came back clean with no file change (data/load dependent); (d) `/login` timed out once under load, re-measure cold and warm.

---

## 3. Database parity (Drizzle ↔ PostgreSQL 18.4)

| Measure | Result |
|---|---|
| Tables Drizzle vs live | 378 vs 567 (58 declared-not-live, 247 live-not-declared) |
| Columns | 100 declared missing live · 160 live undeclared |
| Type mismatches / nullability risks | 54 / 78 |
| Declared index names missing live | 334 |
| Live index methods | btree 1,909 · gin 210 · hnsw 35 · ivfflat 3 · brin 3 · hash 1 · bm25 1 |
| Special columns | jsonb 583 · bytea 10 · bit 1 (`class_bitmap bit(16)`) · vector 59 · halfvec 13 · tsvector 12 · merkle: only `atlas_tensor_artifacts.merkle_root` (0 rows) |
| Server | `io_method=worker`, `io_workers=3`, `effective_io_concurrency=16`, `enable_bitmapscan=on`, `shared_buffers`=128 MB, `work_mem`=4 MB, `random_page_cost`=4 |
| Plans (`EXPLAIN ANALYZE`) | text search: Bitmap Heap/Index Scan on GIN 3.1 ms · citation btree 2.4 ms · vector top-10 HNSW 16 ms |

AIO and bitmap scans are planner/server behavior, not schema. Legal-table drift: `jurisdictions.created_at/updated_at`, `library_document_versions.amendment_note`, several `legal_documents` columns declared in Drizzle but absent live (breaks any Drizzle `select()`; current routes use raw SQL); declared unique `library_docs_source_hash_uidx` absent live.

**Landmine**: pending `drizzle/manual/20260402_indexing_ace_schema_merge.sql` would break `legal_chunks` (its trigger assigns `NEW.tsv`, which errors on the generated column) and add duplicate indexes. Do not apply as-is.

---

## 4. Kanban / agentic runtime (KANBAN-RUNTIME-OWNERSHIP-01): NOT_PROVEN

| Gate | Proven | Evidence |
|---|---|---|
| Task contract resolved | yes | live board family has production importers; `workflow-action-event-v1` / `task-run-contract-v1` have **none** (two parallel families) |
| UI read model | yes | `admin/ai-dashboard` + `api/phase89/workflow` read it; 166 `kanban_tasks` (160 pending), 160 events (143 file snapshots) |
| Dispatcher caller | **no** | `executeHermesAgentStepV1` + LangGraph kanban agent: 0 production callers |
| Durable writer | **no** | `workflow_events` = 0 rows |
| Claim/heartbeat/reclaim | **no** | no such events; attempts/dependencies/agent_runs/hermes_dag_runs all 0 |
| Timeline ↔ revision link | **no** | 0 events carry a workspace revision |
| Graphify admission | **no** | `NOT_SAFE_TO_PROJECT` |

**Critical risk**: `executeHermesAgentStepV1` hardcodes tournament results (`typecheck pass`, `15 tests passed`, `durationMs 420`) and `adaptRankerFromOutcomesV1` trains on `outcomeSuccess`. Outcome labels are fabricated; a green spec does not prove execution. File is mid-extraction by you: **not edited**.

---

## 5. GPU / ML lanes

| Item | Result |
|---|---|
| `nx-cugraph` vs NetworkX (RTX 3060 Ti, 3,000 nodes / 15,000 edges, seeded) | PARITY_PASS: PageRank max diff 3.3e-19, top-50 overlap 1.0; BFS exact; components equal |
| Timing | PageRank CPU 592 ms · GPU first 3,049 ms · GPU warm 8.4 ms. BFS GPU slower on this small graph (2,212 ms vs 15 ms) |
| Install | none needed (nx-cugraph 26.6, cugraph, cuml, torch 2.13, xgboost 3.3 already present); cuTile still gated (ACE-RADIX-01, CUDA 13.0 host) |
| DSPy / GEPA / GRPO / OaK | DSPy+GEPA installed, **no LM wired** (nothing run); no GRPO tooling/checker; OaK = Ontology-as-a-Kernel (8095 `/oak/*`), evidence input only |
| Not found | "logi" (any spelling), a Paperclip agent, GRPO self-prompting, an 8-node MLP ("siglrelu") |
| Valkey | `noeviction`, 13.4 MB of 2 GB, 99% of keys already carry a TTL (~6.5 d avg); 0 centroid / BitFrost keys |

Not valid evidence: one seeded graph is not the real Atlas graph; do not set `NETWORKX_AUTOMATIC_BACKENDS` globally.

---

## 6. Artifacts created

| Path | Purpose |
|---|---|
| `drizzle/manual/legal_corpus_indexes.sql` | idempotent additive DDL (applied) |
| `scripts/ingest/{remote_zip.py,extract-ca-codes-pubinfo.py,ingest-ca-codes.mjs}` | official-feed extract + Postgres ingest + `--publish`/`--finalize` |
| `scripts/workers/legal-chunk-embed-worker.mjs` | RabbitMQ CPU embed worker (writes Postgres) |
| `sveltekit-frontend/tests/e2e/legal-corpus-search.spec.ts` | 12 tests (search, buttons, pages) |
| `sveltekit-frontend/tests/e2e/production-hardening-routes.spec.ts` | 202-route fenced crawl (`HARDEN_ROUTES_FILE`, `HARDEN_SLICE`) |
| `sveltekit-frontend/scripts/audit-drizzle-live-parity.mts` | read-only schema/index/type parity |
| `scripts/atlas/ace_packet_proposal_v1.py` + `test_…` | tuples→tensor payload (matches TS contract), proposal validator, outcome receipts (15/15 tests) |
| `scripts/atlas/audit-kanban-runtime-ownership-v1.mjs` | evidence-only Kanban receipt |
| `scripts/atlas/{export,ingest,enrich}-route-hardening-*-v1.mjs` | NDJSON export, `error_logs` ingest, file/line back-fill (dry-run default) |
| `scripts/atlas/prove_nx_cugraph_backend_parity_v1.py` | GPU parity proof |
| Receipts | `docs/reports/{drizzle-live-parity-20261017,kanban-runtime-ownership-v1,nx-cugraph-backend-parity-v1}.json`; `logs/task-output/route-hardening-errors-pass1-20261017.ndjson` (432 records) |
| OpenSpec | `legal-corpus-california-codes/tasks.md` (new, RH-01…RH-16, PG-01…PG-06); AR-15 in `agentic-repair-fabric`; entries in `pass-fabric`, `manual-migration-reconciliation`, `gpu-compute-lanes-consolidation`; workboard rebuilt (102 changes, 5,108 open) |

---

## 7. Verification

- ✅ Playwright: 12/12 legal spec · 30/30 existing library/legal-corpus specs
- ✅ Vitest: 40/40 (hermes pipeline, kanban board, workflow event, task run, OAK enrichment)
- ✅ Python: 15/15 on Windows and on WSL RAPIDS (torch parity); TS contract accepts the payload, checksum identical
- ✅ `openspec validate parent-atlas-agentic-repair-fabric --strict`
- ✅ Idempotent ingest (second run inserted 0); guarded reclassification (exactly 6 rows)
- ❌ Not run: full re-crawl pass 2 (aborted), production auth path (all tests used `DEV_BYPASS_AUTH`), real-graph GPU parity, any DSPy/GRPO run
- ⚠️ `legal-corpus-california-codes` has no `proposal.md`, so `openspec validate` was not run on it

---

## 8. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| 1 | Commit (working tree: 492 changed paths, 422 untracked, **many from other sessions**) | commit only the files in §6 + the 3 bug fixes, separately from other work |
| 2 | Canonical task-contract family: live board vs `workflow-action-event-v1` | pick the live board; archive the unused family (do not delete) |
| 3 | Valkey eviction | `volatile-lru` + persist in container config (no urgency at 0.65% use) |
| 4 | Drizzle direction for legal tables (fix declarations vs add columns) | fix declarations to match live; legal routes use raw SQL |

---

## 9. Next steps (ranked)

1. **Finish embedding** (~4,900 chunks): then `node --env-file=.env scripts/ingest/ingest-ca-codes.mjs --finalize`, re-run the 12-test legal spec, re-measure `EVID § 1200` ranking.
2. **Fix HERMES-STAGE-EVIDENCE-01** once your extraction settles: stage results must come from tool events; until then do not train on `outcomeSuccess`.
3. **Re-crawl against a production build** (`vite build` + `vite preview`), not the dev server: the dev server exceeds 4.5 GB over ~60 routes and invalidates results. Then run `enrich-route-hardening-error-locations-v1.mjs` (dry-run first) to fill `file_path`/`line_number`/`source_ref` (RH-15b).
4. **Fix the 3 open route defects** (RH-01 duplicate keys in `all-routes`, RH-02 504, RH-03 clipboard) and add regression specs for the two reactive-loop bugs.
5. **Prove one Kanban path** (KANBAN-RUNTIME-PROOF-01): one read-only repair task end to end (ready → claim → heartbeat → receipt, `writesPerformed=false`).
6. **Wire DSPy to Bifrost** via a `dspy.BaseLM` subclass (ACE-PROMPT-02), then offline GEPA on frozen examples (AR-12).
7. **Triage buttons**: 265 no-effect / 79 click-failed (RH-11), and the `POST /api/rag/search` fired at load (RH-12); remove client calls to non-existent `/api/rag/status` (RH-10).
8. **Hardening backlog**: auth-path tests, hardcoded DB password fallback in `route-forensic/_helpers.ts`, `shared_buffers`/`work_mem` tuning, update/supersede flow for the legal feed, hierarchy nodes, more codes, UI legal-notice, make the `:11435` Ollama + workers a managed startup task.
9. **Later / gated**: GRPO needs a strict checker (re-runs real tools, forbids model-reported success, trains only on "edge" tasks) before any trainer; 8-node MLP only as a challenger vs FM Rank-4; nx-cugraph on the real graph before any routing.
