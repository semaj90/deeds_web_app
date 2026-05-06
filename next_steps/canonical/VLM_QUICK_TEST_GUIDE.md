# VLM Integration - Quick Test Guide

## Pre-Flight Checklist

### 1. Verify Ollama Models
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Expected output should include:
# - embeddinggemma:latest
# - gemma3-legal:latest
# - gemma3-vision:latest

# If missing, pull them:
ollama pull embeddinggemma:latest
ollama pull gemma3-legal:latest
ollama pull gemma3-vision:latest
```

### 2. Verify Database
```bash
# Check PostgreSQL connection
psql -U legal_admin -d legal_ai_db -c "SELECT 1;"

# Verify chat tables exist
psql -U legal_admin -d legal_ai_db -c "\dt chat_*"

# Expected output:
# - chat_turns
# - chat_turn_evidence
# - chat_analytics
```

### 3. Verify Services
```bash
# Check Context Orchestrator (if running)
curl http://localhost:8085/health

# Check RAG/KAG Service (if running)
python -c "import grpc; print('✅ gRPC available')"
```

## Test 1: Ollama Service - Text Embedding

```bash
curl -X POST http://localhost:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "embeddinggemma:latest",
    "prompt": "This is a legal contract"
  }'

# Expected: Array of 384 floats (embedding vector)
```

## Test 2: Ollama Service - Text Generation

```bash
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma3-legal:latest",
    "prompt": "What is a liability clause?",
    "stream": false
  }'

# Expected: Legal explanation of liability clauses
```

## Test 3: Ollama Service - Vision Analysis

```bash
# First, create a test image (or use existing one)
# Convert to base64:
base64 -i test-document.png > test-image-b64.txt

# Then test vision endpoint:
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma3-vision:latest",
    "prompt": "Analyze this legal document",
    "images": ["<BASE64_IMAGE_HERE>"],
    "stream": false
  }'

# Expected: Document analysis with key terms and concepts
```

## Test 4: Enhanced RAG Endpoint

```bash
# Test without image (RAG only)
curl -X POST http://localhost:5173/api/ai/enhanced-rag-vlm \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the key obligations?",
    "ragResults": [
      {
        "text": "The party agrees to provide services within 30 days",
        "evidence_id": "EV-001",
        "chunk_id": "ev-001-c1",
        "score": 0.92
      }
    ],
    "documentType": "contract"
  }'

# Expected response:
# {
#   "answer": "The key obligation is to provide services within 30 days",
#   "sources": [...],
#   "confidence": 0.85,
#   "latencyMs": 1234
# }
```

## Test 5: Enhanced RAG with VLM

```bash
# Convert image to base64 first
base64 -i contract.png > contract-b64.txt
IMAGE_B64=$(cat contract-b64.txt)

# Test with image
curl -X POST http://localhost:5173/api/ai/enhanced-rag-vlm \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"What are the key terms?\",
    \"ragResults\": [
      {
        \"text\": \"Contract text from RAG...\",
        \"evidence_id\": \"EV-001\",
        \"chunk_id\": \"ev-001-c1\",
        \"score\": 0.92
      }
    ],
    \"imageData\": \"$IMAGE_B64\",
    \"documentType\": \"contract\",
    \"caseId\": \"case-123\"
  }"

# Expected response includes:
# - answer: AI-generated response
# - visionInsights: Array of vision analysis insights
# - confidence: Response confidence score
# - latencyMs: Processing time
```

## Test 6: Contextual Chat Endpoint

```bash
# Test basic chat
curl -X POST http://localhost:5173/api/ai/yorha/context-chat \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<YOUR_SESSION_COOKIE>" \
  -d '{
    "message": "What evidence relates to the timeline?",
    "caseId": "case-123"
  }'

# Expected response:
# {
#   "turnId": "uuid-here",
#   "answer": "Based on the evidence...",
#   "didYouMean": [...],
#   "citations": [...],
#   "latencyMs": 1234
# }
```

## Test 7: Database Persistence

```bash
# Check if chat turn was saved
psql -U legal_admin -d legal_ai_db -c "SELECT id, message, created_at FROM chat_turns ORDER BY created_at DESC LIMIT 1;"

# Check analytics
psql -U legal_admin -d legal_ai_db -c "SELECT * FROM chat_analytics ORDER BY created_at DESC LIMIT 1;"

# Check evidence links
psql -U legal_admin -d legal_ai_db -c "SELECT * FROM chat_turn_evidence LIMIT 5;"
```

## Troubleshooting

### Issue: "Ollama not responding"
```bash
# Check if Ollama is running
ps aux | grep ollama

# Restart Ollama
ollama serve

# Verify endpoint
curl http://localhost:11434/api/tags
```

### Issue: "Model not found"
```bash
# List available models
ollama list

# Pull missing model
ollama pull gemma3-vision:latest

# Verify it's loaded
curl http://localhost:11434/api/tags | grep gemma3-vision
```

### Issue: "Database connection failed"
```bash
# Check PostgreSQL is running
psql -U legal_admin -d legal_ai_db -c "SELECT 1;"

# Check connection string
echo $DATABASE_URL

# Verify tables exist
psql -U legal_admin -d legal_ai_db -c "\dt chat_*"
```

### Issue: "Context orchestrator failed"
```bash
# Check if service is running
curl http://localhost:8085/health

# Check logs
tail -f /var/log/yorha-context-orchestrator.log

# Restart service
systemctl restart yorha-context-orchestrator
```

### Issue: "Image analysis timeout"
```bash
# Reduce image size before sending
# Or increase timeout in ollama-service.ts:
# timeout: 120000, // 2 minutes

# Check Ollama memory usage
ollama ps

# Restart Ollama if needed
ollama serve
```

## Performance Benchmarks

Expected latencies (on RTX 3090):

| Operation | Latency | Notes |
|-----------|---------|-------|
| Text embedding | 50-100ms | embeddinggemma |
| Text generation | 500-2000ms | gemma3-legal, 100 tokens |
| Image analysis | 1000-3000ms | gemma3-vision, 512x512 image |
| Enhanced RAG | 1500-4000ms | RAG + VLM combined |
| Context chat | 2000-5000ms | Full orchestration |

## Success Indicators

✅ All tests pass
✅ Ollama models respond quickly
✅ Database tables are populated
✅ Vision analysis returns meaningful insights
✅ Chat responses are contextually relevant
✅ Latencies are within acceptable range

## Next Steps

1. **Integrate with UI** - Add YoRHaChat component to frontend
2. **Add image upload** - Implement file upload for documents
3. **Fine-tune models** - Train on legal domain data
4. **Monitor performance** - Set up analytics dashboard
5. **Scale deployment** - Deploy to production infrastructure

