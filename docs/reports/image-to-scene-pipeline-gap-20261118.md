# Image-to-scene pipeline gap audit

Date: 2026-11-18

## Scope

Read-only source and receipt audit for the proposed image/video-to-indexed-scene pipeline. No evidence records, object stores, database rows, caches, or scene revisions were changed.

## Current owners

- Image queue: `sveltekit-frontend/src/lib/server/queue/queue-worker.ts` calls `processEvidenceImageCanonicalV1`.
- Image analysis: `processEvidenceImageCanonicalV1` calls `analyzeEvidenceImageV1`, stores whole-image and selected object-crop vectors through the existing PostgreSQL multimodal vector owner, and records analysis as `OBSERVATION_ONLY`.
- Analysis lanes: `evidence-visual-analysis-v1.ts` runs the canonical detector and VLM, a depth lane, and an optional SAM 2 lane. SAM 2 remains feature-gated.
- Scene helpers: `object-observation-v1.ts`, `observation-placeholder-binding-v1.ts`, reviewed ground-plane track helpers, and the scene revision writer exist. The placeholder binding is illustrative camera-frame output, requires an explicit scale, and has no production caller.

## Main integration gap

Depth is split across owners. The queued analysis calls `IMAGE_SYNTHESIS_URL/depth` and stores/readbacks its result. Separately, `depth-producer-v1.ts` invokes the pinned local Python Depth Anything V2 Small worker and produces a validated plan-only attachment; it has no production caller. The local worker is therefore not yet the depth stage of the canonical queue.

Added `python/atlas_depth_anything_worker_v1.py` as a persistent service adapter for the existing `/depth` request/response shape. It loads only the pinned model snapshot once, defaults to CPU/two threads, rejects overlapping inference with HTTP 429, provides model-free `/live` plus model-dependent `/health`, and performs no storage writes. The canonical image-analysis owner validates receipt-bearing responses against source hash, PNG digest, weight digest, model identity/status and oriented source/output dimensions, and returns the weight digest with the depth metadata. The service is **CREATED only**: it was not started, configured as `IMAGE_SYNTHESIS_URL`, or run against an image. The pinned upstream model card identifies this checkpoint as Apache-2.0 ([Hugging Face model card](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf)).

The available receipts do not establish an end-to-end stored scene derivative:

- `depth-da2-small-smoke-receipt-20261118.json`: one scratch screenshot, CUDA, one-run relative-depth output; no storage or PostgreSQL attachment.
- `depth-wrapper-smoke-receipt-20261118.json`: source and output hash/dimension checks passed, but the attachment is plan-only and model-license status is unverified.
- `depth-evidence-rehearsal-receipt-20261118.json`: exact source was read from SeaweedFS and a compare-and-set rehearsal rolled back; planned depth object returned 404 and was not stored.

## Safe next gate

Configure and launch the persistent local worker through the approved service lifecycle, then prove `/health`, one scratch inference, and the existing analyzer's SeaweedFS artifact readback before any authorized evidence run. Require source revision, oriented dimensions, model/runtime revision, depth artifact digest, and exact artifact readback. Keep depth marked `relative_monocular`. Then create an unreviewed scene proposal that binds existing detections/masks/depth to the exact evidence and analysis revisions. Admit it to the scene only through the existing authorized scene revision and reviewer workflow.

Do not add a parallel evidence or scene table, treat a relative depth value as meters, or copy a detection directly into a world-space transform.

## Required closeout

```yaml
likely_cause: The canonical image-analysis queue and the local Depth Anything worker are separate paths, and image observations are not yet connected to the authorized scene-revision flow.
evidence:
  - sveltekit-frontend/src/lib/server/queue/queue-worker.ts
  - sveltekit-frontend/src/lib/server/evidence/process-evidence-image-canonical-v1.ts
  - sveltekit-frontend/src/lib/server/evidence/evidence-visual-analysis-v1.ts
  - sveltekit-frontend/src/lib/server/evidence/depth-producer-v1.ts
  - python/atlas_depth_anything_v1.py
  - docs/reports/depth-da2-small-smoke-receipt-20261118.json
  - docs/reports/depth-wrapper-smoke-receipt-20261118.json
  - docs/reports/depth-evidence-rehearsal-receipt-20261118.json
  - python/atlas_depth_anything_worker_v1.py
patch_targets:
  - python/atlas_depth_anything_worker_v1.py
  - sveltekit-frontend/src/lib/server/evidence/evidence-visual-analysis-v1.ts
  - openspec/changes/crime-scene-reconstruction/tasks.md
safe_next_command: "python -c \"import ast,pathlib; ast.parse(pathlib.Path('python/atlas_depth_anything_worker_v1.py').read_text()); print('DEPTH_WORKER_SYNTAX_OK')\""
smoke_command: "After operator-configured launch, GET /live and /health, then submit one scratch image and verify hash/dimension-checked artifact readback."
report_path: "docs/reports/image-to-scene-pipeline-gap-20261118.md"
```
