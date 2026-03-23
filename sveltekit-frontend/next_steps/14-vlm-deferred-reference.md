# VLM Deferred Reference

**Status:** Deferred on purpose
**Date:** March 22, 2026
**Reason:** The remaining near-term work should stay focused on consolidation, production hardening, and feature implementation on top of the current stable stack. VLM training and TRT-LLM/Triton serving are still planned, but they should not interrupt the current consolidation path.

---

## Decision

Treat VLM work as a **post-consolidation track**.

That means:
- Keep current production-facing image and evidence analysis on the existing routes and services.
- Do not revive the archived `vlm-document-analyzer.ts` file verbatim.
- When VLM work resumes, do it as a clean rewrite wired to the current API and evidence pipeline.

---

## What Stays Active Now

The current stack already supports production-focused consolidation without waiting for the deferred VLM path:

- Existing image analysis route: `src/routes/api/vision/analyze/+server.ts`
- Existing evidence pipeline and upload flow
- Existing embedding helpers and RAG infrastructure
- Existing Triton/TRT client and health wiring already present for future use

Near-term priority remains:
- consolidation
- wiring cleanup
- production-readiness fixes
- feature completion on the current stable surface

---

## What Is Deferred

### 1. VLM rewrite

Deferred item:
- `src/lib/server/vlm-document-analyzer.ts` rewrite

Why deferred:
- the archived implementation is broken against the current server API surface
- current production work does not require a new multimodal orchestration layer yet
- a future rewrite should target the current vision route, evidence pipeline, and embedding stack directly

### 2. Unsloth VLM training path

Deferred item:
- Unsloth-based VLM training / export workflow for a future production VLM stack

Reference material already in repo:
- `next_steps/07-ml-training.md`
- `next_steps/10-trtllm-triton-deployment.md`
- `next_steps/11-wiring-production-quality.md`
- `next_steps/13-dead-code-rewrite-candidates.md`
- `next_steps/active/2026-03-15_TRITON_VLM_FULL_PIPELINE.md`
- `scripts/unsloth-training/Gemma3_12B_INT4_Quantize_and_Export.ipynb`

Important reminder:
- if the VLM route is resumed, remember the Unsloth training/export path is part of the intended future workflow and should not be rediscovered from scratch

### 3. TRT-LLM / Triton deployment path

Deferred item:
- full TRT-LLM engine build and Triton deployment for VLM and text-serving acceleration

Reference material already in repo:
- `next_steps/10-trtllm-triton-deployment.md`
- `next_steps/11-wiring-production-quality.md`
- `next_steps/TODO_TRTLLM_TRITON.md`
- `next_steps/active/2026-03-15_TRITON_VLM_FULL_PIPELINE.md`
- `INFERENCE_ARCHITECTURE.md`
- `Dockerfile.trtllm`
- `docker-compose.triton.yml`

Important reminder:
- TRT-LLM/Triton remains part of the long-term production acceleration plan
- do not treat it as abandoned; treat it as intentionally sequenced after consolidation

---

## Resume Order When Consolidation Is Done

When the repository is ready to resume VLM work, the order should be:

1. Rewrite the VLM analyzer against the current API surface
2. Verify evidence-pipeline insertion points and fallback behavior
3. Reconcile model artifacts and export workflow from the Unsloth notebook
4. Build or refresh TRT-LLM engines
5. Restore or verify Triton model configs and serving path
6. Wire observability and health checks across the VLM route

---

## Guardrail

Until this deferred track is resumed, assume:

- everything else is consolidation
- everything else is production-readiness
- everything else is feature implementation on the current live architecture

This avoids mixing infrastructure ambition with stabilization work.