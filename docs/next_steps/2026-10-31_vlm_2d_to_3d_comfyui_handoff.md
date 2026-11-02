# Handoff: Ornith 1.5 VLM, 2D-to-3D Reconstruction, ComfyUI Flow & 384 Audit

**Date:** 2026-10-31  
**Status:** Canonical & Audited  
**Hardware Profile:** RTX 3060 Ti 8 GiB VRAM  

---

## 1. Ornith 1.5 VLM & llama-server Startup Contract

### Does Ornith 1.5 have VLM?
**Yes.** Ornith 1.5 9B has an official multimodal vision projector GGUF.
- **Model weights:** `models/ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf` (server alias: `ornith-1.5-9b`).
- **Vision projector:** `models/mmproj-Ornith-1.5-9B-BF16.gguf` (paired in `models/model-manifest.json` under `ORNITH_VISION_PRODUCTION`).
- **Memory footprint:** ~7.8 GiB of the 8.2 GiB card limit. To prevent VRAM thrashing with desktop windows and CUDA contexts, the projector is offloaded to CPU: `LLAMA_ARG_MMPROJ_OFFLOAD=0`.

### Dedicated Startup Scripts
1. **Direct VLM Launcher (PowerShell):**
   ```powershell
   pwsh -ExecutionPolicy Bypass -File scripts/launch-ornith-vlm.ps1
   ```
   This script invokes `scripts/launch-turboquant.ps1 -StartupProfile ornith-1.5-vlm`, verifies `:8090/props`, and asserts that:
   - `props.model_alias` starts with `ornith-1.5`
   - `props.modalities.vision === true`
2. **VS Code Task:**
   - Run task: `⚡ TurboQuant: Start (vision, CPU projector, :8090)`
3. **Graceful Stop (Before WSL2 / cuVS jobs):**
   - Run task: `🧮 GPU: Prepare cuVS KMeans (frees VRAM, does NOT run KMeans)`
   - Never use `taskkill /IM llama-server.exe` directly.

---

## 2. Why Did the Logs Say "384" / "packet:legacy-384"?

During test execution, the log displayed:
```json
[embedding_lineage_fallback] {
  "packet_key": "packet:legacy-384",
  "inferred_from": "legacy_dimension_explicit_only",
  "fallback_chain": "no_explicit_field → dimension=384 → blocked legacy lane",
  "resolved_lane": "null"
}
```

### Explanation
- **Root Cause:** This is not a production failure or active 384-d ingestion. It is an intentional assertion from the test suite in `src/lib/server/retrieval/resolve-embedding-lane.spec.ts` (line 37):
  ```typescript
  it('gates legacy 384 dimension-only hits', () => {
    const result = gateEmbeddingLaneResolution({ embedding_dim: 384 }, 'packet:legacy-384');
    expect(result.gatePass).toBe(false);
    expect(result.reason).toContain('legacy_dimension_explicit_only');
  });
  ```
- **Invariant:** The system strictly gates and rejects legacy 384 dimensions (`resolved_lane: null`). The canonical active contract is permanently locked to **EmbeddingGemma 7-Representation Contract**:
  - `semantic_768` (L2 normalized dense canonical)
  - `mrl_512`, `mrl_256`, `mrl_128` (Matryoshka prefix embeddings)
  - `latent256`, `latent128`, `latent64` (structural autoencoder projections)

---

## 3. 2D to 3D & ComfyUI Architectural Flow

### Infrastructure Inventory
1. **Image Synthesis & 3D Reconstruction Service (`docker/image-synthesis/app.py` on `:8092`):**
   - Defined in `docker-compose.yml` (`legal-ai-image-synthesis`).
   - Capabilities:
     - `POST /depth`: Monocular Depth (DepthAnything v2 Large) from a single 2D image.
     - `POST /generate/image`: FLUX.1-schnell static keyframes.
     - `POST /generate/video`: Wan2.1-1.3B video animation.
     - `POST /reconstruct/gaussian-splat`: 3D Gaussian Splatting from multi-image inputs.
2. **ComfyUI Integration (Lane B):**
   - HTTP client: `src/lib/server/comfyui/comfyui-client.ts`.
   - API endpoints: `/api/comfyui/health`, `/api/comfyui/render`.
   - RabbitMQ queue: `comfyui.render` (declared in `src/lib/server/queue/rabbitmq-manager-fixed.ts`).
   - Planned workflow templates: `static/comfyui/workflows/`.
   - Map: Defined in `next_steps/active/2026-05-29_reconstruction-lanes-map.md`.

---

## 4. Patches Applied & Verified

1. **Qdrant Vector Name & Collection Resolution (`src/lib/server/vector/qdrant-manager.ts`):**
   - Added fallback for collection names in `batchUpsert()` and `getCollectionInfo()` so callers passing either aliases (`'evidence'`) or table names (`'evidence_items'`) resolve correctly without `undefined`.
   - Added auto-normalization for single named vectors (wrapping flat arrays into `{ [primaryVecName]: array }` when the collection requires it).
2. **Entity Batch Upserting (`src/lib/server/evidence/batch-entity-embedder.ts`):**
   - Updated Qdrant point construction to format points with `vector: { content: Array.from(embeddings[i]) }` and `collection: 'evidence'`.
3. **Upload Depth Estimation Guard (`src/routes/api/evidence/upload/+server.ts`):**
   - Added `if (!ENV.IMAGE_SYNTHESIS_URL) return null;` to prevent SSR `fetch('undefined/depth')` exceptions when the sidecar is unconfigured.
4. **YOLO ONNX Runtime Graceful Fallback (`src/lib/server/yolo.ts`):**
   - Added `isRuntimeAvailable()` static probe to check whether Python has `onnxruntime` before attempting to spawn scripts.
   - Hardened inline Python script with try/except fallback between `cv2` and `PIL.Image`, exiting cleanly with `{ success: true, skipped: ... }` instead of unhandled exceptions.
5. **Test Suite Verification:**
   - 12/12 lane contract tests passed in 7.93s (`vitest.lane-contracts.config.ts`).
