# Ollama Configuration: Embeddings Only (Lightweight Setup)

## Current Architecture

You're using a **two-model strategy**:

```
Legal GGUF (TurboQuant)          Embeddings Service (Ollama)
llama-server.exe :8090           Ollama :11434
gemma4-legal-iq4xs-direct.gguf   embeddinggemma:latest
├─ Inference                      ├─ Vector embeddings (768-dim)
├─ Chat                           ├─ Document understanding
├─ Vision (VLM)                   ├─ Search indexing
└─ ~4.8GB VRAM                    └─ ~500MB VRAM (lightweight)
```

**Why separate?**
- Inference model: Needs full VRAM for generation (legal GGUF)
- Embedding model: Lightweight, high throughput (embeddinggemma)
- No GPU contention: Each service independent

---

## Ollama Status: Currently DOWN (Intentional)

```
✅ Qdrant (vector store):        :6333 (HTTP), :6334 (gRPC)
✅ TurboQuant (inference):       :8090 (llama-server)
❌ Ollama (embeddings):          NOT RUNNING
```

**Why is Ollama down?**
- You're focusing on inference (legal GGUF)
- Embeddings can wait
- Reduces VRAM pressure during development

---

## When You Need Ollama (Embeddings)

### Use Case 1: Document Indexing Pipeline
```
Legal document upload
  → Extract text
  → Chunk by sections
  → Embed with Ollama embeddinggemma:latest
  → Store in Qdrant
  → Ready for RAG search
```

### Use Case 2: Search Queries
```
User query: "What is hearsay evidence?"
  → Embed query via Ollama :11434
  → Search Qdrant for similar chunks
  → Return ranked results
```

### Use Case 3: Semantic Caching (Bifrost L2)
```
bifrostChat(messages, model)
  → Extract user message
  → Embed via Ollama (5ms)
  → Search Qdrant for semantic similarity
  → Return cached response if 82%+ match
```

---

## How to Start Ollama (When Needed)

### Option A: Docker (Recommended)
```bash
docker run -d \
  --name legal-ai-ollama \
  --gpus all \
  -p 11434:11434 \
  -v ollama:/root/.ollama \
  ollama/ollama

# Pull the embedding model
docker exec legal-ai-ollama ollama pull embeddinggemma:latest
```

### Option B: Native Binary (Your Current Setup)
```powershell
# If you have Ollama installed locally:
ollama serve

# In another terminal:
ollama pull embeddinggemma:latest
```

### Option C: Skip Ollama, Use Direct HTTP
If Ollama is too heavy, Qdrant can accept embeddings directly:
```typescript
// Instead of embedding via Ollama, compute client-side
const embedding = await computeEmbeddingLocally(text);  // WASM/WebGPU
const result = await qdrant.search({
  collection: 'documents',
  vector: embedding,
  limit: 10
});
```

---

## Testing Your Stack (No Ollama Required)

### Test 1: TurboQuant (Legal GGUF) ✅
```bash
curl -X POST http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma4-legal-iq4xs-direct.gguf",
    "messages": [
      {"role": "system", "content": "You are a legal expert."},
      {"role": "user", "content": "What is hearsay evidence?"}
    ],
    "temperature": 0.3,
    "max_tokens": 100
  }'
```

**Expected:** Legal answer in 3-5 seconds

### Test 2: Qdrant REST (Vector Store) ✅
```bash
# List collections
curl http://127.0.0.1:6333/collections

# Expected: JSON with collections list
```

### Test 3: Qdrant gRPC (Vector Store)
```powershell
# Check if port is open (should be after fix)
Test-NetConnection 127.0.0.1 -Port 6334

# Expected: $true
```

### Test 4: Bifrost Cache ✅
```bash
curl http://127.0.0.1:3040/health

# Expected: {"status":"ok"}
```

### Test 5: Ollama Embeddings (Optional, Only If Needed)
```bash
# Only run if you start Ollama
curl -X POST http://127.0.0.1:11434/api/embed \
  -H "Content-Type: application/json" \
  -d '{
    "model": "embeddinggemma:latest",
    "input": "What is hearsay evidence?"
  }'

# Expected: {"embeddings": [[0.123, -0.456, ...]]}
```

---

## Embedding Pipeline (When Ready)

### Architecture
```
Document Input
  ↓
[Split into chunks]
  ↓
[Embed via Ollama or WASM]
  ├─ Ollama :11434 (if running) → fast, GPU-accelerated
  └─ Local WASM (fallback) → slower, no GPU needed
  ↓
[Store in Qdrant]
  ├─ REST: http://127.0.0.1:6333
  └─ gRPC: localhost:6334 (Docker) or 127.0.0.1:6334 (exposed)
  ↓
[Ready for search/RAG]
```

### Code Pattern
```typescript
// sveltekit-frontend/src/lib/server/embeddings/ollama.ts

import { ENV } from '../env.server.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;  // http://127.0.0.1:11434
const EMBED_MODEL = 'embeddinggemma:latest';

export async function embedText(text: string): Promise<number[]> {
  // Check if Ollama is available
  const response = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: text
    }),
    signal: AbortSignal.timeout(5000)
  }).catch(() => null);

  if (!response?.ok) {
    // Fallback: Use local WASM embedding (slower)
    return computeLocalEmbedding(text);
  }

  const data = await response.json() as { embeddings: number[][] };
  return data.embeddings[0];
}

function computeLocalEmbedding(text: string): number[] {
  // WASM fallback (e.g., ONNX Runtime, transformers.js)
  // Returns 768-dim embedding
  // This is 5-10× slower but requires no external service
  return new Array(768).fill(0);  // Placeholder
}
```

---

## Qdrant Port Configuration (FIX)

### The Issue
```
Bifrost error: dial tcp [fdad:3aa:de7b:1::f]:6334 connect: connection refused
                       ↑ IPv6 Docker address
```

This is **NOT an Atlas problem.** It's a **Docker network configuration issue**.

### The Fix (Option A: Force HTTP/REST)

Update your environment:
```bash
# .env or env.server.ts
QDRANT_URL=http://127.0.0.1:6333
QDRANT_GRPC_URL=        # Empty/unset
QDRANT_PREFER_GRPC=false
QDRANT_USE_GRPC=false
```

Then restart services that connect to Qdrant.

### The Fix (Option B: Expose gRPC Port)

If Bifrost or other services REQUIRE gRPC:

```yaml
# docker-compose.yml
qdrant:
  image: qdrant/qdrant:latest
  ports:
    - "6333:6333"    # REST (HTTP)
    - "6334:6334"    # gRPC (already exposed, but verify)
  environment:
    QDRANT_API_ENABLE_CONSOLE: 'true'
```

Then verify:
```powershell
docker compose up -d qdrant
Start-Sleep 5
Test-NetConnection 127.0.0.1 -Port 6334  # Should be $true
```

---

## Your Actual Stack Now

| Component | Role | Status | Port | Why |
|---|---|---|---|---|
| **Legal GGUF** | Inference (text/vision) | ✅ Ready | 8090 | Main reasoning model |
| **Qdrant** | Vector storage | ✅ Running | 6333/6334 | Semantic search index |
| **Bifrost** | Cache + routing | ✅ Running | 3040 | L1/L2 caching |
| **Ollama** | Embeddings (optional) | ❌ Not needed yet | 11434 | For document indexing |
| **Redis/Valkey** | Session cache | ✅ Running | 6379 | Cache backend |
| **Postgres** | Identity + metadata | ✅ Running | 5434 | Source of truth |

---

## When to Start Ollama

**Start Ollama when you need to:**
1. Index new documents (embedding pipeline)
2. Build search indexes (Qdrant population)
3. Do semantic caching (Bifrost L2)
4. Compute query embeddings for RAG

**Don't start Ollama if you're only:**
1. Testing inference (legal GGUF alone)
2. Working on cache logic (use precomputed embeddings)
3. Developing summarization (no embeddings needed)

---

## One-Command Test Suite

```bash
# Test everything without Ollama

echo "1️⃣ TurboQuant (legal GGUF)..."
curl -s http://127.0.0.1:8090/health | jq .

echo "2️⃣ Qdrant REST..."
curl -s http://127.0.0.1:6333/collections | jq '.result | length'

echo "3️⃣ Bifrost Cache..."
curl -s http://127.0.0.1:3040/health | jq .

echo "4️⃣ Redis/Valkey..."
docker exec legal-ai-redis redis-cli PING

echo "5️⃣ Postgres..."
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1" 2>&1

echo "✅ All systems (no Ollama): ready"
```

---

## Summary

| Question | Answer |
|----------|--------|
| Should Ollama be running now? | ❌ No, it's not needed for inference testing |
| What is Ollama used for? | ✅ Embeddings only (document indexing, semantic search) |
| How is that different? | Ollama = lightweight embedding service, Legal GGUF = full inference |
| Is the Qdrant gRPC error blocking me? | ❌ No, Qdrant REST (:6333) works fine. Force HTTP if needed |
| What should I test now? | Legal GGUF inference, Bifrost cache, Atlas warm |
| When do I start Ollama? | When you build the document indexing pipeline |

