#!/bin/bash
# Start the complete ML stack for LDR integration
# Prerequisites: conda environment with ml-dependencies installed

set -e

echo "=== Starting ML Sidecar Stack ==="
echo ""

# Check conda environment
if [ -z "$CONDA_DEFAULT_ENV" ]; then
    echo "❌ No conda environment active. Activate with: conda activate ldr"
    exit 1
fi

echo "✅ Conda environment: $CONDA_DEFAULT_ENV"
echo ""

# Kill any existing services on ports 8095, 5000
echo "Checking for existing services..."
lsof -ti :8095 && kill -9 $(lsof -ti :8095) 2>/dev/null || true
lsof -ti :5000 && kill -9 $(lsof -ti :5000) 2>/dev/null || true
echo "✅ Cleaned up old processes"
echo ""

# Start Miniforge ML Sidecar on :8095
echo "Starting Miniforge ML Sidecar on :8095..."
cd "$(dirname "$0")/ml_sidecar"
python -m server > /tmp/ml-sidecar.log 2>&1 &
ML_SIDECAR_PID=$!
echo "✅ ML Sidecar started (PID: $ML_SIDECAR_PID)"

# Wait for sidecar to be ready
sleep 2
if ! curl -s http://127.0.0.1:8095/health > /dev/null; then
    echo "❌ ML Sidecar failed to start. Check /tmp/ml-sidecar.log"
    cat /tmp/ml-sidecar.log
    exit 1
fi
echo "✅ ML Sidecar is healthy"
echo ""

# Start Local-Deep-Research on :5000
echo "Starting Local-Deep-Research on :5000..."
if command -v ldr-web &> /dev/null; then
    ldr-web > /tmp/ldr.log 2>&1 &
    LDR_PID=$!
    echo "✅ LDR started (PID: $LDR_PID)"
    sleep 3
    if curl -s http://127.0.0.1:5000 > /dev/null; then
        echo "✅ LDR is healthy"
    else
        echo "⚠️  LDR may not be responding yet. Check /tmp/ldr.log"
    fi
else
    echo "⚠️  ldr-web command not found. Install with: pip install local-deep-research"
fi
echo ""

echo "=== ML Stack Ready ==="
echo ""
echo "Services:"
echo "  Miniforge ML Sidecar:   http://127.0.0.1:8095"
echo "  Local-Deep-Research:    http://127.0.0.1:5000"
echo "  Qdrant (existing):      http://127.0.0.1:6333"
echo "  Gemma4 (existing):      http://127.0.0.1:8090"
echo "  EmbeddingGemma (existing): http://127.0.0.1:11434"
echo ""
echo "Test the stack:"
echo "  curl http://127.0.0.1:8095/health"
echo "  curl http://127.0.0.1:5000"
echo ""
echo "Logs:"
echo "  ML Sidecar: tail -f /tmp/ml-sidecar.log"
echo "  LDR: tail -f /tmp/ldr.log"
echo ""
echo "To stop:"
echo "  kill $ML_SIDECAR_PID"
if [ ! -z "$LDR_PID" ]; then
    echo "  kill $LDR_PID"
fi
echo ""

# Keep running
wait
