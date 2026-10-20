# Atlas Pipeline Comprehensive Report
**Status**: read-only audit | **Date**: 2026-10-19 | **Branch**: `chore/parent-atlas-session-2026-10-17` | **Commit**: none (all new files untracked) | **canonicalAuthority**: false

---

## TL;DR
Nothing in the retrieval/learning pipeline was changed this session. The audit shows one root cause behind most blocked stages: **no vector row carries `source_revision`, `workspace_revision` or `representation_revision`** (0 of 219,998), and revision backfill is deliberately deferred until after Phase 20. AE training, SOM/manifold admission, domain classification and the AST semantic index all wait on it. Separately, the daily Graphify downstream chain fails on **TurboVec** (empty index, `indexed:0`) and intermittently on readiness polling and `kanban_emit`; those are fixable without touching revisions. Percentages are not used; stages carry proof levels.

## Stage status (live probes 2026-10-19; receipt `docs/reports/pipeline-status-v1.json`)
| Stage | Status | Key evidence |
|---|---|---|
| TurboVec `:8791` | CREATED_EMPTY | up, `indexed:0`, `domainSlotPopulated:false`, role `CHALLENGER_ONLY` |
| KMeans | CANDIDATE_NOT_ACTIVE | k=256 model trained on 197,987 rows; 52,380 / 274,465 chunks hold a `kmeans_cluster` (older run, model unidentified) |
| SOM 20x20 | BLOCKED | no real BMU writer; 49,301 chunks have `som_bmu_row` but values are hash-derived |
| Manifold4 | BLOCKED (`MAN4_PRODUCER_ALIGNMENT_BLOCKED`) | 11,625 chunks; July `som_assignments.json` (32,310) lacks all revision fields |
| AE latents | DECODER_UP_QUALITY_UNPROVEN | `latent_256` 55,169, `latent_128` 55,169, `latent_64` 1,703; `:8121` degraded = lazy load |
| Domain classification | NOT READY | 13 labeled rows, 3 classes, 0 revision-qualified; floor 200 rows / 30 per class |
| Low-rank | FIXTURE_PROVEN | 11 candidates, no GPU run |
| Did-you-mean | NOT_PROBED | code references only |
| Multi-hop traversal | NOT_PROBED | 32 edge tables inventoried, none timed |

## 1. Root blocker: missing revisions
| Fact | Source |
|---|---|
| 274,465 chunks; 219,998 with `content_embedding_768`; 0 with source/workspace/representation revision | AE evaluation gate 2026-10-14 (live readback) |
| Semantic-768 writer owner | `OWNER_NOT_PROVEN`; both canonical backfill paths fail closed |
| Operator rule | `source_revision` writes deferred until after Phase 20 |
| Consequence | AE training, evaluation, SOM/manifold admission, AST edge admission and domain gold labels cannot be promoted |

## 1b. Postgres 18 / pgvector schema validation (read-only, now a stage in `pipeline-status-v1.mjs`)
| Check | Result |
|---|---|
| Server / extension | PostgreSQL 18.4, pgvector 0.8.3 |
| Live schema vs Drizzle (14 columns, read 2026-10-19) | **all 14 match the Drizzle declarations** (`SCHEMA_MATCHES_DRIZZLE_DECLARATION`). `schema/atlas-packets.ts` declares `workspace_revision` / `representation_revision` as `integer NOT NULL DEFAULT 0` on purpose (operator-incremented sequence for stale-cache rejection) and `workspace_revision_key` as the text digest. Caution: `DEFAULT 0` can silently create a fake revision 0; never treat 0 as a real revision |
| Withdrawn claim | Earlier text said the integer revision columns needed an `ALTER`. That was wrong: they are the Drizzle contract, and `codebase_chunk_index` legitimately stores revisions as `text`. Never migrate to satisfy a status script (Drizzle Safety Rule). Writer contract and lineage qualification are still unproven (separate sections in the status receipt) |
| Vector columns | `content_embedding_768 vector(768)` and `content_embedding halfvec(768)` coexist (two 768 owners); `latent_256/128` halfvec, `latent_64` vector; legacy 384 columns still exist (`atlas_packets.content_embedding_384`, `summary_embedding_384`) |
| HNSW indexes | 10 on `codebase_chunk_index` (e.g. `content_embedding` halfvec m=16 ef_construction=200; `content_embedding_768` vector m=16 ef_construction=64) |
| Workflow | per the truth flow: write Postgres, then validate schema/revisions, then update status. The status script performs the validation step only; it never upserts or alters |

## 2. Autoencoder (`ae:train`)
| Item | Finding |
|---|---|
| Training owner | `python/train_latent_autoencoder.py` (`ae:train`, `ae:train:dry`) |
| Current state | fail-closed: without `--plan-only` it exits 78 unless `TRAINING_AUTHORITY_PROVEN`; 2026-10-14 plan-only run: `TRAINING_BLOCKED: SEMANTIC_WRITER_AND_ADMITTED_INPUT_PROVENANCE_REQUIRED` (not rerun today) |
| Last real run | 2026-08-29/31, CUDA, 697 s, 55,169-row frozen snapshot, source-grouped split (49,622 train / 5,547 val, 726 held-out sources), checkpoint `nested_semantic_autoencoder_v3_full01.pt` |
| Self-reported validation | recon cosine 0.957 / 0.924 / 0.891 and kNN recall 0.896 / 0.857 / 0.793 for 256 / 128 / 64 dims; trainer's own numbers, not production retrieval quality |
| Evaluation gate | `BLOCKED_NO_REVISION_QUALIFIED_COHORT`; frozen snapshot rejected for production evaluation; Valkey AE weights absent |
| Historical failure | Session 121: old AE 64-d recall@10 0.097 vs MRL-64 0.434, but the cohort was unbound and the evaluator used ReLU where the trainer uses tanh; cause not proven |
| Dependency on SOM | none found in code (AE trains on 768-d vectors); the gate is revisions, not SOM |
| **Architecture drift (new)** | The v3 checkpoint (sha256 `ac5c069d...16c5`, 5.8 MB) is the **old 3-tier** model from commit `0cddd29d39`: `Linear(768,384)->GELU->Linear(384,256)->LayerNorm`, latent128 = renormalized prefix of latent256, latent64 = prefix of latent128. Today's `python/atlas_compute/latent_autoencoder.py` is a **different** architecture (768->512->256->128, separately learned `encoder_128`; state-dict keys `encoder_512/256/128`). The checkpoint cannot be loaded into the current class. No checkpoint exists for the current architecture. This also resolves the CLAUDE.md "latent_128 conflict": the 55,169 `latent_128` rows are prefix slices, consistent with v3 |
| **Decoder container risk (new)** | `atlas-neural-decoder` (`:8121`) carries the OLD model code (`hidden_dim 384`, `self.encoder`; sha256 `6448d74a...` vs repo `bafd1490...`) and mounts the legacy v3 checkpoint, so it works today. `python/atlas_neural_decoder_service.py` builds `NestedSemanticAutoencoder(NestedAutoencoderConfig())` and calls strict `load_state_dict`: an image rebuilt from the repo gets the canonical class and will fail to load v3. Do not rebuild the image until a canonical-architecture checkpoint exists or the service is deliberately pinned to the legacy class |
| `--plan-only` safety (verified in code, then run) | stdlib-only imports at module top; `main()` prints `blocked_training_report()` and returns before any DB, torch or GPU import. Output: `TRAINING_BLOCKED`, `databaseRead:false`, `checkpointWritten:false`, `trainingPerformed:false` |
| **Checkpoint-faithful evaluation (new, CPU only, diagnostic)** | Old architecture reconstructed from git; checkpoint loads with `strict=True`; frozen matrix sha256 matches the receipt (`bd36c163...41b0`, 55,169 x 768). 500 seeded queries, self excluded, tie-aware recall@10 against exact 768-d cosine: see table below |

| Space | recall@10 (set overlap) | recall@10 (tie-aware) | MRR of exact top-1 |
|---|---|---|---|
| AE latent_256 | 0.888 | 0.888 | 0.937 |
| MRL prefix 256 | 0.841 | 0.841 | 0.927 |
| AE latent_128 | 0.828 | 0.828 | 0.908 |
| MRL prefix 128 | 0.753 | 0.754 | 0.873 |
| AE latent_64 | 0.736 | 0.736 | 0.842 |
| MRL prefix 64 | 0.621 | 0.621 | 0.795 |
- Reconstruction cosine on the full snapshot: 0.959 (256), 0.929 (128), 0.898 (64); matches the training receipt (0.957 / 0.924 / 0.891, held-out).
- **Reading:** on this diagnostic the faithful v3 checkpoint beats the same-dimension MRL prefix at every tier. The Session 121 failure (old AE 64-d recall@10 0.097) concerned a June autoencoder (`models/autoencoder/`) and an evaluator with the wrong activations; it does not describe v3.
- **Caveats (do not overstate):** queries include rows the model trained on (optimistic; the exact held-out split was not reconstructed); recall is agreement with exact 768-d neighbours (routing/prefilter quality), not judged relevance; the cohort has no per-row revisions, so the gate verdict `BLOCKED_NO_REVISION_QUALIFIED_COHORT` stands; no 4-bit quantization was applied, so this is not a TurboVec result.

## 3. Daily Graphify downstream chain (errors)
| Date | readiness | pagerank | kanban_emit | turbovec | Result |
|---|---|---|---|---|---|
| 10-15 | timeout | pass | fail | pass | incomplete |
| 10-16 | timeout | pass | fail | fail | incomplete |
| 10-17 | pass | pass | pass | timeout (180 s) | incomplete |
| 10-18 | pass | pass | pass | timeout (180 s) | incomplete |
| 10-19 | timeout (60 polls, 176 s) | pass | fail (`Exit code null`) | timeout (180 s) | incomplete |
- All runs are `dry-run`; `kanban_db_write` passes with no writes.
- **TurboVec timeout is explained** by the empty index (`indexed:0`) and likely wrong-interpreter/unbuilt slot; it started failing after 10-15.
- **`readiness` timeouts are explained (probed 2026-10-19):** the chain polls `GET /api/graphify/status` on SvelteKit `:5173` every 2 s (script `scripts/atlas/graphify-trigger-downstream-pipeline.mjs`, 120 s budget). That endpoint now returns **HTTP 500**, the same Vite error as `/demos/bento-dashboard`: `ERR_INVALID_ARG_VALUE ... '\0virtual:__sveltekit/environment'`. The dev server's SSR is broken, so every poll fails. A Vite-only restart plus `.vite/deps` clear is the likely fix (needs your go; do not touch `:8090`).
- **`kanban_emit` `Exit code null`:** the script records the child's exit `code`; `null` means the child ended by a signal (killed or crashed), not a normal non-zero exit. The cause is not proven; the child is `graphify-langgraph-pipeline.mjs --stage kanban_task`. It passed on 10-17 and 10-18 and failed on 10-15, 10-16, 10-19, which tracks the days the dev server was unhealthy (hypothesis only).
- ACE startup log (`logs/task-output/ace-startup-latest.log`, 2026-10-19 12:57) tail shows `Gates 0/7`, PostgreSQL/Qdrant FAIL lines and `0 USED_CONCEPT` edges; only the tail was read, so the cause of those FAIL lines is unverified.
- Daily lifecycle receipt (`graphify-daily-lifecycle-v1.json`) is dated 2026-09-15 and shows a COMPLETED execution over 25,542 sources; the AST semantic codebase index is not finished.

## 4. Environments (`docs/architecture/atlas-python-environment-routing.md`)
| Env | Use |
|---|---|
| WSL `atlas-rapids-cu13` (3.14.6) | cuVS/cuGraph/cuDF/KMeans; only env with fastapi+uvicorn |
| WSL `atlas-cutile-cu132` (3.14.6) | cuTile/torch 2.14+cu132; pytest installed this session; 17 residency tests passed (77 s) |
| WSL `atlas-dspy-exp` (3.13.13) | DSPy only; no fastapi/torch |
| `py -3.13` | AE training, XGBoost/torch classifiers, TurboVec (must be 3.13) |
| 10 repo venvs | 4 have no recorded owner (`.venv`, `.venv-cu130`, `.venv-gemma4`, `sveltekit-frontend/.venv` 3.9) |
- Tooling rule: search with Grep/`rg`; run WSL one-liners via PowerShell stdin or `bash -c '...'` (Git Bash rewrites `/home/...`).

## 5. JSON / CUDA acceleration (CPU baselines, no GPU run)
| Measurement | Result |
|---|---|
| simdjson backend | `icelake (Intel/AMD AVX512)` |
| 768-d embedding text, 2,805 rows | native `simdJsonExtractNumbers` 36,056 rows/s vs V8 `JSON.parse`+`Float64Array.from` 10,879 rows/s (3.3x), parity max diff 0 |
| 1 KB NDJSON lines (25 MB) | V8 154-289 MB/s; native `simdJsonParse` returns a validated string, so it is not a parse benchmark |
| All 274,465 chunk vectors | about 8 s on CPU, so a GPU JSON path is not justified by speed |
| GPU | 7,846 / 8,192 MiB used by Ornith; no headroom for cuDF/cuVS without the Prepare task |
| Libraries | rapids env: cudf/pylibcudf 26.6.1, rmm, cupy, cuda-python; cutile env: cuda-tile 1.5.0, nvcc 13.2.78; nvcomp, kvikio and GPU-JSON libraries not found |
- Bulk vectors should not travel as JSON; Arrow IPC / raw F32 mmap is the better fix.

## 6. Feature taxonomy (`docs/architecture/atlas-feature-taxonomy-sveltekit-draft.md`)
- `atlas_packets.feature_label` holds file names (40,814 distinct; top `LLMS.md` 2,476, `+server.ts` 2,113), not product features; `atlas_feature_labels` does not exist in the live DB.
- Draft: 21 SvelteKit labels mapped to existing routes. `forum`, `photo_editor`, `video_editor` have no route. Open: `chat` vs `ai_chat`; storage needs schema approval.

## 7. Risks and traps
| Item | Note |
|---|---|
| `domain_id` | 2,214 chunks populated with only 13 labeled rows behind the classifier (unapproved partial backfill, DOMAIN-ID-COLUMN-01); do not continue |
| SOM/manifold columns | populated but hash-derived or July-era; do not treat as a trained SOM |
| `ops.*` MCP gate | `requireToken` accepts any non-empty string; not authentication |
| Disk | C: 15.7 GB free |
| Benchmarks | scratch scripts in the session scratchpad, not committed |

## 8. Recommended order
| # | Step | Approval needed |
|---|---|---|
| 1 | Rebuild TurboVec index + domain slot from Postgres under `py -3.13`, rerun chain | yes |
| 2 | Investigate `readiness` timeouts and `kanban_emit` `Exit code null` (read logs, no writes) | no |
| 3 | Decide taxonomy and `domain_id` rows | yes |
| 4 | Finish AST semantic indexing; Phase 20 gates | existing deferral |
| 5 | Revision-qualified cohort export, then `ae:train` plan-only to full run | yes |
| 6 | Real SOM writer; gold labels (200 rows); did-you-mean and multi-hop probes | yes / human |
| 7 | Optional: `:8121` `synthesize`, DSPy FastAPI, cuDF test (free `:8090` first) | yes |

## 9. Artifacts (all untracked, nothing pushed)
`scripts/atlas/pipeline-status-v1.mjs` | `docs/reports/pipeline-status-v1.json` | `docs/architecture/atlas-python-environment-routing.md` | `docs/architecture/atlas-feature-taxonomy-sveltekit-draft.md` | this report | `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md` (appended sections, shared with other sessions' edits)

## Deferred (operator)
BitFrost KV cache (prohibited today), Titans 2.0, UMAP, YaRN, DSPy prime agent / RLM, ACP / A2A / MCP tool-calling, per-query OpenCode dispatch.
