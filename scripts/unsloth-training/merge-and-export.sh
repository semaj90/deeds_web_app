#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Unsloth Adapter → Merged HF → GGUF → Ollama Modelfile Pipeline
#
# Usage:
#   ./merge-and-export.sh --adapter /path/to/lora_adapter
#   ./merge-and-export.sh --adapter /path/to/lora_adapter --skip-gguf
#   ./merge-and-export.sh --adapter /path/to/lora_adapter --base unsloth/gemma-3-12b-it
#
# Prerequisites:
#   pip install peft transformers torch accelerate
#   pip install llama-cpp-python   # for GGUF conversion (optional)
#   ollama installed               # for Ollama import (optional)
# ──────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Defaults
BASE_MODEL="unsloth/gemma-3-12b-it-unsloth-bnb-4bit"
WORKSPACE="/workspace/adapters"
ADAPTER_PATH=""
SKIP_GGUF=false
SKIP_OLLAMA=false
QUANTIZATION="q4_k_m"
MODEL_NAME="gemma3-legal"

usage() {
    echo "Usage: $0 --adapter <path> [--base <model>] [--workspace <dir>] [--skip-gguf] [--skip-ollama] [--quant <type>] [--name <model-name>]"
    echo ""
    echo "  --adapter    Path to trained LoRA adapter directory (required)"
    echo "  --base       Base model path or HF ID (default: $BASE_MODEL)"
    echo "  --workspace  Output workspace directory (default: $WORKSPACE)"
    echo "  --skip-gguf  Skip GGUF conversion step"
    echo "  --skip-ollama Skip Ollama model creation step"
    echo "  --quant      GGUF quantization type (default: $QUANTIZATION)"
    echo "  --name       Ollama model name (default: $MODEL_NAME)"
    exit 1
}

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --adapter)    ADAPTER_PATH="$2"; shift 2 ;;
        --base)       BASE_MODEL="$2"; shift 2 ;;
        --workspace)  WORKSPACE="$2"; shift 2 ;;
        --skip-gguf)  SKIP_GGUF=true; shift ;;
        --skip-ollama) SKIP_OLLAMA=true; shift ;;
        --quant)      QUANTIZATION="$2"; shift 2 ;;
        --name)       MODEL_NAME="$2"; shift 2 ;;
        -h|--help)    usage ;;
        *)            echo "Unknown option: $1"; usage ;;
    esac
done

if [[ -z "$ADAPTER_PATH" ]]; then
    echo "Error: --adapter is required"
    usage
fi

MERGED_DIR="$WORKSPACE/merged-hf"
GGUF_DIR="$WORKSPACE/gguf"
MANIFEST_PATH="$WORKSPACE/manifest.json"

echo "╔══════════════════════════════════════════════════════╗"
echo "║   Unsloth Merge & Export Pipeline                   ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Adapter:    $ADAPTER_PATH"
echo "║  Base Model: $BASE_MODEL"
echo "║  Workspace:  $WORKSPACE"
echo "║  Quant:      $QUANTIZATION"
echo "║  Model Name: $MODEL_NAME"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Merge LoRA adapter with base model ──────────────
echo "═══ Step 1/4: Merging LoRA adapter ═══"
python3 "$REPO_ROOT/scripts/merge_lora_adapter.py" \
    --adapter "$ADAPTER_PATH" \
    --base_model "$BASE_MODEL" \
    --output "$MERGED_DIR" \
    --format hf

if [[ ! -d "$MERGED_DIR" ]] || [[ -z "$(ls -A "$MERGED_DIR" 2>/dev/null)" ]]; then
    echo "❌ Merge failed — output directory is empty"
    exit 1
fi
echo "✅ Step 1 complete: Merged HF model at $MERGED_DIR"
echo ""

# ── Step 2: Convert to GGUF ─────────────────────────────────
if [[ "$SKIP_GGUF" == "false" ]]; then
    echo "═══ Step 2/4: Converting to GGUF ($QUANTIZATION) ═══"
    mkdir -p "$GGUF_DIR"

    # Try llama.cpp convert script (preferred)
    CONVERT_SCRIPT=""
    for candidate in \
        "$HOME/llama.cpp/convert_hf_to_gguf.py" \
        "/workspace/llama.cpp/convert_hf_to_gguf.py" \
        "$(which convert_hf_to_gguf.py 2>/dev/null || true)"; do
        if [[ -f "$candidate" ]]; then
            CONVERT_SCRIPT="$candidate"
            break
        fi
    done

    if [[ -n "$CONVERT_SCRIPT" ]]; then
        python3 "$CONVERT_SCRIPT" \
            "$MERGED_DIR" \
            --outfile "$GGUF_DIR/${MODEL_NAME}-f16.gguf" \
            --outtype f16

        # Quantize
        QUANTIZE_BIN=""
        for candidate in \
            "$HOME/llama.cpp/build/bin/llama-quantize" \
            "/workspace/llama.cpp/build/bin/llama-quantize" \
            "$(which llama-quantize 2>/dev/null || true)"; do
            if [[ -f "$candidate" ]]; then
                QUANTIZE_BIN="$candidate"
                break
            fi
        done

        if [[ -n "$QUANTIZE_BIN" ]]; then
            "$QUANTIZE_BIN" \
                "$GGUF_DIR/${MODEL_NAME}-f16.gguf" \
                "$GGUF_DIR/${MODEL_NAME}-${QUANTIZATION}.gguf" \
                "$QUANTIZATION"
            echo "✅ Step 2 complete: GGUF at $GGUF_DIR/${MODEL_NAME}-${QUANTIZATION}.gguf"
        else
            echo "⚠️ llama-quantize not found — skipping quantization (f16 GGUF available)"
        fi
    else
        echo "⚠️ convert_hf_to_gguf.py not found — skipping GGUF conversion"
        echo "   Install llama.cpp: git clone https://github.com/ggerganov/llama.cpp && cd llama.cpp && make"
        SKIP_GGUF=true
    fi
else
    echo "═══ Step 2/4: Skipped (--skip-gguf) ═══"
fi
echo ""

# ── Step 3: Create Ollama Modelfile ─────────────────────────
if [[ "$SKIP_OLLAMA" == "false" && "$SKIP_GGUF" == "false" ]]; then
    echo "═══ Step 3/4: Creating Ollama model ═══"
    GGUF_FILE="$GGUF_DIR/${MODEL_NAME}-${QUANTIZATION}.gguf"
    if [[ ! -f "$GGUF_FILE" ]]; then
        GGUF_FILE="$GGUF_DIR/${MODEL_NAME}-f16.gguf"
    fi

    if [[ -f "$GGUF_FILE" ]]; then
        MODELFILE="$WORKSPACE/Modelfile"
        cat > "$MODELFILE" <<MODELFILE_EOF
FROM $GGUF_FILE

PARAMETER temperature 0.7
PARAMETER num_predict 2048
PARAMETER top_k 40
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1

SYSTEM """You are a specialized legal AI assistant trained on legal analysis, evidence processing, and case management. You provide accurate, well-reasoned legal analysis while maintaining professional objectivity. When analyzing evidence or legal questions, cite relevant statutes, case law, and procedural rules."""

TEMPLATE """{{ if .System }}<start_of_turn>system
{{ .System }}<end_of_turn>
{{ end }}{{ if .Prompt }}<start_of_turn>user
{{ .Prompt }}<end_of_turn>
<start_of_turn>model
{{ end }}{{ .Response }}<end_of_turn>"""
MODELFILE_EOF

        if command -v ollama &>/dev/null; then
            ollama create "${MODEL_NAME}:latest" -f "$MODELFILE"
            echo "✅ Step 3 complete: Ollama model '${MODEL_NAME}:latest' created"
        else
            echo "⚠️ ollama not found — Modelfile written to $MODELFILE"
            echo "   Run: ollama create ${MODEL_NAME}:latest -f $MODELFILE"
        fi
    else
        echo "⚠️ No GGUF file found — skipping Ollama creation"
    fi
else
    echo "═══ Step 3/4: Skipped ═══"
fi
echo ""

# ── Step 4: Update manifest ─────────────────────────────────
echo "═══ Step 4/4: Updating manifest ═══"
# The merge script already wrote the manifest in step 1.
# Update the GGUF artifact if conversion succeeded.
if [[ "$SKIP_GGUF" == "false" && -f "$GGUF_DIR/${MODEL_NAME}-${QUANTIZATION}.gguf" ]]; then
    GGUF_SIZE=$(du -m "$GGUF_DIR/${MODEL_NAME}-${QUANTIZATION}.gguf" 2>/dev/null | cut -f1)
    echo "  GGUF size: ${GGUF_SIZE:-?} MB"
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Pipeline Complete                                 ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Merged HF:  $MERGED_DIR"
if [[ "$SKIP_GGUF" == "false" ]]; then
echo "║  GGUF:       $GGUF_DIR/${MODEL_NAME}-${QUANTIZATION}.gguf"
fi
echo "║  Manifest:   $MANIFEST_PATH"
if [[ "$SKIP_OLLAMA" == "false" && "$SKIP_GGUF" == "false" ]]; then
echo "║  Ollama:     ollama run ${MODEL_NAME}:latest"
fi
echo "╚══════════════════════════════════════════════════════╝"
