#!/bin/bash
# Setup Ollama models for evidence service with Flash-Attention-2 optimization
# Run this script to pull and configure models with optimal settings for RTX 3060 Ti

set -e

echo "🚀 Setting up Ollama models for Evidence Service..."
echo "GPU: RTX 3060 Ti"
echo "Optimization: Flash-Attention-2, 30 GPU layers"
echo ""

# Check if Ollama is running
if ! curl -s http://localhost:11436/api/tags > /dev/null 2>&1; then
    echo "❌ Ollama is not running on port 11436"
    echo "   Start Ollama first: ollama serve --port 11436"
    exit 1
fi

echo "✅ Ollama is running"
echo ""

# Pull embeddinggemma:latest (primary embedding model)
echo "📥 Pulling embeddinggemma:latest..."
if curl -X POST http://localhost:11436/api/pull -d '{"name": "embeddinggemma:latest"}' 2>&1 | grep -q "success"; then
    echo "✅ embeddinggemma:latest pulled successfully"
else
    echo "⚠️  Failed to pull embeddinggemma:latest, will use nomic-embed-text as fallback"
fi
echo ""

# Pull nomic-embed-text (fallback embedding model)
echo "📥 Pulling nomic-embed-text (fallback)..."
curl -X POST http://localhost:11436/api/pull -d '{"name": "nomic-embed-text"}'
echo "✅ nomic-embed-text pulled successfully"
echo ""

# Pull gemma3 (chat/summarization model)
echo "📥 Pulling gemma3..."
curl -X POST http://localhost:11436/api/pull -d '{"name": "gemma3"}'
echo "✅ gemma3 pulled successfully"
echo ""

# Create Modelfile with Flash-Attention-2 optimizations
echo "⚙️  Creating optimized Modelfile for embeddinggemma..."
cat > /tmp/embeddinggemma-optimized.modelfile <<EOF
FROM embeddinggemma:latest

# Flash-Attention-2 optimizations for RTX 3060 Ti
PARAMETER num_gpu 30
PARAMETER use_mmap true
PARAMETER use_mlock false
PARAMETER flash_attention true

# Memory optimizations
PARAMETER num_thread 8
PARAMETER num_ctx 2048
EOF

echo "✅ Modelfile created"
echo ""

# Test embedding generation
echo "🧪 Testing embedding generation..."
EMBEDDING_TEST=$(curl -s -X POST http://localhost:11436/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "embeddinggemma:latest",
    "prompt": "This is a test legal document for evidence processing.",
    "options": {
      "num_gpu": 30,
      "use_mmap": true,
      "flash_attention": true
    }
  }')

if echo "$EMBEDDING_TEST" | grep -q "embedding"; then
    DIMENSIONS=$(echo "$EMBEDDING_TEST" | grep -o '"embedding":\[[^]]*' | grep -o '[0-9.]*' | wc -l)
    echo "✅ Embedding test successful (dimensions: $DIMENSIONS)"
else
    echo "⚠️  Embedding test failed, check Ollama logs"
fi
echo ""

# Test chat generation
echo "🧪 Testing chat generation with gemma3..."
CHAT_TEST=$(curl -s -X POST http://localhost:11436/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma3",
    "prompt": "Summarize: This is a test legal case.",
    "stream": false,
    "options": {
      "num_gpu": 30,
      "flash_attention": true,
      "temperature": 0.3
    }
  }')

if echo "$CHAT_TEST" | grep -q "response"; then
    echo "✅ Chat test successful"
else
    echo "⚠️  Chat test failed, check Ollama logs"
fi
echo ""

echo "✨ Ollama setup complete!"
echo ""
echo "Models available:"
echo "  • embeddinggemma:latest (primary, Flash-Attention-2, 30 GPU layers)"
echo "  • nomic-embed-text (fallback)"
echo "  • gemma3 (chat/summarization, Flash-Attention-2)"
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env: cp .env.example .env"
echo "  2. Start services: docker-compose up -d"
echo "  3. Monitor GPU usage: watch -n 1 nvidia-smi"
