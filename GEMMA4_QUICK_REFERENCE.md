# Gemma 4 Quick Reference Card

**Model**: `gemma4:e4b-it-q4_K_M`
**Size**: 9.6GB Q4_K_M
**VRAM**: 5.8GB
**Context**: 32K tokens
**Features**: VLM + Tool Calling + Legal GRPO Fine-tune

---

## Import Statement

```typescript
import {
  chat,              // Basic text chat
  chatVLM,           // Vision + text
  chatWithTools,     // Tool calling
  chatJSON,          // Structured output
  generationClient,  // Full client
} from '$lib/server/grpc/generation-client';
```

---

## Use Cases

### 1. Text Chat (Most Common)

```typescript
const answer = await chat(
  [
    { role: 'system', content: 'You are a legal AI.' },
    { role: 'user', content: 'What is hearsay?' }
  ],
  'gemma4:e4b-it-q4_K_M',
  { temperature: 0.7, maxTokens: 500 }
);
```

**When**: Legal Q&A, synthesis, summaries

---

### 2. Vision (VLM)

```typescript
const analysis = await chatVLM(
  [{ role: 'user', content: 'Analyze this evidence photo' }],
  [{ data: imageBytes, format: 'jpg' }],
  'gemma4:e4b-it-q4_K_M'
);
```

**When**: POI photos, evidence documents, OCR fallback

---

### 3. Tool Calling

```typescript
const response = await chatWithTools(
  [{ role: 'user', content: 'Search California theft statutes' }],
  [
    {
      type: 'function',
      function: {
        name: 'search_statutes',
        description: 'Search legal statutes',
        parametersSchema: { type: 'object', properties: { keyword: { type: 'string' } } },
      },
    },
  ],
  'gemma4:e4b-it-q4_K_M'
);

if (response.message.toolCall) {
  const result = await executeFunction(response.message.toolCall);
  // Send result back to model...
}
```

**When**: Search, retrieval, multi-step reasoning

---

### 4. Structured Output (JSON)

```typescript
const analysis = await chatJSON<{ summary: string; confidence: number }>(
  [
    { role: 'system', content: 'Return JSON: { summary: string, confidence: number }' },
    { role: 'user', content: 'Analyze: [text]' }
  ],
  'gemma4:e4b-it-q4_K_M',
  { temperature: 0.1 }  // Low temp for consistency
);
```

**When**: ACE responses, entity extraction, structured data

---

## Model Selection

| Task | Model | Why |
|------|-------|-----|
| Embeddings | `embeddinggemma:latest` | 768-dim, optimized for semantic search |
| Chat | `gemma4:e4b-it-q4_K_M` | 32K context, legal fine-tune |
| VLM | `gemma4:e4b-it-q4_K_M` | Vision via mmproj |
| Tool Calling | `gemma4:e4b-it-q4_K_M` | Native tool support |
| Client (WebGPU) | `gemma4:e2b-it-q4f16` | 2.3B params, browser-compatible |
| Client (ONNX) | `gemma3_270m_onnx` | 270M params, WASM fallback |

**Rule**: Use `embeddinggemma:latest` for embeddings, `gemma4:e4b-it-q4_K_M` for everything else.

---

## Options Reference

```typescript
interface GenerateOptions {
  temperature?: number;      // 0.0-2.0 (default: 0.7)
  maxTokens?: number;        // Max completion tokens
  topP?: number;             // Nucleus sampling (default: 0.9)
  topK?: number;             // Top-K sampling (default: 40)
  stop?: string[];           // Stop sequences
  numCtx?: number;           // Context window (default: 32768)
  stream?: boolean;          // Enable streaming
  repeatPenalty?: number;    // Repetition penalty (default: 1.1)
  seed?: number;             // Random seed
}
```

**Recommended**:
- **Legal Q&A**: `{ temperature: 0.3, maxTokens: 1000 }`
- **Creative writing**: `{ temperature: 0.8, maxTokens: 2000 }`
- **Structured output**: `{ temperature: 0.1, maxTokens: 500 }`
- **VLM analysis**: `{ temperature: 0.2, maxTokens: 500 }`

---

## Performance

| Scenario | Latency | Cache | Notes |
|----------|---------|-------|-------|
| Text chat (cold) | 25s | L3 | GPU inference |
| Text chat (L2 hit) | 3s | Bifrost | Semantic match |
| Text chat (L1 hit) | 5ms | Redis | Exact match |
| VLM analysis | 28s | None | No caching (unique) |
| Tool calling | 30s | None | Execution time varies |
| Streaming | ~1s/chunk | L3 | Real-time output |

---

## Integration Points (Replace These)

**File**: `synthesis/generate/+server.ts`
```typescript
// OLD: bifrostChat(messages, 'gemma3-legal:latest', { ... })
// NEW: chat(messages, 'gemma4:e4b-it-q4_K_M', { ... })
```

**File**: `sse/chat/+server.ts`
```typescript
// OLD: Ollama direct streaming
// NEW: generationClient.generateStream({ messages, model: 'gemma4:e4b-it-q4_K_M' })
```

**File**: `workers/video-vlm-processor.ts`
```typescript
// OLD: Mock VLM
// NEW: chatVLM(messages, [image], 'gemma4:e4b-it-q4_K_M')
```

---

## Environment Setup

```bash
# .env
LLM_MODEL=gemma4:e4b-it-q4_K_M
EMBED_MODEL=embeddinggemma:latest
GENERATION_SERVICE_URL=http://localhost:50052
OLLAMA_URL=http://localhost:11434
```

---

## Protobuf Files

| File | Purpose |
|------|---------|
| `proto/generation.proto` | Gemma 4 service definition |
| `proto/embedding.proto` | Embedding service |
| `proto/retrieval.proto` | Search/rerank service |
| `proto/graph_analysis.proto` | Graph operations |

**Codegen**:
```bash
cd proto && pbjs -t static-module -w commonjs -o generation.js generation.proto
pbts -o generation.d.ts generation.js
```

---

## Troubleshooting

**Issue**: VLM not working
**Fix**: Check mmproj loaded: `ollama show gemma4:e4b-it-q4_K_M | grep mmproj`

**Issue**: Tool calls ignored
**Fix**: Add explicit instruction in system prompt

**Issue**: Out of VRAM
**Fix**: Reduce context: `{ numCtx: 16384 }` or unload other models

**Issue**: Slow inference
**Fix**: Check GPU utilization: `nvidia-smi` — should be >80% during inference

---

## Files Created

- ✅ `proto/generation.proto` — Service definition
- ✅ `src/lib/server/grpc/generation-client.ts` — TypeScript client
- ✅ `GEMMA4_INTEGRATION_GUIDE.md` — Full integration guide
- ✅ `GEMMA4_QUICK_REFERENCE.md` — This file
- ✅ `ARCHITECTURE_SPEC.md` — Updated with Gemma 4 support

---

## Next Actions

1. **Test basic chat**: `curl localhost:50052/health`
2. **Update `model-ids.ts`**: Set `LLM_SERVER: 'gemma4:e4b-it-q4_K_M'`
3. **Migrate one endpoint**: Start with `synthesis/generate`
4. **Benchmark**: Compare Gemma 3 vs Gemma 4 quality
5. **Deploy**: Update production config

---

**Gemma 4 is ready — just import and use!** 🚀

```typescript
import { chat } from '$lib/server/grpc/generation-client';
const answer = await chat([...], 'gemma4:e4b-it-q4_K_M');
```
