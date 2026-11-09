# TODO: Google Colab & High-VRAM GPU Analysis Tasks

This document lists the action items, benchmarks, and validation steps to perform when uploading this bundle to Google Colab, Kaggle, or a cloud GPU instance with larger VRAM (e.g., NVIDIA A100 40GB/80GB, H100 80GB, or RTX 4090 24GB).

---

## 1. Setup & Environment Validation
- [ ] **Upload Folder**: Upload the `colab_atlas_gpu_analysis/` directory to Google Drive or directly into the Colab workspace.
- [ ] **Runtime Allocation**: Select **Runtime -> Change runtime type -> Hardware accelerator: GPU** (Select A100 or T4).
- [ ] **Install Requirements**: Run `!pip install -r requirements.txt`.
- [ ] **CUDA Diagnostic**: Run `!nvidia-smi` and confirm `torch.cuda.is_available() == True` with full GPU name and VRAM allocated.

---

## 2. GPU Batch Ranking & Cosine Scaling Benchmarks
- [ ] **50k - 100k Candidates**: Execute `notebooks/atlas_gpu_batch_analysis.ipynb` Step 3 to benchmark 768-d dense embeddings across:
  - 10,000 vectors (target: < 1.0 ms)
  - 50,000 vectors (target: < 3.5 ms)
  - 100,000 vectors (target: < 7.0 ms)
- [ ] **4096-d High-Rank Projections**: Benchmark 4096-dimensional sparse/dense representations against the same cohort.
- [ ] **Pre-filtering Efficiency**: Measure the speedup when combining the AVX2/bitmask pre-filter (`match_mask_scalar` or SIMD mask) with dense ranking vs brute-force top-k.

---

## 3. Large-Scale Document Ingestion & Editing (Firecrawl LDR)
- [ ] **Ingest Batches**: Ingest large legal document corpora (California Civil Code, Evidence Code) without workstation memory eviction.
- [ ] **LSP Coordinate Mapping**: Verify that UTF-16 code units translate to exact UTF-8 byte spans without surrogate errors across millions of characters.
- [ ] **Centroid Clustering**: Run cuML / PyTorch k-means with $k=64$ centroids across all document chunks to generate `ace:centroid:{id}` descriptors.

---

## 4. Multi-Turn Context & Model Serving
- [ ] **DSPy / RLM Optimization**: Compile multi-turn prompt chains using DSPy optimizers (e.g., BootstrapFewShot, MIPROv2) targeting legal question answering.
- [ ] **vLLM / llama.cpp GPU Offloading**: Rehearse loading Ornith 1.5-9B or larger legal LLMs with full GPU offload (`--n-gpu-layers 99`).
- [ ] **Export Receipts**: Save generated receipts to `data/colab_gpu_analysis_receipt.json` and sync back to `docs/reports/` in the main Deeds Web App workspace.
