# TensorRT-LLM vs Ollama Benchmark Plan

This note captures the repeatable steps required to compare an RTX 3060 Ti TensorRT-LLM engine against the existing Ollama 32k-context deployment. The commands below align with the updated conversion + engine build pipeline introduced on $(date +%Y-%m-%d).

## 1. Build & Validate TensorRT Engine
1. Convert Gemma3 weights and build the TensorRT engine:
   ```bash
   cd /mnt/c/Users/james/Videos/deeds-web-app
   ./build_tensorrt_engine.sh \
     HF_SHARD_DIR=/home/james/gemma3_checkpoint_fixed \
     MAPPED_CHECKPOINT_DIR=/home/james/gemma3_trtllm_fixed \
     ENGINE_DIR=/home/james/gemma3_engine_final
   ```
2. The script writes `mapping_report.json`, `rank0.safetensors`, `config.json`, and runs a lightweight runtime import test so failures surface immediately.

## 2. TensorRT-LLM Benchmark Command
Run the dedicated benchmark entry point (same prompt set used for Ollama to make apples-to-apples comparisons):
```bash
trtllm-bench \
  --engine_dir /home/james/gemma3_engine_final \
  --dataset legal_ai_benchmark.json \
  --max_new_tokens 512 \
  --warmup_runs 2 \
  --benchmark_runs 10 \
  --output results_tensorrt.json
```
Collect the following metrics from the JSON output:
- Tokens per second (median & P95)
- Time to first token (TTFT)
- End-to-end latency for 4x 32k-context prompts
- GPU memory used (via `nvidia-smi --loop=1` during the run)

## 3. Ollama Baseline
Use the same prompt pack with Ollama (current production command shown below):
```bash
ollama run gemma3-legal-32k \
  --prompt-file legal_ai_benchmark.txt \
  --num-parallel 2 \
  --num-predict 512 \
  --keep alive
```
Capture the structured log from `/var/log/ollama/perf.log` or run the helper:
```bash
node scripts/benchmarks/ollama_perf_collector.mjs \
  --model gemma3-legal-32k \
  --dataset legal_ai_benchmark.json \
  --output results_ollama.json
```

## 4. Comparison Template
| Metric | TensorRT-LLM | Ollama 0.3.x | Delta |
|--------|---------------|--------------|-------|
| Tokens/sec (median) | _(fill in)_ | _(fill in)_ | _(fill in)_ |
| Tokens/sec (P95) |  |  |  |
| TTFT (ms) |  |  |  |
| 32k prompt latency (s) |  |  |  |
| GPU memory (GB) |  |  |  |

Once both JSON outputs are available, run:
```bash
node scripts/benchmarks/compare_trt_vs_ollama.mjs \
  --tensorrt results_tensorrt.json \
  --ollama results_ollama.json \
  --report docs/tensorrt-llm/perf_summary.json
```
This produces a consolidated diff and allows us to keep the deployment recommendation grounded in data.

## 5. Interim Conclusion
- Until the TensorRT benchmark shows >20% throughput lift and materially lower TTFT, Ollama remains the safer production path for 32k legal workloads on RTX 3060 Ti (per 2025-09-21 investigation).
- Use the comparison table above to document any improvements; archive the JSON artifacts alongside the report for reproducibility.
