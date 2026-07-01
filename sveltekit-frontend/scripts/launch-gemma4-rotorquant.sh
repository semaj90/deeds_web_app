#!/bin/bash

# Launch llama-server with Gemma4 E2B RotorQuant IQ4_XS
# Production config for RTX 3060 Ti (8GB VRAM)
#
# Architecture:
#   - Model: IQ4_XS quantized weights (excellent quality)
#   - KV Cache: q8_0 (standard llama.cpp, 8-bit quantized)
#   - Note: RotorQuant KV compression is built into weights,
#     but stock llama.cpp uses -ctk q8_0 -ctv q8_0 at runtime
#   - Context: 32K default (64K for exceptional cases)
#   - Concurrency: 8-16 requests (request queuing, not --parallel slots)

MODEL_PATH="models/gemma4-e2b-rotorquant-iq4xs/gemma-4-E2B-it-RotorQuant-IQ4_XS.gguf"

# Allow context override via env var or argument
CONTEXT=${CONTEXT:-32768}
PARALLEL=${PARALLEL:-1}

if [ ! -f "$MODEL_PATH" ]; then
  echo "❌ Model not found at $MODEL_PATH"
  exit 1
fi

echo "🚀 Starting llama-server with Gemma4 RotorQuant IQ4_XS"
echo "   Model: IQ4_XS quantized weights (3.1GB file, 1.7GB weights)"
echo "   Context: $CONTEXT tokens (32K default, 64K max on 8GB)"
echo "   KV Cache: q8_0 K + q8_0 V (standard llama.cpp, stable)"
echo "   Port: 8090"
echo "   Throughput: 40-50 tok/s per request"
echo "   Concurrency: request queuing (internal batching, --parallel $PARALLEL)"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../" && pwd)"
TEMPLATE_PATH="$SCRIPT_DIR/configs/templates/gemma4-opencode.jinja"

if [ ! -f "$TEMPLATE_PATH" ]; then
  echo "❌ Template not found at $TEMPLATE_PATH"
  exit 1
fi

llama-server \
  -m "$MODEL_PATH" \
  -ngl 99 \
  -c $CONTEXT \
  -fa on \
  --cache-prompt \
  --cache-reuse 256 \
  --port 8090 \
  --chat-template-file "$TEMPLATE_PATH" \
  --jinja \
  --reasoning-format none \
  -ctk q8_0 \
  -ctv q8_0 \
  --parallel $PARALLEL \
  --threads-batch 16 \
  "$@"
