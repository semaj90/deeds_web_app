# Clarity: Ollama vs Legal GGUF — Which Service for What?

## The Question
> "ollama should only be used for embeddinggemma what's the difference?"

**Correct.** You're using Ollama ONLY for embeddings (vector generation). The legal GGUF handles everything else.

---

## Side-by-Side Comparison

### Ollama + embeddinggemma:latest

```
Purpose:    Vector embeddings only (768-dimensional)
Model:      embeddinggemma:latest (621MB)
Port:       :11434
Input:      Text documents, queries
Output:     Float32 vector (768 dims)
Speed:      ~100ms per sentence
VRAM:       ~500MB (lightweight)
Use Case:   Index building, semantic search, Bifrost L2 cache
Status:     ❌ Not running (not needed yet)
```

**Example:**
```bash
curl -X POST http://127.0.0.1:11434/api/embed \
  -H "Content-Type: application/json" \
  -d '{
    "model": "embeddinggemma:latest",
    "input": "What is hearsay evidence?"
  }'

# Returns:
# {"embeddings": [[0.123, -0.456, ..., 0.789]]}
#  └─ 768 numbers (the embedding vector)
```

---

### Legal GGUF (TurboQuant) + llama-server

```
Purpose:    Full LLM inference (text generation + vision)
Model:      gemma4-legal-iq4xs-direct.gguf (4.8GB)
Port:       :8090
Input:      Chat messages, documents (with images)
Output:     Text responses (legal explanations, summaries)
Speed:      3-5 seconds per response
VRAM:       ~4.8GB (full model)
Use Case:   Legal reasoning, summarization, chat, vision
Status:     ✅ Ready (use with TurboQuant)
```

**Example:**
```bash
curl -X POST http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma4-legal-iq4xs-direct.gguf",
    "messages": [
      {"role": "user", "content": "What is hearsay evidence?"}
    ],
    "max_tokens": 200
  }'

# Returns:
# {
#   "choices": [{
#     "message": {
#       "content": "Hearsay is an out-of-court statement offered..."
#     }
#   }]
# }
#  └─ Full explanation (not vectors)
```

---

## The Difference Explained

| Aspect | Ollama (embeddinggemma) | Legal GGUF (llama-server) |
|---|---|---|
| **What it does** | Converts text → numbers | Converts messages → responses |
| **Input** | Raw text | Chat messages + system prompt |
| **Output** | Vector (768 floats) | Generated text (explanation) |
| **Quality** | Semantic similarity | Legal reasoning |
| **Speed** | ~100ms | 3-5s |
| **VRAM** | 500MB | 4.8GB |
| **Purpose** | Indexing & search | Inference & reasoning |
| **Running now?** | ❌ No | ✅ Ready |

---

## Use Case Examples

### When You Use Ollama (embeddinggemma)

#### 1. Building a search index
```
Document: "Hearsay evidence is an out-of-court statement..."
  ↓ (Ollama)
Vector: [0.123, -0.456, ..., 0.789]
  ↓
Store in Qdrant
  ↓
Later, query: "Define hearsay"
  ↓ (Ollama)
Vector: [0.110, -0.420, ..., 0.805]
  ↓
Compare similarity with stored vectors
  ↓
Return matching documents
```

#### 2. Bifrost semantic cache (L2)
```
User asks: "What is hearsay?"
  ↓ (Ollama)
Embedding: [0.110, -0.420, ..., 0.805]
  ↓ (Bifrost)
Search Qdrant for similar cached responses
  ↓
Found match (cosine similarity 0.87)
  ↓
Return cached response (fast!)
```

---

### When You Use Legal GGUF (llama-server)

#### 1. Answer legal questions
```
Question: "What is hearsay evidence?"
  ↓ (Legal GGUF)
Response: "Hearsay is an out-of-court statement made by a person 
           other than the witness, offered to prove the truth of 
           the matter asserted. Under Federal Rules of Evidence 
           801-803, there are exceptions..."
```

#### 2. Summarize documents
```
Code file: [1000 lines of TypeScript]
  ↓ (Legal GGUF)
Summary: "Handles Lucia session validation and token refresh. 
          Key exports: validateSession(), refreshToken()."
```

#### 3. Extract structure from legal documents
```
Case document: [PDF with facts, claims, evidence]
  ↓ (Legal GGUF + VLM)
Structured JSON:
{
  "parties": ["Plaintiff", "Defendant"],
  "claims": ["Breach of contract", "Damages"],
  "evidence": ["Email 2023-03-15", "Invoice 2023-04-20"]
}
```

---

## Your Stack Now

```
┌─────────────────────────────────────────────┐
│ User Query                                  │
└─────────────────────────────────────────────┘
                    ↓
        ┌───────────────────────┐
        │ Bifrost Cache (:3040) │
        │ (routing + caching)   │
        └───────────────────────┘
               ↙         ↘
     L1 Check       L2 Check
     (Redis)      (Qdrant)
        ↓            ↓
      HIT       Need Vector?
        ↓            ↓
     Return    (Ollama - when ready)
               embeddinggemma
                    ↓
               Search Qdrant
                    ↓
                  HIT/MISS
                    ↓
        ┌──────────────────────┐
        │ Legal GGUF (:8090)   │
        │ (inference)          │
        │ TurboQuant           │
        └──────────────────────┘
                    ↓
              Final Response
```

---

## Right Now (Today)

```
✅ Legal GGUF (TurboQuant):   Ready (:8090)
✅ Bifrost Cache:             Ready (:3040)
✅ Qdrant Vector Store:       Ready (:6333)
❌ Ollama (embeddings):       Not running
   → Not needed yet
   → Only start when you build document indexing
```

---

## Testing Without Ollama

You can fully test your stack right now:

```powershell
# Test 1: Legal GGUF inference
curl -X POST http://127.0.0.1:8090/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{
    "model": "gemma4-legal-iq4xs-direct.gguf",
    "messages": [{"role": "user", "content": "What is hearsay?"}],
    "max_tokens": 100
  }'

# Test 2: Qdrant vector store
curl http://127.0.0.1:6333/collections

# Test 3: Bifrost caching
curl http://127.0.0.1:3040/health

# All work without Ollama!
```

---

## When to Start Ollama

**Start Ollama when:**
1. You build document embedding pipeline
2. You implement semantic search
3. You want Bifrost L2 semantic caching (with precomputed embeddings)

**Example trigger:**
```typescript
// Document indexing pipeline
import { embedText } from '$lib/server/embeddings/ollama';

const chunks = splitDocument(pdf);
for (const chunk of chunks) {
  const embedding = await embedText(chunk);  // ← This is when Ollama starts
  await qdrant.upsert(embedding, chunk);
}
```

Until then, Ollama stays down. No VRAM wasted.

---

## Summary Table

| Operation | Service | Status | Why |
|---|---|---|---|
| Answer legal questions | Legal GGUF :8090 | ✅ Ready | Primary inference |
| Summarize code files | Legal GGUF :8090 | ✅ Ready | Legal GGUF only |
| Embed documents | Ollama :11434 | ❌ Not ready | Only for indexing |
| Cache responses | Bifrost :3040 | ✅ Ready | Uses legal GGUF |
| Store vectors | Qdrant :6333 | ✅ Ready | Empty, ready for docs |

---

## One-Liner Tests

```powershell
# Legal GGUF health
curl http://127.0.0.1:8090/health

# Qdrant health
curl http://127.0.0.1:6333/collections | jq .

# Bifrost health
curl http://127.0.0.1:3040/health

# Ollama health (if running)
curl http://127.0.0.1:11434/api/tags
```

**Right now: 3 of 4 should pass. Ollama will fail (not running yet).**

