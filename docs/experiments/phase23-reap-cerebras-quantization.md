# Phase 23+ | REAP / Weight Streaming / Surgical GGUF Quantization

Status: EXPERIMENTAL. No existing model launcher, phase registry, index or GPU lane is changed.

## Canonical separation
- Model-weight tensor identity: model digest + architecture + layer + tensor name + quantization encoding + revision.
- Expert activation/routing evidence: frozen prompts, gate weights, activation norms, top-k, REAP scores.
- Inference performance: prefills, decode, KV residency, SSD reads, CPU/GPU memory, accepted tokens/sec.
- Parent Atlas semantic_768, BitFrost evidence packets and Qdrant indexes remain independent of model-weight paging.
- Existing `scripts/atlas/ampere_quantization.py` is for 768d embeddings, NOT GGUF tensor quantization.
- Cerebras-like streaming is an **architecture inspiration**, not proof of Cerebras-equivalent throughput or memory bandwidth.

## Surgical tensor manifest hypothesis
The user-supplied map calls for 1 output Q6_K, 1 embedding Q4_K, 131 F32 norms,
80 F32 routers, 30 Q8_0 attention gates, 120 Q4_K shared-expert tensors,
30 Q4_K periodic-attention Q/K/V, 10 Q6_K attention outputs, 120 F32 SSM
scales, 90 Q4_K linear-attention tensors, 4 Q3_K border expert down tensors,
8 IQ3_XXS border expert gate/up tensors, 36 IQ3_XXS core expert down,
36 IQ2_S core gate, 14 IQ2_S core early up and 22 IQ2_XXS late up.

CAUTION: count, dtype and layer claims must be read from GGUF. This table does
not establish zero router drift, zero SIMD stalls, accurate syntax, or a
12.55 GB final file. Some tensor regex spelling differs among architectures.
Strict audit must report mismatch rather than silently infer labels.

## Gates (after prior Phase 23 baseline)
- [ ] PH23-TENSOR-01 Inventory full GGUF metadata, tensor names, counts, shape, dtype, SHA256.
- [ ] PH23-TENSOR-02 Prove layer grouping and architecture (40 layers, 256 experts claimed); detect hybrid full-attention anchors.
- [ ] PH23-TENSOR-03 Check all explicit group-to-dtype assignments and 12.55 GB actual disk/VRAM budget.
- [ ] PH23-TENSOR-04 Measure reference vs quantized dequant errors, KLD, logits correlation, perplexity.
- [ ] PH23-REAP-01 Capture router-weighted activation importance per expert under frozen calibration.
- [ ] PH23-REAP-02 Compare no-pruning vs pruning candidates with router-top-k changes and quality gates.
- [ ] PH23-REAP-03 Distinguish pruning from per-tensor bitwidth assignment; no implicit destructive expert deletion.
- [ ] PH23-STREAM-01 Enumerate model-weight residency owner and immutable revision-qualified tensor handles.
- [ ] PH23-STREAM-02 Benchmark SSD->RAM CPU vs SSD->RAM->GPU transfers separately; direct vs buffered I/O.
- [ ] PH23-STREAM-03 Profile cache hit/miss, prefetch quality, eviction safety, PCIe transfers and memory peaks.
- [ ] PH23-STREAM-04 Compare on supported Windows/WSL and Linux filesystem backends, do not assume O_DIRECT support.
- [ ] PH23-MTP-01 Baseline no speculation vs MTP; separate MTP expert traffic, draft acceptance and verify latency.
- [ ] PH23-MTP-02 Evaluate REAP/quantization impact on draft acceptance and output quality.
- [ ] PH23-EVAL-01 Long-context needle tasks, coding/syntax, tool JSON and numerical benchmarks with fixed dataset revisions.
- [ ] PH23-EVAL-02 Repeat performance trials, confidence intervals, OOM/fail-closed fault injection.
- [ ] PH23-EVIDENCE-01 Emit immutable receipts with model/data/quantizer/kernel/runtime/revision hashes.
- [ ] PH23-ADMIT-01 Keep experiment-only until all mandatory quality, memory, and reliability thresholds are met.

## Usage

```bash
PYTHONPATH=/path/to/llama.cpp/gguf-py python3 scripts/experiments/phase23_tensor_map_audit.py \
  /path/to/candidate.gguf --report artifacts/phase23-tensor-map.json
```

The audit expects the supplied tensor naming convention, and fails for unseen
tensors/names, missing tensors, or unexpected precisions. A FAIL might mean the
map needs a versioned schema update rather than corrupted model weights.
Before approval review `tensor_examples` and `issues` in the JSON.

## Phase integration constraint
Existing `phase-lane-registry.ts` already reserves Phase 23. Do not redefine
it or promote its mock/eval-only status as a consequence of adding research
scripts. Add links to its owner after the model manifest and source receipts
are measured and reconciled.

## Client Gemma 4 / LiteRT-LM / EmbeddingGemma 2 crosswalk

See [Phase 23 Edge Gemma4 LiteRT Eval Crosswalk](phase23-edge-gemma4-litert-eval-crosswalk.md) for existing owner census, browser runtime boundaries, Gemma3-to-Gemma4 migration gates, server :8090 preservation, client IndexedDB, Eval Gym, KAG/DAG/HITS tasks, embedding-space isolation, and experimental MTP restrictions. All gates are **NOT_PROVEN** until receipts exist.
