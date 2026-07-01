#!/bin/bash
# Download Gemma4 E2B ONNX from HuggingFace

set -e

REPO="onnx-community/gemma-4-E2B-it-ONNX"
FILES=(
  "model.onnx"
  "config.json"
  "tokenizer.json"
  "tokenizer.model"
  "tokenizer_config.json"
  "special_tokens_map.json"
  "model_info.json"
)

echo "🤗 Downloading Gemma4 E2B ONNX..."
for file in "${FILES[@]}"; do
  url="https://huggingface.co/$REPO/resolve/main/$file"
  echo "  → $file"
  curl -L -s "$url" -o "$file" 2>/dev/null || echo "    (optional)"
done
echo "✅ Complete"
