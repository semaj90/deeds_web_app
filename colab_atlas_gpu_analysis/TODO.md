# TODO: Parent Atlas Cloud GPU Evaluation

This is an evaluation checklist, not a claim that Colab provides a particular accelerator or that the candidate ranker is already benchmarked. Record the actual runtime hardware and software on every run. Google Cloud G4 is a distinct VM family using RTX PRO 6000 Blackwell; AWS G4dn uses T4. Do not label both as “G4.”

---

## 1. Setup & Environment Validation
- [ ] **Upload Folder**: Upload the `colab_atlas_gpu_analysis/` directory to Google Drive or directly into the Colab workspace.
- [ ] **Runtime Allocation**: Select an available GPU runtime, then record the GPU actually assigned; A100/T4 availability varies by account and session.
- [ ] **Install Requirements**: Run `!pip install -r requirements.txt`.
- [ ] **CUDA Diagnostic**: Record GPU name, compute capability, total/free VRAM, driver, CUDA runtime, PyTorch version, and BF16 support. Keep the complete receipt with the benchmark output.

---

## 2. GPU Batch Ranking & Cosine Scaling Benchmarks
- [ ] **50k - 100k Candidates**: Execute the notebook with frozen, normalized vectors and an FP32 exact CPU oracle. Measure 10k, 50k, and 100k candidates. Record top-K parity/recall, p50/p95, and peak VRAM. Do not use the old latency targets as acceptance thresholds until a repeatable baseline exists.
- [ ] **4096-d High-Rank Projections**: Benchmark 4096-dimensional sparse/dense representations against the same cohort.
- [ ] **Pre-filtering Efficiency**: Measure mask construction, candidate compaction, GEMM, top-K, host/device transfer, and total wall time separately against the same unfiltered oracle. The current PyTorch `index_select` path materializes an intermediate; it is not a fused CUDA kernel.

---

## 3. Large-Scale Document Ingestion & Editing (Firecrawl LDR)
- [ ] **Ingest Batches**: Ingest large legal document corpora (California Civil Code, Evidence Code) without workstation memory eviction.
- [ ] **LSP Coordinate Mapping**: Verify that UTF-16 code units translate to exact UTF-8 byte spans without surrogate errors across millions of characters.
- [ ] **Centroid Clustering**: Keep centroids advisory and source/model-revision bound. Compare CPU/GPU assignments on a frozen eligible dataset before emitting descriptors; never infer canonical identity or eligibility from a centroid.

---

## 4. Multi-Turn Context & Model Serving
- [ ] **DSPy / RLM Optimization**: Compile multi-turn prompt chains using DSPy optimizers (e.g., BootstrapFewShot, MIPROv2) targeting legal question answering.
- [ ] **vLLM / llama.cpp GPU Offloading**: Use a separate, operator-approved runtime. Measure context/KV allocation and concurrent request capacity; do not assume `--parallel 8`–`32` eliminates KV fragmentation or fits the model.
- [ ] **Export Receipts**: Save generated receipts to `data/colab_gpu_analysis_receipt.json` and sync back to `docs/reports/` in the main Deeds Web App workspace.

## 5. Acceptance gates before performance claims
- [ ] Confirm the actual GPU, driver, CUDA/PyTorch build, and supported math mode; don't infer these from the provider or notebook name.
- [ ] Compare ranking results to the same frozen FP32 oracle, including bitmask edge cases, ties, empty masks, and exact source IDs.
- [ ] Use CUDA events or another synchronized device timer for kernel timing; report upload/hydration, filtering, GEMM, top-K, and end-to-end latency separately with warmups and repeated runs.
- [ ] Record peak VRAM and resource contention. Do not run local GPU experiments beside the active :8090 service without the repo's human-controlled GPU preparation procedure.
- [ ] Treat CAGRA as an ANN vector-search challenger over a qualified vector corpus, not as a replacement for the Kanban dependency DAG. Compare recall and latency to exact search before considering it.
- [ ] Keep cloud model endpoints private behind an authenticated, bounded proxy. Never expose raw vLLM health, tokenize, detokenize, metrics, or version endpoints through a public tunnel.
