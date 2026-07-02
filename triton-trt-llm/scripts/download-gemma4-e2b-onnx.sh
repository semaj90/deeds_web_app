#!/bin/bash
# Download Gemma4 E2B ONNX text-generation assets from Hugging Face.
#
# Default variant: q4f16. This keeps the download bounded to the text decoder
# and token embedding graph used for summarization experiments. Audio/vision
# encoders and fp32/fp16 decoder exports are intentionally skipped.

set -e

REPO="onnx-community/gemma-4-E2B-it-ONNX"
VARIANT="${GEMMA4_ONNX_VARIANT:-q4f16}"

case "$VARIANT" in
  q4f16)
    DECODER="decoder_model_merged_q4f16.onnx"
    EMBED="embed_tokens_q4f16.onnx"
    ;;
  q4)
    DECODER="decoder_model_merged_q4.onnx"
    EMBED="embed_tokens_q4.onnx"
    ;;
  quantized)
    DECODER="decoder_model_merged_quantized.onnx"
    EMBED="embed_tokens_quantized.onnx"
    ;;
  *)
    echo "Unsupported GEMMA4_ONNX_VARIANT=$VARIANT (use q4f16, q4, or quantized)" >&2
    exit 1
    ;;
esac

FILES=(
  "config.json"
  "generation_config.json"
  "README.md"
  "tokenizer.json"
  "tokenizer_config.json"
  "preprocessor_config.json"
  "processor_config.json"
  "onnx/${DECODER}"
  "onnx/${DECODER}_data"
  "onnx/${EMBED}"
  "onnx/${EMBED}_data"
)

echo "🤗 Downloading Gemma4 E2B ONNX text assets (${VARIANT})..."
mkdir -p onnx
for file in "${FILES[@]}"; do
  url="https://huggingface.co/$REPO/resolve/main/$file"
  echo "  → $file"
  mkdir -p "$(dirname "$file")"
  curl -L --fail --retry 3 --retry-delay 2 -C - "$url" -o "$file"
done
echo "✅ Complete"
