# EmbeddingGemma 2 Q8 ONNX Runtime Progress

## Decision and scope

The Google PyTorch checkpoint remains the quality reference. The FP16 ONNX export is not the selected runtime: Google's current model card warns that FP16 inference can produce NaNs or silently degraded vectors. The isolated candidate runtime now uses the pinned Apache-2.0 ONNX Community Q8 export. It is a community conversion of the Google model, not an official Google quantized checkpoint.

This report records model acquisition and a CPU image-inference smoke only. It does not claim worker, PostgreSQL, Qdrant, analysis-label, video, or viewer integration.

## Artifact receipt

- Model: `onnx-community/embeddinggemma-2-ONNX`
- Revision: `daa72c51243991dfcaf9f9137d2c573d8f7790c0`
- License reported by the upstream model: Apache-2.0
- Local path: `/home/james/.cache/parent-atlas/embeddinggemma-2-onnx-q8`
- Downloaded files: 13 pinned config, tokenizer, and Q8 graph/external-data files
- Total downloaded bytes: `882102954` (about 842 MiB); ONNX graph/data files are about 850 MB decimal
- SHA-256 was computed locally for every pinned file. The runtime verifies all 13 before loading.
- Model output remains normalized `Float32Array[768]`; Q8 quantizes model weights, not the output vector.

## Implementation and verification

- Added `sveltekit-frontend/src/lib/server/evidence/embeddinggemma2-onnx-image-v1.ts`, a bounded image-only adapter using the existing Sharp/VLM resize path, pinned Q8 text and vision graphs, local-only processor loading, source checksum, normalized 768-D validation, and model/preprocessing provenance.
- Added `sveltekit-frontend/src/lib/server/evidence/embeddinggemma2-onnx-image-v1.spec.ts` with an unconfigured fail-closed test and an opt-in actual-model smoke test.
- Corrected runtime selection to load the ONNX Runtime dependency nested under `@huggingface/transformers`. The frontend dependency tree also contains a root ONNX Runtime 1.29.0 while Transformers uses 1.24.3; mixing them caused an API 29/24 native mismatch and worker exit.
- Set the real model smoke to Node environment because the repository-wide Vitest browser environment exposed a browser canvas branch. Node execution uses the existing Sharp backend.
- Final command: `ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR=\\wsl.localhost\Ubuntu\home\james\.cache\parent-atlas\embeddinggemma-2-onnx-q8 npm exec -- vitest run src/lib/server/evidence/embeddinggemma2-onnx-image-v1.spec.ts --reporter=verbose`
- Observed result: 1 test file, 3 tests passed. The actual synthetic-image Q8 inference completed in about 32.6 seconds on CPU, returned 768 finite normalized values, and passed hash-shape checks.

## Runtime availability

- A local request to `127.0.0.1:8090/live` timed out; a TCP probe of port 8090 returned `False`. Ornith 1.5 is not currently reachable from this workstation. No service was restarted.
- EmbeddingGemma 2 is an embedding model. It can generate vectors for retrieval/classification but does not generate captions, OCR findings, or object detections. Those require the existing OCR/detector/VLM owners.
- The Q8 CPU smoke is too narrow to claim acceptable production throughput; its cold single-image run was about 32.6 seconds. GPU inference remains subject to the documented GPU lease and runtime admission.

## Quantization and context interpretation

- The upstream ONNX Community dtype table reports approximately 850 MB total for Q8 and a worst-case cosine similarity of 0.9997 against its FP32 reference. This is upstream-reported quality, not a Parent Atlas parity benchmark.
- EmbeddingGemma 2 supports MRL output dimensions 768, 512, 256, and 128. At Float32 these are 3,072, 2,048, 1,024, and 512 raw bytes per vector, respectively. MRL truncation requires re-normalization; 768D remains the current integration output pending evaluation.
- The 8,192-token limit is one shared sequence budget across text and media. It is not an ACE packet size target and does not mean a whole video should be embedded at once. Use bounded source-linked image/frame/transcript segments.
- ACE packets should contain authorized source references, exact locators, bounded excerpts, revisions, and receipts. Do not stuff embedding arrays, tensors, weights, or raw frame payloads into ACE JSON.

## Open gates

- Adapter is not called by the durable `analysis_jobs.upload_pipeline` worker.
- Image-only upload still needs a modality-aware branch that can succeed without non-empty OCR text.
- The PostgreSQL multimodal-vector table and outbox are still proposal/scratch-test schema; no migration was applied. No model-produced vector was written/read back from PostgreSQL.
- No Qdrant projection, image observations, detector labels, OCR/VLM analysis, transcript alignment, video frame embeddings, authorized viewer readback, RTX 3060 Ti inference, or PyTorch-vs-ONNX parity evaluation has been proven.
- OpenSpec task checkboxes remain unchanged.

## GAN status

- **CREATED:** Q8 model pin, checksum verification, and image adapter.
- **WIRED:** Adapter calls existing Sharp preprocessing and `@huggingface/transformers`/ONNX Runtime libraries; no durable upload worker caller yet.
- **PROVEN:** Q8 artifact hashes and one actual CPU image inference; 3 focused tests passed.
- **DONE:** No. Canonical PostgreSQL persistence/readback, authorized analysis UI, detector/VLM results, worker recovery, and retrieval evaluation remain open.
