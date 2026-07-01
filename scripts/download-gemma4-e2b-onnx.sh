#!/bin/bash
# Download Gemma4 E2B ONNX Model
#
# Model: onnx-community/gemma-4-E2B-it-ONNX (Effective 2 Billion parameters)
# Speed: 120-255 tokens/second (optimized for browser/edge)
# Size: ~1.5 GB total (model.onnx)
# Purpose: Fast browser fallback for text generation
#
# Usage:
#   bash scripts/download-gemma4-e2b-onnx.sh
#
# Output: sveltekit-frontend/static/gemma4_e2b_onnx/
#

set -e

REPO="onnx-community/gemma-4-E2B-it-ONNX"
TARGET_DIR="sveltekit-frontend/static/gemma4_e2b_onnx"

# Create directory
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

echo "🤗 Downloading Gemma4 E2B ONNX Model"
echo "Repository: $REPO"
echo "Target: $(pwd)"
echo ""

# Essential files
FILES=(
  "model.onnx"
  "config.json"
  "tokenizer.json"
  "tokenizer.model"
  "tokenizer_config.json"
  "special_tokens_map.json"
)

# Optional files (for reference)
OPTIONAL_FILES=(
  "model_info.json"
  "README.md"
)

echo "📥 Downloading required files..."
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file (already exists, skipping)"
  else
    echo "  ⏳ $file"
    url="https://huggingface.co/$REPO/resolve/main/$file"

    # Use aria2c if available for resumable downloads, else curl
    if command -v aria2c &> /dev/null; then
      aria2c -q "$url" -o "$file" || echo "    ⚠️  Failed (may be temporary)"
    else
      curl -L -s "$url" -o "$file" || echo "    ⚠️  Failed (may be temporary)"
    fi

    # Verify file size
    size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
    if [ "$size" -lt 1000 ]; then
      echo "    ⚠️  Small file (may be incomplete), retrying..."
      rm -f "$file"
      curl -L --progress-bar "$url" -o "$file" || true
    fi
  fi
done

echo ""
echo "📥 Downloading optional files..."
for file in "${OPTIONAL_FILES[@]}"; do
  url="https://huggingface.co/$REPO/resolve/main/$file"
  curl -L -s "$url" -o "$file" 2>/dev/null || true
done

echo ""
echo "✅ Download complete!"
echo ""
echo "📊 Model Info:"
echo "  Name: $REPO"
echo "  Speed: 120-255 tokens/second"
echo "  Size: ~1.5 GB (model.onnx)"
echo "  Location: $(pwd)"
echo ""
echo "📁 Files:"
ls -lh

echo ""
echo "🚀 Next steps:"
echo "  1. Start dev server: npm run dev"
echo "  2. Navigate to: /admin/onnx-gpu-test"
echo "  3. Run tests to verify Gemma4 E2B loads"
echo ""
