#!/bin/bash
# Pull gemma3:270m model for document analysis
#
# Usage: ./pull-gemma3.sh
# Or:    bash ./pull-gemma3.sh

set -e

echo "🤖 Ollama Model Puller - Legal AI Document Analysis"
echo "=================================================="
echo ""

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama is not installed or not in PATH"
    echo "Please install Ollama from https://ollama.ai"
    exit 1
fi

echo "✅ Ollama is installed"
echo ""

# Check Ollama service
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "⚠️  Ollama service not responding on localhost:11434"
    echo "Starting Ollama service..."

    if command -v ollama &> /dev/null; then
        # Try to start in background (depends on OS)
        if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
            # Windows
            start ollama serve
        else
            # macOS/Linux
            ollama serve &
        fi

        # Wait for service to start
        echo "Waiting for Ollama to start..."
        for i in {1..30}; do
            if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
                echo "✅ Ollama service is ready"
                break
            fi
            echo -n "."
            sleep 1
        done
    fi
fi

echo ""
echo "📦 Available Models"
echo "==================="
ollama list
echo ""

echo "🔄 Pulling gemma3:270m (Lightweight - 2GB)"
echo "==========================================="
echo "This model is optimized for fast inference on legal documents."
echo "Memory requirement: ~5GB RAM"
echo ""

ollama pull gemma3:270m

echo ""
echo "✅ Model pulled successfully!"
echo ""

# Verify the model
echo "🔍 Verifying installation..."
if ollama list | grep -q "gemma3:270m"; then
    echo "✅ gemma3:270m is installed and ready"
else
    echo "❌ Model verification failed"
    exit 1
fi

echo ""
echo "📊 Updated model list"
echo "===================="
ollama list

echo ""
echo "🎉 Setup complete!"
echo ""
echo "You can now:"
echo "1. Test the model: ollama run gemma3:270m"
echo "2. Upload documents: POST /api/ai/ollama/analyze-legal-document"
echo "3. Monitor inference: Check Ollama logs"
echo ""
echo "Optional: Pull additional models"
echo "  Full model:     ollama pull gemma3"
echo "  Embedding:      ollama pull embeddinggemma:latest"
echo "  Alternative:    ollama pull mistral"
echo ""
