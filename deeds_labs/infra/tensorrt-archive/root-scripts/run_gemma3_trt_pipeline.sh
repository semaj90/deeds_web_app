#!/bin/bash
set -euo pipefail

SRC_DIR="/workspace/engines/gemma3-legal-production/checkpoint"
TRT_DIR="/workspace/engines/gemma3-legal-production/trt_checkpoint"
ENGINE_DIR="/workspace/engines/gemma3_12b_int4_engine"
AUDIT_DIR="/workspace/audit"

mkdir -p "" "" ""

echo ""
echo "====================================================="
echo "   ONE-CLICK GEMMA-3 -> TensorRT-LLM PIPELINE"
echo "====================================================="
echo ""

python3 - <<'AUDIT'
import os
from safetensors import safe_open
src = "/workspace/engines/gemma3-legal-production/checkpoint"
files = sorted([f for f in os.listdir(src) if f.endswith('.safetensors')])
print("Found shards:")
for f in files:
    print(" -", f)
for f in files:
    path = os.path.join(src, f)
    with safe_open(path, framework='pt', device='cpu') as sf:
        _ = list(sf.keys())
print("\nAll shards readable")
AUDIT

python3 - <<'MERGE'
import os, json, shutil
from safetensors import safe_open
from safetensors.torch import save_file
src = "/workspace/engines/gemma3-legal-production/checkpoint"
dst = "/workspace/engines/gemma3-legal-production/trt_checkpoint"
os.makedirs(dst, exist_ok=True)
with open(f"{src}/config.json") as f:
    cfg = json.load(f)
cfg["architecture"] = "Gemma3ForCausalLM"
cfg["architectures"] = ["Gemma3ForCausalLM"]
with open(f"{dst}/config.json", "w") as f:
    json.dump(cfg, f, indent=2)
merged = {}
for fname in sorted(os.listdir(src)):
    if fname.endswith('.safetensors') and 'model-' in fname:
        path = f"{src}/{fname}"
        print("Merging", fname)
        with safe_open(path, framework='pt', device='cpu') as sf:
            for k in sf.keys():
                merged[k] = sf.get_tensor(k)
print("Total tensors", len(merged))
save_file(merged, f"{dst}/rank0.safetensors")
for t in ["tokenizer.json","tokenizer.model","tokenizer_config.json"]:
    p = f"{src}/{t}"
    if os.path.exists(p):
        shutil.copy(p, f"{dst}/{t}")
MERGE

cat > "/build_config_int4.json" <<'JSON'
{
  "precision": {
    "weight_only_precision": "int4",
    "logits_dtype": "float16",
    "enable_fp16_qdq": true
  },
  "opt": {
    "builder_opt": [
      "memory_pool_limit:workspace=4096MiB",
      "hardware_compatibility_level=ampere_plus"
    ],
    "embed_ptx": true,
    "multiple_profiles": true
  },
  "kv_cache": {
    "paged_kv_cache": true,
    "use_paged_context_fmha": true,
    "context_fmha": true
  },
  "input": {
    "enable_remove_input_padding": true
  }
}
JSON

trtllm-build   --checkpoint_dir ""   --output_dir ""   --max_batch_size 1   --max_input_len 2048   --max_seq_len 4096   --build_config "/build_config_int4.json"

cat > "/run_server.sh" <<'SERV'
#!/bin/bash
python3 -m tensorrt_llm.commands.server   --engine_dir /workspace/engines/gemma3_12b_int4_engine   --tokenizer_dir /workspace/engines/gemma3-legal-production/trt_checkpoint   --host 0.0.0.0   --port 8099   --max_batch_size 1   --max_input_len 2048   --max_seq_len 4096   --kv_cache_free_gpu_mem_fraction 0.85
SERV
chmod +x "/run_server.sh"

echo "Pipeline completed"
