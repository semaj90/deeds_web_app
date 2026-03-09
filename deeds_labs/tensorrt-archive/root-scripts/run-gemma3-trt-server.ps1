param(
  [string]$Container = "phase66-tensorrt-llm"
)

$engineDir     = "/workspace/engines/gemma3_12b_int4_engine"
$tokenizerDir  = "/workspace/engines/gemma3-legal-production/checkpoint_trt"

docker exec -it $Container bash -lc @"
python3 -m tensorrt_llm.commands.server \
  --engine_dir $engineDir \
  --tokenizer_dir $tokenizerDir \
  --host 0.0.0.0 \
  --port 8099 \
  --max_batch_size 1 \
  --max_input_len 2048 \
  --max_seq_len 4096 \
  --kv_cache_free_gpu_mem_fraction 0.8
"@