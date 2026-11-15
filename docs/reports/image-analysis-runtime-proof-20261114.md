# Parent Atlas image/video runtime proof — 2026-11-14

## Status

The image and video owners exist and are wired into the existing `analysis_jobs.upload_pipeline` path. Current proof covers individual runtime stages, not a complete authorized upload-to-viewer journey. No production evidence or vector rows were retained.

## Verified image stages

### Object detector

Command, from `sveltekit-frontend`:

```powershell
$env:ATLAS_DETECT_FIXTURE=(Join-Path $env:TEMP 'atlas-yolo-bus-fixture.jpg')
$env:YOLO_PYTHON='C:\ProgramData\chocolatey\bin\python3.13.exe'
npm exec -- vitest run src/lib/server/analysis/evidence-analysis-pipeline.detection.spec.ts
```

Observed output: `REAL_DETECT {"source":"local","errors":["service:DOCLING_SERVICE_URL_NOT_CONFIGURED"],"objects":["person:0.89","person:0.88","person:0.88","bus:0.84"]}`; 1 file, 7 tests passed. At that time a hidden-file search found only `sveltekit-frontend/models/yolov8n.onnx`. The official THU-MIG v1.1 release provides an 8.95 MB `yolov10n.onnx`, but the repository and ONNX model card are marked AGPL-3.0; do not classify that artifact as Apache-2.0. I did not add it to the model search path. YOLOv10 remains available for local evaluation, but production admission rejects it; YOLOv8 and unknown models are also rejected. Production admission now accepts only specific detector filenames and requires the exact `YOLO_MODEL_SHA256` match before inference. The run used Python 3.13 ONNX Runtime/OpenCV. The normal `python` resolves to Python 3.14.7 and does not have `onnxruntime`, so the app needs an explicit `YOLO_PYTHON` runtime setting before the default queue can use this local detector.

### Apache-licensed COCO detector candidate

To avoid relying on either AGPL detector, downloaded the upstream YOLOX-Nano ONNX artifact into the existing ignored `sveltekit-frontend/models/` directory. The file is 3,659,407 bytes and SHA-256 is `c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d`, matching the pinned artifact and Apache-2.0 attribution in the [YOLOX model card](https://huggingface.co/skillsafe-ai/yolox-nano) and the [upstream YOLOX repository license](https://github.com/Megvii-BaseDetection/YOLOX). The detector resolver now includes `yolox_nano.onnx`; production admission requires this basename plus an exact `YOLO_MODEL_SHA256` match. Inference uses its 416×416 input and 3549×85 output format, objectness-weighted class scores, NMS, and source-coordinate mapping. This is an object-proposal model, not a legal-relevance or identity classifier.

Real fixture command, from `sveltekit-frontend`:

```powershell
$env:ATLAS_DETECT_FIXTURE=(Join-Path $env:TEMP 'atlas-yolo-bus-fixture.jpg')
$env:YOLO_PYTHON='C:\ProgramData\chocolatey\bin\python3.13.exe'
npm exec -- vitest run src/lib/server/yolo-model-admission-v1.spec.ts src/lib/server/analysis/evidence-analysis-pipeline.detection.spec.ts
```

Observed result: YOLOX returned nine source-coordinate detections on the bus fixture (persons and bus; confidence 0.52–0.87). Both focused files passed (14 tests). The first real run exposed a PIL indentation issue and then fully out-of-frame predictions; the fallback was corrected, and clipped degenerate boxes are now dropped while malformed transforms still fail closed. The successful fixture ran through the normal local detector path with the Windows Python 3.13 CPU ONNX Runtime. This proves local inference only, not a queued authorized upload or durable image-analysis readback.

### EmbeddingGemma 2 image vector and PostgreSQL outbox

Command, from `sveltekit-frontend`:

```powershell
$env:ATLAS_EVIDENCE_MULTIMODAL_SCRATCH_TEST='1'
$env:ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR=(Resolve-Path '..\models\embeddinggemma2\onnx-q8').Path
npm exec -- vitest run src/lib/server/evidence/evidence-multimodal-vector-persistence-v1.integration.spec.ts
```

Observed output: 1 test file, 2 tests passed; the actual Q8 image-encoder/PostgreSQL readback case took 26.2 seconds. It independently read a 768-D image vector and its `PENDING` projection-outbox row, then rolled back the scratch transaction and fixture schema. The image analyzer was injected as a fixture in this test; it does not combine real YOLO with the image encoder in one run.

### Video stages

The opt-in `durable-video-analysis-v1.media.integration.spec.ts` passed with real FFmpeg/FFprobe extraction, YOLO, EmbeddingGemma frame/transcript embeddings, and PostgreSQL frame/transcript/vector/outbox readback in a rollback-only transaction. Transcript text was test-provided and artifact storage used a test adapter, not Whisper or SeaweedFS.

## Current runtime configuration

- `FFMPEG_PATH` and `WHISPER_PATH` in `.env` are `REPLACE_ME` placeholders.
- The checksum-verified FFprobe binary is in the OS temporary directory; `FFPROBE_PATH` is not configured. The successful integration test set both executable paths explicitly for its process.
- Python 3.13.5 has `onnxruntime`, `numpy`, `cv2`, and PIL; Python 3.14.7, which is the default `python`, lacks ONNX Runtime.
- TCP probe: `127.0.0.1:8090` closed; `127.0.0.1:11434` reachable. Ollama `/api/tags` reports `embeddinggemma2:q8_0` and `ibm/granite-docling:258m`; it reports no Ornith model. The app's Ornith/llama-server path is therefore unavailable in this runtime.
- `faster_whisper` and `whisperx` are not installed in the default Python environment. No live transcript generation was exercised.
- TCP `127.0.0.1:8095` is reachable. Its current OpenAPI route list is `/health`, `/analyze`, and `/oak/health`; it does not expose `/analyze/frame`. The current durable video worker has no 8095 sidecar caller and writes frame findings into `evidence.ai_analysis` JSONB, not `evidence_frames`. The `evidence_frames` insert found in source is in legacy synchronous `video-ingest-service.ts`; its associated `20261114_evidence_child_tables_canonical_evidence_fk_v1_DRAFT.sql` is still a draft, not proof of an applied table. Existing Miniforge clients call ranking/classification/clustering endpoints, not a video-frame method.

## Remaining end-to-end gates

- Configure durable FFmpeg/FFprobe paths and the supported YOLO Python executable for the worker process.
- Run one authorized image through the actual queued worker using the real analyzer and detector, save/read the full source-bound analysis and vector/outbox record, then open the same authorized exhibit in the Evidence Board.
- Run one authorized video through the durable queue, real SeaweedFS artifacts, a real transcription runtime, PostgreSQL readback, and transcript/frame navigation in the viewer.
- Make VLM/Ornith and depth/mask stages available and persist their model/preprocessing revisions when enabled. Their unavailability must remain visible as partial analysis.

```yaml
likely_cause: Image and video pipeline components are wired, but app-level media/model configuration and one combined authorized upload/readback/browser proof remain incomplete.
evidence:
  - sveltekit-frontend/src/lib/server/queue/queue-worker.ts
  - sveltekit-frontend/src/lib/server/evidence/process-evidence-image-canonical-v1.ts
  - sveltekit-frontend/src/lib/server/features/evidence/video/durable-video-analysis-v1.ts
  - sveltekit-frontend/src/lib/server/analysis/evidence-analysis-pipeline.detection.spec.ts
  - sveltekit-frontend/src/lib/server/evidence/evidence-multimodal-vector-persistence-v1.integration.spec.ts
patch_targets:
  - sveltekit-frontend/.env
  - sveltekit-frontend/src/lib/server/analysis/evidence-analysis-pipeline.ts
  - sveltekit-frontend/src/lib/server/evidence/process-evidence-image-canonical-v1.ts
safe_next_command: "Review media runtime paths and set explicit local FFmpeg, FFprobe, and YOLO Python values in the worker launch configuration."
smoke_command: "cd sveltekit-frontend && npm exec -- vitest run src/lib/server/yolo-model-admission-v1.spec.ts src/lib/server/analysis/evidence-analysis-pipeline.detection.spec.ts"
report_path: docs/reports/image-analysis-runtime-proof-20261114.md
```

**GAN:** CREATED: image/vector and video analysis stages. WIRED: image/video handlers in the existing upload pipeline and PostgreSQL vector outbox. PROVEN: real detector, Q8 image-vector DB/outbox readback, and rollback-only video runtime stages in separate runs. DONE: no; app runtime variables, Whisper/VLM availability, SeaweedFS and authorized upload-to-viewer proof remain open.

## Follow-up verification (2026-11-14)

The pasted YOLO review was checked against the current resolver. The production admission function already existed; it now allows only the pinned production candidates (`yolo-doc.onnx` and `yolox_nano.onnx`) and requires an exact `YOLO_MODEL_SHA256` match. YOLOv8 and the AGPL-3.0 THU-MIG YOLOv10 artifacts remain rejected in production. The local YOLOX-Nano file hash was rechecked against the pinned SHA-256.

Scoped follow-up fixes resolved the media-related diagnostics from the earlier Svelte check: canonical evidence updates now use the PostgreSQL schema owner, object storage receives a content-type metadata record, transcript summarization accepts its actual text-only needs, audio transcription receives a job ID, FFprobe stream selection uses `codecType`, and the artifact upload adapter matches its void contract. The focused YOLO/video run passed 4 files, 31 tests passed, 1 skipped; `git diff --check` passed for the scoped patch.

`npm run check` still exits with 3 errors and 11 warnings in 6 files. The remaining errors are outside the server-side image/video patch: browser OPFS write typing and NES/FSM typing. No authorized upload, live SeaweedFS write, Whisper generation, or upload-to-viewer proof was performed in this follow-up.

## Source-bound depth map readback follow-up (2026-11-14)

The authorized image depth-map route now reads the current `evidence_multimodal_vectors` metadata first, requires matching source revision, `ESTIMATED` status, and the configured `atlas-artifacts` bucket, then validates the digest-qualified object key before retrieval. The existing legacy `aiAnalysis.depthAnalysis` path remains a compatibility fallback when canonical metadata is unavailable. Canonical depth artifacts are source-revision and content-digest keyed; the writer verifies SeaweedFS readback before reporting success.

A brace mismatch in the route was corrected. Validation order now rejects malformed recorded digests as 422 before comparing digest-qualified keys, and rejects mismatched valid keys before object retrieval. Focused verification: `npm exec -- vitest run src/lib/server/evidence/evidence-visual-analysis-v1.spec.ts 'src/routes/api/evidence/[id]/depth-map/depth-map.route.spec.ts' 'src/routes/api/evidence/[id]/multimodal-analysis/multimodal-analysis.route.spec.ts' src/lib/components/evidence/evidence-image-tools.spec.ts` — 4 files passed, 28 tests passed. Scoped `git diff --check` passed. These are mocked route/service tests; no live depth model, SeaweedFS readback, upload, or browser session was run.


## Follow-up — persisted image thumbnail and canonical detector boundary (2026-11-14)

The canonical queued image processor now creates a deterministic 256px maximum-edge JPEG thumbnail with Sharp auto-orientation, stores it in the configured `atlas-artifacts` bucket under a source-revision and output-digest-qualified key, reads it back, and records a validated manifest in PostgreSQL metadata. The authorized multimodal-analysis read route only returns the thumbnail manifest when its bucket, source revision, and content-addressed key match the current source. This is a viewer derivative; it is not used as detector or embedding input and does not replace the immutable source.

The canonical image worker now calls the detector-only adapter for object detection. This avoids invoking the older general analysis pipeline that also writes Redis, graph connections, and its legacy analysis cache. Existing image embeddings still use the Q8 EmbeddingGemma implementation and PostgreSQL/outbox writer. The rollback-only PostgreSQL integration test exercised actual Q8 image embedding and now also validates the thumbnail descriptor; its fixture artifacts and records are rolled back.

Verification in this follow-up:
- Focused Vitest: 4 files passed, 20 tests passed, 2 skipped in the combined run. The opt-in PG18 integration was separately enabled and passed 2 tests, including actual Q8 image inference and rollback-only PostgreSQL/outbox readback.
- `git diff --check` passed for the scoped image pipeline files; Git emitted only LF-to-CRLF notices.
- `npm run check` completed with 3 existing errors and 11 warnings in unrelated files: OPFS `Uint8Array` write typing, NES/FSM fixture feature-label typing, NES/FSM report `alignmentBytes`; warnings concern unused selectors and captured initial state. No diagnostics point to the image changes.

Remaining image-analysis work: there is no authorized byte-serving endpoint/UI path for displaying the stored thumbnail; SAM2 masks and depth estimation still lack proven canonical upload-worker persistence; object-crop embeddings/search and reviewer adjudication remain unwired; no live SeaweedFS artifact readback or authorized upload-to-viewer browser proof was run. The full image acceptance goal therefore remains open.

GAN: CREATED — revision-bound image thumbnail manifest and detector-only adapter. WIRED — canonical queued image processor, existing artifacts bucket, authorized manifest readback. PROVEN — focused tests and rollback-only actual Q8/PG18 integration. DONE — no; live service/browser and remaining analysis/viewer gates are open.

## Follow-up — source-bound object-crop embeddings (2026-11-14)

The canonical image worker now deterministically selects up to four valid, source-pixel detector boxes and derives bounded JPEG crops from the immutable source bytes. It embeds each crop with the same configured EmbeddingGemma 2 image encoder, then persists the vector through the existing PostgreSQL-first multimodal writer/outbox. Crop locators retain the original source revision, exact original-pixel box, crop policy revision, detector label/confidence, and unreviewed-proposal state. Crop input hashes identify the derived crop bytes; they do not replace the parent evidence revision. A zero crop limit correctly produces no crops.

Verification: focused unit suite passed 4/4. The opt-in integration passed 2/2 against local PostgreSQL 18, including actual Q8 image embeddings for the whole image and one object crop, independent readback of both 768-D vectors and their outbox rows, exact crop locator/hash/proposal metadata, and rollback of fixture rows and DDL. `git diff --check` passed. This proves the image stage and rollback-only database path, not production writes, SeaweedFS, authorized upload-to-viewer behavior, or video.

GAN: CREATED — deterministic source-pixel crop embeddings. WIRED — existing canonical image worker, EmbeddingGemma 2 encoder, PostgreSQL vector/outbox writer. PROVEN — actual Q8 whole-image and crop vector readback in rollback-only PostgreSQL 18 integration. DONE — no; live upload, detector-weight licensing/runtime, viewer crop navigation, and video path remain open.

### Crop-vector read-path regression fix

After crop vectors were added, the authorized image-analysis, thumbnail, and depth-map routes could select the newest crop row as if it were the whole-image record. All three queries now explicitly select `source_locator.kind = whole_image`; route contract tests assert this filter. The three route suites passed 22/22; the analysis/processor suites passed 9/9. The previous full `npm run check` attempt did not finish: its Node process used about 7.1 GB resident memory with no checker diagnostics, so it was stopped. No compile-pass claim is made for this follow-up.

### Detector artifact license admission

The ignored local `yolox_nano.onnx` is present (3,659,407 bytes), and its SHA-256 matches the local model card (`c789161e...18a0b7d`). The upstream repository and ONNXRuntime guide identify the model/release and Apache-2.0 repository license, but they do not separately state a pretrained-weight grant; an upstream issue requests clarification. Production admission now rejects YOLOX-Nano even when its checksum is pinned. Keep it available only for local evaluation until the weight grant is explicit. The admission suite passed 8/8. This also means real-detector acceptance remains open; do not call the image pipeline production-ready based on the current local artifact.

## Follow-up — authorized image thumbnail readback (2026-11-14)

Added a revision-qualified, access-controlled thumbnail byte route and viewer display. The route checks the canonical evidence permission, revision-bound manifest, exact object key/bucket, byte limit, SHA-256, and JPEG framing before serving. Vitest route and client checks passed (8/8); combined image tests passed (24/24 before the final JPEG-format regression case). Scoped diff check passed. Full `npm run check` reports 3 errors and 11 warnings in unrelated OPFS/NES-FSM/courtroom files; no diagnostics point to these changes. Browser/SeaweedFS live proof remains open, and OpenSpec tasks 5.1–5.5 remain unchecked.
