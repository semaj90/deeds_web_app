#!/usr/bin/env bash
# Minimal wrapper to run the TRT build inside WSL using your Python 3.10 venv.
set -euo pipefail

# Path to venv inside WSL (change if different)
VENV_DIR="$HOME/trt_env_310"

if [ ! -d "${VENV_DIR}" ]; then
  echo "Virtualenv not found at ${VENV_DIR}. Adjust VENV_DIR in this script." >&2
  exit 2
fi

# Activate and run the build
bash -lc "source \"${VENV_DIR}/bin/activate\" && \
python3 -m tensorrt_llm.commands.build \
  --checkpoint_dir=/home/james/gemma3_checkpoint_working \
  --output_dir=/home/james/gemma3_trtllm_int4 \
  --max_batch_size=2 \
  --max_input_len=1024 \
  --max_seq_len=2048 \
  --max_beam_width=1 \
  --use_gemm_plugin=auto \
  --use_gpt_attention_plugin=float16 \
  --paged_kv_cache \
  --dtype=float16 \
  --use_weight_only \
  --weight_only_precision=int4_awq \
  --per_group \
  --group_size=128 \
  --int8_kv_cache"
