# Dev/Eval vs Canonical Hardening Guardrail
**Status**: DRAFT | **Date**: 2026-10-29 | **Owner change**: `openspec/changes/parent-atlas-repair-candidate-feature-matrix` (REC-*)

## TL;DR
Dev, test, eval and shadow work (MLP adaptive backprop, rerankers, challengers, derived scores) must not be production-hardened or treated as canonical until its own proof gate passes. Hardening means DDL, migrations, index changes, cache warm, daily-chain wiring as authoritative, or feeding ranking. Postgres stays truth; everything below is derived.

## Tiers

| Tier | Meaning | May do | May NOT do |
|---|---|---|---|
| DEV | exploratory code/scripts | dry-run, scratch output | write canonical tables, cron/daily chain |
| EVAL | measured against reviewed set | write `canonical=false` evidence tables | become a rank vote |
| SHADOW | runs beside prod, output ignored | log/compare | affect results |
| CHALLENGER_ONLY | candidate owner | tie-aware recall receipts | identity, RRF vote, writes |
| CANONICAL | single owner per capability | production hardening | (needs gate receipt) |

## Current classification (from repo docs; re-verify before citing)

| Item | Tier | Gate to promote |
|---|---|---|
| MLP / adaptive backprop (`openspec/changes/parent-atlas-adaptive-backprop-hll-monitoring`) | DEV/EVAL (contents not reviewed here) | sealed `LearningOutcomeV1`, shadow mode only, per CLAUDE.md remaining order |
| `AtlasGemmaRankV1`, MICRO-* | EVAL | FP32 parity, trained rank head; BF16/FP16 unresolved |
| Latent AE (current code) | no checkpoint | `TRAINING_AUTHORITY_PROVEN`; legacy v3 is diagnostic only |
| TurboVec `:8791` | CHALLENGER_ONLY | tie-aware recall; pgvector HNSW stays ANN owner |
| Viterbi MCP tool selection | CHALLENGER_ONLY | 0/9 reintegration preconditions |
| `atlas_feature_recommendation_index.todo_score` | DERIVED gap score (work queue, not relevance) | never blend into retrieval rank |
| Summaries (`codebase_chunk_index.summary`, 14.7%) | DERIVED | coverage + provenance qualified; backfill only chunks with 768-d embedding, authorized, pre-image + readback |
| Authority tables (`atlas_graph_authority_scores_v2`) | not a rerank feature | use `graph_node_metrics` |

## Rules
- No migration/DDL without: `drizzle/manual/*.sql`, rollback-tested, explicit approval, row-count readback.
- Daily-chain additions are non-fatal and write derived tables only (REC-03 follows this).
- A passing dry-run is DRY_RUN_PROVEN, not production-ready.
- Ranking owners: relevance top-k = pgvector HNSW via SearchRuntime; `ops_gpu_topk` small rerank batches only.

## Docker cleanup record (2026-10-29, operator "go")
| Removed | Rebuild |
|---|---|
| containers: image-synthesis, docling-vlm, go-search, caddy, legal-ai-searxng, atlas-dspy-repair-worker, langextract-8101 | `docker compose up` (defined in docker-compose.yml / docker/) |
| unused images (~4.9 GB, list not captured before prune) | likely postgres:18 x2, rust:* x3, otel, jaeger, python:3.13-slim |
| build cache | automatic |
| UNVERIFIED rebuildability | `atlas-go-embedding-readback:20261006`, `legal-ai-go-retrieval:local-identity-v1` (local proof tags) |

Volumes untouched. C: not freed until the VHDX is compacted (elevated, Docker stopped).

## Next Steps
- Operator: confirm which removed items were in use.
- `REC-02` summary backfill needs separate write authorization.
- Draft duplicate-index SQL (REC-05), approval before apply.

## Image synthesis / docling-vlm extract (2026-10-29, read-only)
Source is intact in git (`docker/image-synthesis/app.py` 1,314 lines; `docker/docling-vlm/app.py` 28 KB). Removal lost only a rebuildable image and container layer; model weights are NOT baked in (downloaded at runtime, no HF volume), so first run re-downloads FLUX/Wan/DepthAnything.

| Capability | Where | Notes |
|---|---|---|
| Keyframe image | FLUX.1-schnell, NF4/INT8 (~4 GB) | `POST /generate/image` |
| Video | Wan2.1-T2V-1.3B, bf16 + TorchAO INT8 (~6 GB) | `/generate/video`, i2v default |
| Depth / point cloud | DepthAnything-V2-Large (~1.3 GB) | `/depth` |
| Crime-scene pipeline | who/what/why/how `ScenePrompt` -> keyframe -> video -> depth | `/reconstruct`, `/reconstruct/stream` |
| Gaussian splat | COLMAP + gsplat, 6-30 photos, `ENABLE_GAUSSIAN_SPLATTING=true` | `/reconstruct/gaussian-splat`; browser side `src/lib/webgpu/gaussian-splat-renderer.ts` + 2 WGSL shaders |
| Glyph conditioning | `/glyph/condition`: CHR97 tile atlas -> 768-d conditioning vector, query via `embeddinggemma:latest` | worth keeping; ties NES glyph layer to generation |
| docling-vlm (:8085) | docling-parse + ultralytics YOLO + whisper | PDF layout, detection, audio |

Ampere note: INT8/NF4 (not FP8) is the design choice here; RTX 3060 Ti (sm_86) has no FP8 tensor cores. Not a stable-diffusion stack: FLUX + Wan.

Lineage gap (live Postgres): `atlas_packets` rows for these files carry `feature_label` = filename only and empty `summary`. `feature_id` is filename-derived and collides: `docker.app` spans 3 distinct `source_ref`s (image-synthesis/app.py `packet:7adb63a91858`, docling-vlm/app.py `packet:e0345940e5a7`, +1), `docker.Dockerfile` spans 13, `docker.requirements` 4. Join only on `packet_key` + `source_ref` (never `feature_id` alone).

Proposed semantic labels (proposal only; canonical feature_label mutation is human-gated, not applied):
| source_ref | proposed feature_label |
|---|---|
| docker/image-synthesis/app.py | image-synthesis.crime-scene-reconstruction |
| docker/docling-vlm/app.py | docling-vlm.document-vision-audio |
| src/lib/webgpu/gaussian-splat-renderer.ts | webgpu.gaussian-splat-renderer (consumer of /reconstruct/gaussian-splat output) |
| /glyph/condition (app.py L1195-1296) | image-synthesis.glyph-conditioning (depends on chr97 tile atlas, embeddinggemma) |

Dependents found: `openspec/changes/visual-element-rendering`, `parent-atlas-transport-memory-boundaries`, webgpu gaussian files; code path to :8092 from SvelteKit was not found (api-endpoints.ts :8092 is a different Go service).
