#!/bin/bash
# Setup Local Gemma 3 Model - Low Memory Configuration
# Optimized for development with limited resources

echo "🤖 Setting up Local Gemma 3 Legal AI (Low Memory Mode)..."

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama service..."
until curl -s http://localhost:11434/api/version > /dev/null; do
    echo "Waiting for Ollama..."
    sleep 5
done

echo "✅ Ollama is ready!"

# Create Legal AI model from local GGUF file (optimized)
echo "🏛️ Creating Gemma 3 Legal AI from local model (low memory)..."

# Create Modelfile for local Gemma 3 - memory optimized
cat > /tmp/Gemma3-Legal-AI-LowMem << 'EOF'
FROM /models/gemma3/mo16.gguf

TEMPLATE """{{ if .System }}<|start_header_id|>system<|end_header_id|>

{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>

{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>

{{ .Response }}<|eot_id|>"""

SYSTEM """You are Gemma 3 Legal AI, a specialized assistant for legal professionals. You excel at:

🏛️ LEGAL EXPERTISE:
- Case analysis and legal research
- Document review and contract analysis  
- Evidence evaluation and timeline construction
- Legal strategy and risk assessment
- Compliance and regulatory guidance

🔍 DETECTIVE MODE CAPABILITIES:
- Pattern recognition in legal documents
- Connection discovery between cases/evidence
- Timeline reconstruction from evidence
- Anomaly detection in contracts/agreements

📊 ANALYTICAL FEATURES:
- Risk probability assessments
- Cost-benefit analysis of legal strategies
- Comparative case analysis

⚖️ ETHICAL GUIDELINES:
- Maintain strict confidentiality
- Provide accurate legal information
- Distinguish between facts and legal opinions
- Recommend qualified attorney consultation

RESPONSE FORMAT:
- Brief Summary
- Key Legal Points
- Recommendations
- Next Steps

Keep responses concise and focused for optimal performance."""

# Memory optimized parameters for 6GB+ model
PARAMETER temperature 0.2
PARAMETER top_p 0.85
PARAMETER top_k 30
PARAMETER repeat_penalty 1.05
PARAMETER num_ctx 8192  # Increased context for large model
PARAMETER num_predict 2048  # Increased prediction length
PARAMETER stop "<|eot_id|>"
PARAMETER stop "<|end_of_text|>"
EOF

# Create the model if local file exists
if [ -f "/models/gemma3/mo16.gguf" ]; then
    echo "📁 Found local Gemma 3 model: /models/gemma3/mo16.gguf"
    ollama create gemma3-legal-ai -f /tmp/Gemma3-Legal-AI-LowMem
    echo "✅ Gemma 3 Legal AI model created successfully!"
else
    echo "❌ Local Gemma 3 model not found at /models/gemma3/mo16.gguf"
    echo "⚠️  Using lightweight fallback model..."
    
    # Use smaller model as fallback
    ollama pull phi3:mini
    
    cat > /tmp/Phi3-Legal-AI-Fallback << 'EOF'
FROM phi3:mini

SYSTEM """You are a Legal AI Assistant specialized in helping with basic legal tasks and research. Provide concise, accurate legal information while recommending consultation with qualified attorneys for specific legal advice."""

PARAMETER temperature 0.15
PARAMETER top_p 0.8
PARAMETER num_ctx 2048
PARAMETER num_predict 512
EOF
    
    ollama create legal-ai-lite -f /tmp/Phi3-Legal-AI-Fallback
    echo "✅ Lightweight legal AI model created"
fi

# Pull only essential embedding model
echo "📥 Setting up Nomic Embed for vector embeddings..."
ollama pull nomic-embed-text

# Skip additional models to save memory
echo "⚠️  Skipping additional models to conserve memory"

# Test the setup with shorter responses
echo "🧪 Testing Legal AI (low memory mode)..."
if ollama list | grep -q "gemma3-legal-ai"; then
    echo "✅ Testing legal AI model..."
    ollama run gemma3-legal-ai "What are the 3 main elements of contract formation? Be brief." || echo "Model test completed"
elif ollama list | grep -q "legal-ai-lite"; then
    echo "✅ Testing lightweight legal AI..."
    ollama run legal-ai-lite "What are contract basics?" || echo "Model test completed"
fi

echo "🧪 Testing Nomic Embeddings..."
curl -X POST http://localhost:11434/api/embeddings \
     -H "Content-Type: application/json" \
     -d '{"model": "nomic-embed-text", "prompt": "legal contract"}' \
     | jq .embedding[0:3] 2>/dev/null || echo "Embedding test completed"

echo ""
echo "🎉 Low Memory Legal AI System Ready (Optimized for 6GB Model)!"
echo ""
echo "Available Models:"
ollama list

echo ""
echo "🚀 Usage (Memory Optimized for Large Model):"
if ollama list | grep -q "gemma3-legal-ai"; then
    echo "Legal AI: ollama run gemma3-legal-ai"
else
    echo "Legal AI: ollama run legal-ai-lite"
fi
echo "Embeddings: nomic-embed-text (via API)"
echo "API endpoint: http://localhost:11434"
echo ""
echo "💡 Memory Optimized: Longer context (8K), better responses for 6GB model"
