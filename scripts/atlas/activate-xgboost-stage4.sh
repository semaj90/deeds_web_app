#!/bin/bash
# Activate XGBoost Stage 4 in the retrieval cascade
# Prerequisites: xgboost-reranker.ubj model trained and ready

set -e

echo "═════════════════════════════════════════════════════════════"
echo "  XGBoost Stage 4 Activation — Atlas Retrieval Cascade"
echo "═════════════════════════════════════════════════════════════"
echo ""

# Check model exists
MODEL_PATH="models/xgboost-reranker.ubj"
if [ ! -f "$MODEL_PATH" ]; then
  echo "❌ ERROR: Model not found at $MODEL_PATH"
  echo "   Run: npm run atlas:xgboost:train"
  exit 1
fi
echo "✓ Model exists: $MODEL_PATH"

# Check Python dependencies
echo ""
echo "Checking Python dependencies..."
python3 -c "import xgboost; print(f'✓ xgboost {xgboost.__version__} installed')" 2>/dev/null || {
  echo "❌ xgboost not installed"
  echo "   Run: pip install xgboost"
  exit 1
}

# Start XGBoost sidecar
echo ""
echo "Starting XGBoost scoring sidecar..."
SIDECAR_PORT=${XGBOOST_SIDECAR_PORT:-8765}
echo "  Port: $SIDECAR_PORT"
echo "  Command: python scripts/atlas/serve-xgboost-reranker.py"
echo ""
echo "In another terminal, run:"
echo "  npm run dev                    # Start SvelteKit dev server"
echo "  npm run atlas:cascade:smoke    # Test the cascade"
echo ""

python3 scripts/atlas/serve-xgboost-reranker.py --port=$SIDECAR_PORT
