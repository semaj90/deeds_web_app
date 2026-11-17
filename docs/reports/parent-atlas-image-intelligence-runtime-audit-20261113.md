# Parent Atlas image intelligence runtime audit — 2026-11-13

## EmbeddingGemma 2 artifact and runtime

- Inspected the official `google/embeddinggemma-2` Hugging Face repository at pinned revision `f9972ac22e696a105c482202646979e33e4b5a1e`. It is Apache-2.0 and publishes a full multimodal Sentence Transformers checkpoint; its repository file list contains `model.safetensors` and processor/tokenizer files, but no `.onnx` artifact.
- Downloaded the pinned checkpoint to the WSL Hugging Face cache at `/home/james/.cache/huggingface/hub/models--google--embeddinggemma-2/snapshots/f9972ac22e696a105c482202646979e33e4b5a1e`.
- `model.safetensors`: 1,488,915,288 bytes; SHA-256 `197a32965d4b1105faf060417baa899e193fb73cd401f42ec9295234d5553d79`.
- Kept the shared RAPIDS Python environment unchanged. Created `/home/james/.venvs/parent-atlas-embeddinggemma2` with system site packages, and overlaid Transformers 5.20.2, Sentence Transformers 6.3.0, and torchvision 0.28.0. PyTorch 2.13.0+cu130 is inherited from the existing environment. The ordinary Sentence Transformers install was stopped when it began downloading a second 423 MB CUDA library; the isolated overlay used `--no-deps` and did not install a second Torch stack.
- CPU-only, network-disabled smoke loaded the actual checkpoint and encoded one synthetic image plus its text description. Output was `(2, 768)`, both vectors had norm `1.0`, and cross-modal cosine was `0.762511`. This proves local image/text encoding, not production retrieval, worker integration, audio/video encoding, GPU behavior, or PostgreSQL persistence.
- Current C: free space after download and runtime setup: 32,007,798,784 bytes. Recheck before any future model conversion or additional large artifact download.

## ONNX and VLM status

- Google’s pinned source repository has no official ONNX artifact; the official multimodal guide demonstrates Sentence Transformers/Transformers with PyTorch. A community Apache-2.0 ONNX export was subsequently found and audited below.
- `http://127.0.0.1:8090/v1/models` refused the connection. Ornith is therefore unavailable for current VLM analysis; the model registry also has its Ornith vision binding disabled.
- Ollama at `:11434` is reachable and advertises `ibm/granite-docling:258m`; no image inference was run. Granite-Docling is a document/layout/OCR-oriented option, not proof of general object detection or scene captioning.

## Pipeline wiring still missing

- The durable `upload_pipeline` worker fetches and hashes the original, then enters `processDocument`; it throws `EVIDENCE_TEXT_EXTRACTION_EMPTY` when an image has no extracted text. The image visual-analysis call occurs later in `processEvidenceDocumentCanonicalV1`, so it cannot rescue this no-text path.
- The repository has YOLO, visual-analysis contracts, a PostgreSQL-first multimodal vector writer, proposed additive DDL, and a Qdrant projector. The YOLO model files were not found in the expected `models/` paths in the earlier runtime inventory. The multimodal DDL is not installed in the scratch database, the writer is not called by the upload worker, and the projector is not registered with a running scheduler.
- No verified SAM2 or Depth Anything model runtime is installed. No image-analysis observations or EmbeddingGemma 2 vectors were independently read back from PostgreSQL/SeaweedFS. No Qdrant write was performed.

## Recommended next implementation slice

1. Add a bounded image-modality branch to the existing durable analysis job so image-only sources do not fail the text-extraction requirement; preserve originals and keep model outputs proposal-only.
2. Provide a persistent, revision-pinned PyTorch embedding worker using the downloaded checkpoint; do not load the 1.49 GB model per request and do not use the text-only Ollama GGUF for images.
3. Rehearse the existing multimodal writer against disposable PostgreSQL 18 in one rollback transaction, using the actual model-generated 768-D vector and a synthetic evidence row.
4. Wire authorized image-analysis readback in the Evidence Board. Only then add detection weights, SAM2/depth runtimes, or Qdrant projection.

## Status

- **CREATED:** Downloaded pinned full EmbeddingGemma 2 PyTorch checkpoint, isolated Python runtime, and the pinned community FP16 ONNX export for all three towers.
- **WIRED:** No production or application pipeline connection yet.
- **PROVEN:** CPU-only local image/text PyTorch embedding; CPU ONNX vision+text and audio+text tower-composition smokes against downloaded ONNX weights.
- **DONE:** No. Durable image-only processing, observations, canonical PostgreSQL write/readback, viewer binding, and projection remain unproven.

`likely_cause`: The app's durable upload job still routes image-only uploads through text extraction, while the downloaded full multimodal embedding model is not connected to an application worker.

`evidence`: Official Hugging Face revision and artifact inventory; model weight SHA-256 and CPU inference receipt above; current `processCanonical` text-empty failure; multimodal writer/DDL/projector files; live endpoint probes for `:8090` and `:11434`.

`patch_targets`: `sveltekit-frontend/src/lib/server/queue/queue-worker.ts`; `sveltekit-frontend/src/lib/server/evidence/process-evidence-document-v1.ts`; `sveltekit-frontend/src/lib/server/evidence/evidence-multimodal-vector-persistence-v1.ts`; `sveltekit-frontend/src/lib/server/evidence/evidence-multimodal-vector-projection-worker-v1.ts`; `sveltekit-frontend/src/lib/server/models/model-registry.ts`.

`safe_next_command`: Inspect the exact image-only durable worker contract and the existing scratch writer gate before changing upload completion semantics.

`smoke_command`: `wsl -e bash -lc 'HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 /home/james/.venvs/parent-atlas-embeddinggemma2/bin/python -c "import torch,transformers,sentence_transformers,torchvision; print(torch.__version__,transformers.__version__,sentence_transformers.__version__,torchvision.__version__)"'`

`report_path`: `docs/reports/parent-atlas-image-intelligence-runtime-audit-20261113.md`

## EmbeddingGemma 2 ONNX community export acquisition (2026-11-13)

- Located `onnx-community/embeddinggemma-2-ONNX`, pinned to repository revision `daa72c51243991dfcaf9f9137d2c573d8f7790c0`, declared Apache-2.0 and based on Google’s `google/embeddinggemma-2`.
- Downloaded its complete FP16 text, vision, and audio towers plus processor/tokenizer configuration to `/home/james/.cache/parent-atlas/embeddinggemma-2-onnx-fp16` (WSL cache; no model weights added to the Git worktree). The three external-data weights total 1,464,293,120 bytes.
- Local SHA-256 values match the Hugging Face LFS metadata for every ONNX graph and external-data file. The graph/data pairs are: text `model_fp16.onnx` + `.onnx_data`, vision `vision_encoder_fp16.onnx` + `.onnx_data`, audio `audio_encoder_fp16.onnx` + `.onnx_data`.
- Functional CPU smoke passed through Node `onnxruntime-node` 1.29.0 and the installed Transformers.js 4.2.0 processor components. Explicit vision-tower → text-tower inference returned a normalized `[1,768]` image/text embedding (L2 norm `0.99999965`); explicit audio-tower → text-tower inference returned normalized `[1,768]` (norm `1.00000009`). These use a synthetic geometric image and synthetic tone, so they prove graph execution and vector shape/normalization, not semantic quality or parity to the Google PyTorch checkpoint.
- The stock `AutoProcessor`/`AutoModel` convenience path did not compose the community export: Transformers.js reported unknown model class `embedding_gemma2`, and its text graph requires precomputed `image_features`, `video_features`, and `audio_features`. Explicit tower composition works for the tested image and audio cases. A production adapter must own this composition or pin a runtime version that correctly supports it; video timestamp/frame packing remains untested.
- PyTorch remains the reference path because it is the Google-supported integration and the actual checkpoint already passed a CPU image/text smoke. ONNX can be a deployment candidate after parity evaluation. No GPU run, model-to-worker wiring, PostgreSQL write/readback, indexing, Qdrant projection, or evidence-viewer flow was performed.
- Fresh port probe: `127.0.0.1:8090` is still not reachable, so Ornith 1.5 is unavailable for current VLM/caption analysis. EmbeddingGemma 2 is an embedder, not a generative VLM or object detector; it does not replace Ornith or a detector.

ONNX artifact SHA-256 receipts:

| File | SHA-256 |
| --- | --- |
| `onnx/model_fp16.onnx` | `a49e227d7e0e5f4ee606d79879d084264366367bc6318f344ab179e35d4fd6a4` |
| `onnx/model_fp16.onnx_data` | `b9dbe09415d77c8686ba6e216a244086f4ada1608238c13f2bfaa587ba627207` |
| `onnx/vision_encoder_fp16.onnx` | `3e2b6d5648a3ae61b572cc3ec0a23b13ebfda3b63e3c9c343c593636392a879c` |
| `onnx/vision_encoder_fp16.onnx_data` | `9f374070808b8b96252f7d04c9c4eae34df60283473fde5a3fbf4d9205495e19` |
| `onnx/audio_encoder_fp16.onnx` | `06237e04855d57053c3880f70f2575016dec1b1ce22f262fa76c6bd010616799` |
| `onnx/audio_encoder_fp16.onnx_data` | `3a9417444f3cb7bb868525b66859cc1d4b7a00128ea0b111f7aee2843739cd3b` |
