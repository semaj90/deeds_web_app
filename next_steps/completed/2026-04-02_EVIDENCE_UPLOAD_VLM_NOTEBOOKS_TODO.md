# 2026-04-02 Evidence Upload + VLM Notebook Todo

## Current state
- Evidence upload save path is fixed against the live runtime schema.
- Live validation succeeded via multipart POST to `/api/evidence/upload` and returned a real `evidenceId`.
- Uploads without an explicit `caseId` now resolve into a dedicated fallback case: `General Evidence Uploads`.
- The upload route now writes analysis metadata into `ai_analysis` instead of assuming newer `metadata` and `status` columns.

## Notebook split
- Frozen-vision Gemma 3 LoRA path already trained on RTX 3060 Ti:
  - `scripts/unsloth-training/Gemma3_12B_Legal_Production.ipynb`
  - mirror package: `scripts/unsloth-training/COLAB_PACKAGE/Gemma3_12B_Legal_Production.ipynb`
- Separate longer-running multimodal / VLM training path for later PyTorch -> TRT-LLM -> Triton work:
  - `scripts/unsloth-training/Gemma3_Legal_Multimodal_COMPLETE.ipynb`
- Merge / export handoff for deployment:
  - `scripts/unsloth-training/Gemma3_12B_Merge_and_TRT_Export.ipynb`
  - `scripts/unsloth-training/TENSORRT_TRITON_DEPLOYMENT.md`
  - `next_steps/active/2026-03-15_TRITON_VLM_FULL_PIPELINE.md`

## Docling / LangExtract / analysis path
- Docling reference:
  - `granite-docling-258M/README.md`
- LangExtract container/reference:
  - `docker/langextract-optimized/README.md`
- Evidence upload analysis entrypoint:
  - `sveltekit-frontend/src/routes/api/evidence/upload/+server.ts`
- This route remains the main handoff for:
  - MinIO object persistence
  - DB evidence row creation
  - text extraction / OCR fallback
  - LangExtract sectioning
  - embeddings / Qdrant upsert
  - entity extraction
  - forensics
  - summarization

## Follow-up todo
- Re-test upload from the actual UI flow, not only the direct API POST.
- Confirm the fallback-case behavior is acceptable for uncased uploads, or add explicit UI case selection.
- Clean C drive and repo disk usage before the long VLM training run.
- Run the separate multimodal training notebook only after storage cleanup and container readiness.
- Validate end-to-end: Gemma 3 VLM inference + Docling + LangExtract + RAG/KAG/DAG on real evidence documents.
