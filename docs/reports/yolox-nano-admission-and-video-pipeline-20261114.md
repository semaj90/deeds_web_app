# YOLOX-Nano admission and end-to-end video frame pipeline (2026-11-14)

**Status**: YOLOX-Nano file CREATED (SHA-256 pinned, graph checked) | parity NOT_PROVEN | admission in code PARTIAL | pipeline NOT_PROVEN end to end

## TL;DR

Use YOLOX-Nano (Apache-2.0, official Megvii release) on ONNX Runtime CPU. Sample frames at 1 FPS and filter by scene change before detection. Keep Ornith or Gemma for explanations only. The model card is at `sveltekit-frontend/models/yolox_nano.model-card.md`.

## Model choice

| Candidate | License evidence | Decision |
|---|---|---|
| YOLOX-Nano (Megvii, 0.1.1rc0) | Apache-2.0 repo `LICENSE`; ONNX downloaded, SHA-256 `c789161e…b7d` | **Use** (pending parity and admission) |
| YOLOX-Tiny ONNX (`yolox_tiny.onnx`, 20 MB) | Same repo, Apache-2.0 | Accuracy comparison only |
| YOLOv10n / v10s | Upstream THU-MIG is AGPL-3.0 per the code comments; not verified | Local evaluation only, never production |
| YOLOv8n | AGPL-3.0 | Reject |
| `yolo-doc.onnx` | Not present in `models/` | Keep allowlisted only with a checksum receipt |

Note: the pasted notes say YOLOv10n is "Apache 2.0 ✅". I could not verify that, and it conflicts with the AGPL statement in `yolo.ts`. Treat YOLOv10 as unadmitted until its upstream LICENSE is checked.

## Admission: current state

Working tree `sveltekit-frontend/src/lib/server/yolo.ts` (uncommitted, another session's changes):
- `assertProductionYoloModelAdmission` admits by basename (`yolox_nano.onnx`, `yolo-doc.onnx`) and checks SHA-256 only when `NODE_ENV === 'production'`.
- Gaps: dev, CI and fixtures skip the check, and `yolov10n`/`yolov10s` remain resolvable.

Required change (not made here, needs ownership confirmation):
1. Check family and SHA-256 in every environment. Fail closed on unknown files or missing digests.
2. Keep restricted models (YOLOv10, AGPL) only in an explicit research test policy. Never fall back to them implicitly.
3. Add a versioned admission manifest (`docs/reports/` or `config/`) with URL, revision, license, SHA-256, tensor schema.
4. Add YOLOX preprocessing/postprocessing as its own adapter. Do not reuse YOLOv8 decoding.

## End-to-end pipeline (recommended)

```
upload (evidence row + SeaweedFS original)
  → upload_pipeline job (durable worker)
  → ffprobe metadata (fail closed if unavailable)
  → keyframe sampling: 1 FPS, plus scene-change (dHash) filter
  → YOLOX-Nano ONNX, CPU  (preproc 416 letterbox → session.run → grid decode → NMS)
  → detections JSON (boxes mapped back to source frame)
  → evidence_frames row (metadata JSONB: yolo_model, sha256, detections, frame size)
  → text transcript (Whisper, when available) → EmbeddingGemma 2 text vector
  → Ornith/Gemma: explanation of detections only (never replaces detection)
  → viewer readback (PostgreSQL, SeaweedFS object)
```

Sampling example: a 4-hour video at 30 FPS is 432,000 frames. At 1 FPS that is 14,400 frames before scene-change filtering.

## Status by step

| Step | Status | Evidence |
|---|---|---|
| Model file downloaded, SHA-256 pinned | CREATED | `models/yolox_nano.onnx`, `c789161e…` |
| Graph checker and CPU run | PROVEN (synthetic input) | onnx checker pass; output `(1, 3549, 85)` |
| Upstream preproc/postproc source read | DONE (read only) | `yolox/data/data_augment.py`, `yolox/utils/demo_utils.py` |
| Adapter in repo (YOLOX pre/post) | NOT_PROVEN | not yet written |
| Parity vs upstream demo on real image | NOT_PROVEN | next step |
| Admission for dev/CI/fixtures | PARTIAL | production-only check in working tree |
| CPU latency/RAM benchmark | NOT_PROVEN | next step |
| Worker integration (durable queue) | NOT_PROVEN | existing video worker does not call `:8095/analyze/frame` |
| Single authorized upload, queue to viewer | NOT_PROVEN | no run yet |

## Next steps (in order)

1. Write the YOLOX adapter (letterbox, decode, NMS) in `scripts/atlas/` or the server YOLO module; compare with the upstream demo on 5 real images; record max box/score deltas.
2. Benchmark YOLOX-Nano and YOLOX-Tiny on CPU: p50/p95 latency, throughput, peak RAM, load time.
3. Add the admission manifest and environment-wide SHA-256 check (after confirming ownership of the `yolo.ts` diff).
4. Wire sparse frame detection into the existing media worker, then run one authorized video end to end.
5. GPU only if the CPU benchmark fails the workload target. Check ONNX Runtime CUDA first; TensorRT-RTX 1.7 only after that.

## Environment (checked 2026-11-14)

- GPU: RTX 3060 Ti, driver 580.88, 2047 MiB used / 5978 MiB free at check time
- Windows 10.0.19045; WSL distro `Ubuntu` is version 2 and stopped
- Python 3.13: ONNX Runtime 1.27.0 (CPU provider only), OpenCV 4.12.0, PyTorch 2.8.0+cu128 (CUDA available)

## Unverified claims from the pasted notes

- `evidence_frames` table and `metadata` JSONB shape: defined in a DRAFT SQL file, not applied (the earlier audit found the table absent).
- `:8095/analyze/frame` endpoint: not found in the earlier audit. Re-check before use.
- "YOLOv10n Apache 2.0": unverified (see above).
