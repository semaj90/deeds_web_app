# PROGRESS 2026-10-18 (1018) — TurboVec / pgvector / domain-taxonomy / NES LUT alignment
**Status**: PARTIAL | **Base commit**: `5ae2e388f8` (branch `chore/parent-atlas-session-2026-10-17`, worktree dirty, nothing committed) | **Date**: 2026-10-18

Evidence classes: PROVEN (receipt + command) · PARTIAL · PENDING · BLOCKED · REJECTED. Digests are the first 12 hex of sha256 at the time of the claim; a claim is void if the digest changes.

---

## TL;DR
TurboVec `:8791` was empty because it ran under Python 3.14 (no `turbovec`). It now runs under Python 3.13, loads the canonical `content_embedding_768` (219,998 rows) from Postgres, indexes a 128-d MRL prefix, and carries an in-memory domain slot built from an exact-match crosswalk table. TurboVec is `CHALLENGER_ONLY` (no RRF vote, no identity, no writes). Two additive reference tables now exist: `atlas_domain_vocabulary_crosswalk_v1` and `atlas_nes_lut_v1`. The largest open risk is **write amplification on `codebase_chunk_index`** (48 indexes, 0.6% HOT), so domain data is deliberately not written into that table. Local helper tests pass; none of that proves production integration, GPU execution, or `:8095` parity.

## Status board
| ID | Item | Class | Receipt / command | Source digest |
|---|---|---|---|---|
| TV-1 | Sidecar restored under py3.13, Postgres-sourced, MRL-128 | PROVEN | `curl :8791/health` -> `indexed 219998, dim 128, turbovec true, representationId embeddinggemma_mrl128_l2_4bit_v1` | `cd36966ae4c8` turbovec-sidecar.py |
| TV-2 | Domain slot + `domains` filter | PARTIAL | 114,177/219,998 resolved, 6 domains; smoke: `gpu` filter returns only `gpu`. Not a recall test | same |
| TV-3 | Recall, 50 self-queries | PARTIAL | within-top-50: 64-d 0.858, 128-d 0.946 (self rows included) | scratchpad `recall_probe.py` |
| TV-4 | 1,000-query frozen held-out canary vs exact 768 oracle | PROVEN (agreement with exact-768 neighbors only) | receipt `.tmp/atlas/turbovec-canary-v1/receipt.json`; recall/MRR/latency table below; `/health.defaultK 100` | `canary_frozen.py` |
| DB-1 | `atlas_domain_vocabulary_crosswalk_v1` (59 rows) | PROVEN | rehearsed in rolled-back txn, applied, readback = rehearsal | `524a23025838` |
| DB-3 | `atlas_retrieval_canary_runs_v1` + `atlas_retrieval_canary_sequence_v1` (2 runs, 11 sequence rows; ingest idempotent) | PROVEN | rehearsed then applied; `python/atlas_retrieval_canary_v1.py best --target 0.94` -> `k=100`; 5 tests | `20261018_atlas_retrieval_canary_v1.sql` |
| TV-5 | pgvector HNSW (768 MB, m16/ef_construction 64) on the same frozen set | PROVEN (agreement with exact-768 only) | tie-aware recall 0.976@ef40, 0.984@ef100, 0.988@ef200, 0.995@ef400; p50 48–55 ms (set-overlap run had shown 0.91–0.93: oracle artifact) | `receipt-tieaware-pgvector.json` |
| DB-2 | `atlas_nes_lut_v1` (10 rows; 5 NORMALIZED_EXACT to taxonomy, 5 UNRESOLVED) | PROVEN | rehearsed, applied, readback `10 | 5 | 0 canonical` | `e9d0b47f628e` |
| CT-1 | `turbovec-contract.ts` original exports + 128-d consts + Zod contract | PARTIAL | `tsc --noEmit` no TurboVec errors; no runtime consumer test | `bbefc47344c6` |
| AST-1 | `ast_chunk_routing_helpers.py` hardened, 15 tests | PARTIAL | `py -3.13 python/tests/test_ast_chunk_routing_helpers.py` | `6bd1b5e03fd1`, test `331d6458398c` |
| AST-2 | NES LUT 4/4, tree-sitter coordinate 3/3, procedural-memory 5/5, AVX2/MIRAS-FSM 5/5 | PARTIAL | node/py test runs; FSM/AVX2/cuTile tests do NOT prove those instructions/kernels executed | — |
| SC-1 | Live `:8095 /ast/chunk` parity with a chosen helper owner | PENDING | not rechecked this session | — |
| DOC-1 | `build-master-toc-v2.mjs --check` | BLOCKED | `MASTER_TOC_V2_CHECK_FAILED` (stale projection; several sessions have uncommitted edits) | — |
| UI-1 | `/admin/atlas` Playwright / kanban read model | PENDING | not run | — |
| GPU-1 | Any CUDA/cuTile/TensorRT execution receipt | PENDING | none | — |
| X-1 | CUDA 13.4 / TensorRT-RTX 1.7 / Titans-MIRAS KV-swap paste | REJECTED | unverifiable claims; conflicts with preserve-CUDA-13.0 + capability-guard rules | — |

## Measured baseline (immutable; compare against it before/after any index or table change)
| Measure | Value |
|---|---|
| `codebase_chunk_index` total / heap / indexes / TOAST | 3,275 MB / 519 MB / 1,439 MB / 1,317 MB |
| Index count on the table | 48 |
| Updates / HOT / dead tuples | 4,740 / 27 (0.57% HOT) / 4,720; `n_live_tup` reads 0 so stats are unreliable |
| Fillfactor | default 100 (`reloptions` empty) |
| Trigger | `trig_update_codebase_chunk_search_vector` (enabled; body not yet reviewed) |
| Stats reset | `pg_stat_database.stats_reset` is NULL (counters since creation/last crash, not a reset window) |
| Crosswalk coverage | chunk.domain 7/19 values, 125,309/274,465 rows; feature_domain 12/40 values, 34,017/61,659 rows |
| Domain slot in sidecar | 114,177/219,998 indexed rows (chunks lacking a 768 embedding are not indexed) |
| Empty tables | `atlas_concepts`, `atlas_ontology_concepts`, `atlas_evidence_entities`, `atlas_taxonomy_assignment_candidates`, `atlas_packet_class_lut_validation_receipts` |

### TV-4 frozen canary (1,000 queries, live `:8791`, 128-d MRL 4-bit, 219,998 rows; self row excluded; exact oracle = in-process float32 cosine over all canonical `content_embedding_768`)
Receipt: `.tmp/atlas/turbovec-canary-v1/receipt.json` (+ frozen truth `canary_truth_v1.npz`, script `canary_frozen.py`; gitignored). Query set = first 1,000 chunks by `md5('canary'||id)`. 0 errors, `writesPerformed:false`.
| TurboVec returns (K) | recall of exact top-10 after exact rescoring | MRR (exact NN1) | p50 / p95 ms |
|---|---|---|---|
| 10 | 0.578 | 0.653 | 4.1 / 21.6 |
| 25 | 0.796 | 0.658 | 4.5 / 23.2 |
| 50 | **0.899** | 0.659 | 5.1 / 24.8 |
| 75 | 0.934 | 0.659 | 5.4 / 24.5 |
| 100 | **0.950** | 0.659 | 5.8 / 23.4 |
| 150 | 0.965 | 0.659 | 6.7 / 24.0 |
| 200 | 0.974 | 0.659 | 7.6 / 24.5 |
Oracle cost: 3.2 s for all 1,000 queries (3.24 ms/query) + 99 s one-time load, versus 2,545 s when each query ran an exact pgvector scan (about 800x faster; the old 40-minute figure was the test oracle, not a production query path).
Findings: K=50 sits at the 0.90 line (0.899–0.903 across two runs) so it is NOT a safe default. **Sidecar default fetch set to K=100** (`--default-k 100`, `/health.defaultK`; verified: a request omitting `k` returns 100). TurboVec's own ordering is poor (MRR 0.66 at every K) so the exact 768 rescoring step is mandatory. 128-d stays; 64-d was not re-run at 1,000 queries. Remaining for a production claim: frozen human relevance judgments (this measures agreement with exact-768 neighbors, not legal relevance), GPU memory N/A (CPU path).

## Executor comparison on the frozen set (tie-aware: hit if exact cosine >= 10th-best - 1e-6; 1,000 queries; 132 rank-10 ties)
| Executor / hyperparameter | recall of exact top-10 | latency p50 | note |
|---|---|---|---|
| pgvector HNSW 768, ef_search=40 | 0.976 | 55 ms | index used in plan |
| pgvector HNSW 768, **ef_search=100** | **0.984** | 48 ms | best recall-per-ms |
| pgvector HNSW 768, ef_search=400 | 0.995 | 52 ms | |
| TurboVec 128-d, K=100 (search only) | 0.950 | 5.8 ms | needs exact rescore |
| TurboVec 128-d, K=200 (search only) | 0.974 | 8.1 ms | needs exact rescore |
| TurboVec K=100 + Postgres exact rescore (set-overlap metric) | 0.887 (understated) | 60 ms | rescore stage 51.5 ms |
Correction: the earlier "pgvector plateaus at 0.93" was an oracle artifact. pgvector exact vs numpy truth overlap was only 0.8775 because of ties and duplicate chunks (20% of queries have an exact-duplicate vector). All recall figures must be tie-aware. Conclusion (decision input, not promotion): keep pgvector HNSW as the semantic ANN executor; TurboVec only pays off with an in-memory exact rescore (CANARY-MMAP-01). Registry: 5 runs / 26 sequence rows in `atlas_retrieval_canary_*_v1`; chooser `python/atlas_retrieval_canary_v1.py best`. Gaps: OpenSpec "Retrieval canary registry" section.

## PGVECTOR-05A — index retention matrix (read-only draft; NO index was changed)
Classes: KEEP · REDUNDANT_CANDIDATE · OWNER_CONFLICT · UNKNOWN. Zero scans is not proof of dead (no stats-reset window recorded, specialized paths possible).
| Index (size, scans) | Definition | Class | Note |
|---|---|---|---|
| `idx_codebase_chunk_content_embedding_768_hnsw` (768 MB, 2) | hnsw `content_embedding_768 vector_cosine_ops` m16/ef64 | KEEP (pending PGVECTOR-03 parity) | canonical column per AGENTS.md |
| `codebase_chunk_index_content_hnsw` (110 MB, 0) | hnsw `content_embedding halfvec_cosine_ops` m16/ef200 | OWNER_CONFLICT | CLAUDE.md names `content_embedding` canonical; AGENTS.md names `content_embedding_768`. Halfvec is a legitimate size optimization; decide by plan adoption, recall, latency |
| `idx_codebase_chunk_bm25_search` (104 MB, 17) | gin `search_vector` | KEEP | declared lexical owner |
| `idx_codebase_chunk_pgsearch_bm25` (91 MB, 0) | bm25 (id, content, relative_path) key_field=id | OWNER_CONFLICT | pg_search is the documented unpromoted challenger; verify caller first |
| `idx_codebase_chunk_metadata_gin` + `codebase_chunk_index_metadata_gin` (38 MB each, 0) | identical: gin `metadata jsonb_path_ops` | REDUNDANT_CANDIDATE | exact duplicate definitions |
| `codebase_chunk_index_semantic_tags_gin` + `idx_codebase_chunk_semantic_tags_gin` (~1.9 MB each, 0) | identical: gin `semantic_tags` | REDUNDANT_CANDIDATE | exact duplicate definitions |
| `codebase_chunk_index_chunk_id_idx` (46 MB, 215,364), `…qdrant_id_unique` (9), `…domain_idx` (8), `…routing_tier_idx` (1), `idx_…source_revision` (3) | btree | KEEP | used |
| latent 256/128/64 and error/summary HNSW (<=43 MB, 0) | partial hnsw | UNKNOWN | latent lanes are routing experiments; keep until their owner decides |
| remaining ~25 btree/GIN (<=16 MB each, 0) | see audit | UNKNOWN | classify with callers before any DDL |
Next gate: PGVECTOR-05A = capture plans (`EXPLAIN (ANALYZE,BUFFERS,SETTINGS)`) for the real retrieval queries, usage window, operator classes; then a signed matrix. Do not lower fillfactor, add a column, or drop anything before that.

## Domain / NES LUT tables
| Table | Rows | Rule |
|---|---|---|
| `atlas_domain_vocabulary_crosswalk_v1` | 59 (40 feature_domain, 19 chunk.domain) | NORMALIZED_EXACT to `domain_taxonomy_v1.domain_id`, else UNRESOLVED; `canonical=false` |
| `atlas_nes_lut_v1` | 10 (revision `atlas.nes-lut.v1`) | values copied from `NES_LUT_DOMAIN_PALETTE` in `scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs`; source file sha256 `09dc06d4…` and palette checksum `83c79d86…` stored per row; `lut_byte` and `nes_hex` are separate fields (ui: `0x02` vs `0x2A`) |
Neither table is identity, a primary key for packets/chunks, or a retrieval vote. Exact taxonomy overlap with the 9-domain palette is only auth, cache, database, graph, retrieval; `ui`, `network`, `agent`, `ml`, `general` stay UNRESOLVED (no `ui->frontend`, `ml->machine-learning` aliasing). Defect found: the Python helper put `0x2A` (a `nes_hex`) in the `lut_byte` slot; the table keeps them apart.

## Files changed (uncommitted)
`sveltekit-frontend/scripts/turbovec-sidecar.py` · `packages/parent-atlas-core/src/schemas/turbovec-contract.ts` · `.vscode/tasks.json` · `sveltekit-frontend/drizzle/manual/20261018_domain_vocabulary_crosswalk_v1.sql` · `…20261018_atlas_nes_lut_v1.sql` · `python/atlas_compute/ast_chunk_routing_helpers.py` · `python/tests/test_ast_chunk_routing_helpers.py` · `python/tests/test_avx2_cutile_miras_fsm.py` · `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md` (TV-SEAM-01..06) · `docs/EMBEDDINGGEMMA-COMPLETE-REFERENCE.md`

## How to make it better — owner and single next gate
| # | Improvement | Owner | Next acceptance test |
|---|---|---|---|
| 1 | Keep domain advisory (sidecar / `:8095` response, qualified by source revision AND crosswalk revision). Add a narrow keyed projection only when a concrete query needs persistence. Never a column on the wide vector table | Postgres owner | a named consumer + query plan |
| 2 | PGVECTOR-05A read-only index review -> signed matrix | pgvector owner | matrix above completed with plans and callers |
| 3 | Review the search-vector trigger body; narrow with `UPDATE OF`/change guard | Postgres owner | one-row update plan before/after on a copy |
| 4 | **AST-HELPER-OWNER-01**: candidate `python/atlas_ast_chunk_helpers_v1.py` (tracked ontology authority `parent_atlas_ontology/domain_mapping.py`); port the hardened invariants and run identical fixtures against all four modules | AST helper owner | gates below |
| 5 | Add coordinate property tests: UTF-8 byte <-> LSP UTF-16 round trip with CRLF, combining marks, astral chars, empty lines, EOF; keep editor coordinates separate from Tree-sitter byte spans | AST helper owner | 0 round-trip failures |
| 6 | Record `crosswalk_revision` (table `crosswalk_version` + checksum) on every derived classification | classification owner | classification payload carries it |
| 7 | Reviewed mapping for unresolved values (`backend`, `infrastructure`, `utility`, `UI`, `Authentication`, `rag_retrieval`…) without semantic aliases | reviewers | DOMAIN-COVERAGE-01 |
| 8 | Wire `atlas.ast.chunk-enrichment.v1` (additive, `canonicalAuthority:false`) to `:8095 /ast/chunk`; route non-AST chunks (~144.7k) instead of `UnsupportedLanguageError` | sidecar owner | SIDECAR-PARITY-01 |
| 9 | One GPU-memory owner before TensorRT/cuTile/LibTorch/llama-server compete for 8 GiB; separate prefill from decode; device-backed receipt for any GPU claim | GPU owner | GPU-1 receipt |
| 10 | Regenerate registry + Master TOC together from a captured worktree snapshot; reproducible `--check` | governance owner | DOC-GOV-TOC-CHECK-01 |
| 11 | Playwright read-only pass over `/admin/atlas` and the kanban read model | UI owner | ATLAS-UI-01 |

### AST-HELPER-OWNER-01 acceptance contract (all currently unmet)
`AST_HELPER_OWNER_UNIQUE` · `DOMAIN_CROSSWALK_EXACT` · `DOMAIN_CROSSWALK_REVISION_QUALIFIED` · `SOURCE_REVISION_REQUIRED` · `UTF16_COORDINATES_STRICT` · `AST_BYTE_SPANS_VALID` (validated against original bytes) · `NO_CROSS_FILE_NEIGHBORS` · `NO_EXTENSION_DOMAIN_INFERENCE` · `FEATURE_DESCRIPTOR_NONCANONICAL` · `SIDECAR_8095_LIVE_PARITY` · `EXISTING_TESTS_PASS` · `NO_UNAUTHORIZED_WRITES`. A pass records source revision, test command, tests executed, runtime response digest. Production gate stays PARTIAL until the deployed `/ast/chunk` matches the chosen owner. Four competing untracked modules: `ast_chunk_routing_helpers.py` (hardened reference), `…_v2.py` (parity unproven), `ast_chunk_procedural_memory_v1.py` (keep only if non-duplicative), `python/atlas_ast_chunk_helpers_v1.py` (uses tracked ontology authority).

## Traps (do not repeat)
| Trap | Detail |
|---|---|
| Pasted SQL/code referenced nonexistent objects | `packet_key`/`domain_id` on `codebase_chunk_index`; `slug` on `domain_taxonomy_v1`; `source_vocabulary` on the crosswalk |
| Pasted Zod-only contract | would delete exports re-exported by `schemas/index.ts`; merged instead |
| Tests that assert their own fiction | old helper tests asserted `billing->auth`, `workflow->agent` (absent from live vocabularies) |
| "76" | 17 taxonomy + 40 feature_domain + 19 chunk.domain values (incl. blank) = vocabulary slots, not concepts |
| Detached `nohup` jobs | die silently; use the harness background runner |
| Passing FSM/AVX2/cuTile tests | prove local logic only, not instruction or kernel execution |

## Seams left open (nothing built)
Kanban (`kanban_tasks` 166 rows + `kanban_task_*`), `/admin/ai-dashboard`, ACP registry, A2A card, agentic error-fixing FSM, DSPy/GEPA shadow mode (`LearningOutcomeV1`): OpenSpec TV-SEAM-01..06.

## Verification (one-liners)
- `curl http://127.0.0.1:8791/health` -> `indexed 219998, dim 128, turbovec true`
- `py -3.13 python/tests/test_ast_chunk_routing_helpers.py` -> 15 OK
- `node --test scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.test.mjs scripts/atlas/lib/tree-sitter-coordinate-v1.test.mjs` -> 4/4, 3/3
- `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "select count(*),count(*) filter (where match_method='NORMALIZED_EXACT') from atlas_nes_lut_v1"` -> 10 / 5

## Next steps
- TV-4 done: default K=100. Next: human relevance judgments; re-run 64-d on the frozen set only if a cheaper tier is wanted.
- PGVECTOR-05A plans + callers -> signed index matrix (no DDL).
- AST-HELPER-OWNER-01 fixtures against all four modules, then live `:8095` parity.
