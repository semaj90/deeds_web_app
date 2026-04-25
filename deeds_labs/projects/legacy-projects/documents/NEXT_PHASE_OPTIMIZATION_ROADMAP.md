# Next-Phase Optimization Roadmap (Post-Initial Engine Success)

Objective: Drive Gemma3-Legal TensorRT-LLM stack from functional Q4_K_M baseline to resilient sub-ms steady-state with advanced quantization, memory optimization, and observability.

## 1. Baseline Confirmation (Gate 0)
| Metric | Target | Tool |
|--------|--------|------|
| First-token latency | < 8 ms | `tensorrt_llm.bench` |
| Steady token latency | < 1.2 ms | HLAPI streaming test |
| Throughput (tokens/s) | > 650 (batch=1, 128→64) | custom bench |
| GPU Utilization | > 70% during decode | Nsight Systems |

Proceed only after baseline reproducible in 3 consecutive runs.

## 2. Memory & KV Cache Strategy
- Enable paged KV with tuned `--tokens_per_block` (evaluate 64 vs 128 vs 256).
- Add dynamic block allocator metrics (fragmentation %, block reuse).
- Introduce residency heuristic: evict oldest context when memory > 90%.
- Future: persistent KV pinning for conversation threads (legal case continuity) with hash index.

## 3. Quantization Roadmap
| Phase | Method | Goal | Risk | Action |
|-------|--------|------|------|--------|
| Q4_K_M (current) | Weight-only int4 | Latency | Minimal | Foundation |
| FP8 Context (TRT ≥9.5) | Activations to FP8 | Memory + speed | Accuracy drift | A/B eval on legal summarization set |
| INT8 SmoothQuant | Weights+activations | Throughput | Calibration complexity | Build calibration set (100 legal docs) |
| Hybrid INT4+FP8 | Attention INT4, MLP FP8 | Aggressive memory cut | Quality | Only if VRAM pressure persists |

Acceptance: Maintain > 0.97 semantic similarity vs FP16 baseline on curated evaluation set.

## 4. Advanced Scheduling & Concurrency
- Implement request micro-batching window (2–3ms) for parallel decode.
- Evaluate speculative decoding (draft model small GPT2) → abort if gain < 15%.
- Add early termination on legal clause match heuristics.
- Integrate dynamic batching stats endpoint `/metrics/scheduler`.

## 5. Profiling & Instrumentation
| Layer | Tool | Artifact |
|-------|------|----------|
| GPU kernel timeline | Nsight Systems CLI | `.qdrep` traces |
| Kernel efficiency | Nsight Compute | occupancy report |
| Host waiting | perfetto trace | timeline JSON |
| Memory allocs | custom wrapper | allocation histogram |

Automate capture script: `scripts/profile_engine.sh` producing timestamped directory.

## 6. Observability & Metrics
Expose `/metrics` (Prometheus) from engine sidecar containing:
- tokens_generated_total
- active_sessions
- kv_cache_blocks_used / kv_cache_blocks_total
- batch_merge_events_total
- engine_rebuild_count
- quantization_mode{mode="q4_k_m"}

## 7. Reliability & Fallback
- Add health gradient: HOT (within SLO), WARM (latency +50%), DEGRADED (errors > 2%).
- Implement automatic switch to Ollama fallback after 3 consecutive build/server errors.
- Persist last successful engine metadata (hash, build flags) for rollback.

## 8. Engine Rebuild Pipeline Hardening
Checklist before promoting new engine version:
1. Hash all safetensors shards → store in `engine_meta.json`.
2. Record build flags & TRT-LLM version.
3. Run regression test set (legal QA prompts, summarization, risk extraction).
4. Store latency distribution (p50/p95/p99) JSON.
5. Sign engine manifest (optional future: minisign).

## 9. Legal Domain Evaluation Harness
Metrics:
- Clause extraction F1
- Risk classification precision
- Citation consistency ratio
- Summarization compression ratio
Dataset construction: 200 anonymized contract segments + 50 case law excerpts.
Automation script: `scripts/run_legal_eval.py` producing `eval_report.json`.

## 10. Future Enhancements
| Idea | Benefit | Prereq |
|------|---------|--------|
| Flash-Decoding (spec decode plugin) | +20–30% tokens/s | TRT plugin maturity |
| Mixed precision attention (FP8 mid-layers only) | Memory ↓, minor speed ↑ | Baseline FP8 stable |
| Persistent graph capture across batch shapes | First-token latency ↓ | Graph shape bucketing |
| Multi-engine tiering (Q4 vs BF16) | Quality vs cost auto-selection | Latency classifier |
| QUIC streaming binary tensor frames | Lower overhead vs HTTP | QUIC infra |

## 11. Risk Register
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Aggressive quantization degrades legal reasoning | Incorrect advice | Semantic eval gate + rollback |
| Fragmented KV cache | Latency spikes | Periodic compaction or block GC |
| Driver / CUDA upgrade regression | Downtime | Stage in sandbox + diff benchmarks |
| Memory oversubscription (8GB GPUs) | OOM crash | Adaptive sequence truncation + preflight budget |

## 12. Execution Timeline (Indicative)
Week 1: Baseline confirmation + metrics scaffold
Week 2: KV tuning + profiling scripts
Week 3: FP8 experiment + eval harness
Week 4: Micro-batching + observability endpoint
Week 5: INT8 calibration & legal domain regression suite
Week 6: Reliability (fallback, rollback) + documentation freeze

---
Outcome: A measurable, auditable optimization lifecycle ensuring performance gains never compromise legal domain accuracy.
