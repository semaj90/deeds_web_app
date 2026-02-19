#!/bin/bash
# Setup Ollama models using existing local Gemma3 Legal model

echo "Setting up local Gemma3 Legal AI model..."

# Wait for Ollama to be ready
while ! curl -f http://localhost:11434/api/version > /dev/null 2>&1; do
    echo "Waiting for Ollama to start..."
    sleep 2
done

echo "Ollama is ready. Setting up local Gemma3 model..."

# Create legal-ai model from local Gemma3 files
cat > /tmp/Modelfile-legal-gemma3 << 'EOF'
FROM /models/gemma3/mo16.gguf

TEMPLATE """<start_of_turn>user
{{ .Prompt }}<end_of_turn>
<start_of_turn>model
"""

SYSTEM """You are a specialized legal AI assistant for prosecutors. Focus on:
- Evidence analysis and case timeline construction
- Legal precedent research and citation
- Witness statement evaluation
- Strategic prosecution planning
- Document summarization and review

Provide concise, actionable legal insights while maintaining professional standards and confidentiality."""

PARAMETER temperature 0.3
PARAMETER top_k 40
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER stop "<start_of_turn>"
PARAMETER stop "<end_of_turn>"
PARAMETER num_ctx 4096
PARAMETER num_predict 512
EOF

# Create the legal-ai model from local Gemma3
if ! ollama ls | grep -q "legal-ai"; then
    echo "Creating legal-ai model from local Gemma3..."
    ollama create legal-ai -f /tmp/Modelfile-legal-gemma3
else
    echo "legal-ai model already exists"
fi

# Pull lightweight embedding model for vector operations
if ! ollama ls | grep -q "nomic-embed-text"; then
    echo "Pulling nomic-embed-text for embeddings..."
    ollama pull nomic-embed-text
else
    echo "nomic-embed-text model already exists"
fi

echo "Model setup complete!"
echo "Available models:"
ollama ls

# Test the models
echo "Testing legal-ai model..."
echo "What is probable cause?" | ollama run legal-ai --verbose