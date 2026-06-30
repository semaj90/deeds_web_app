# gRPC Lane: Ollama + Windows Native + Docker — Setup Guide

**Status**: Exploring local native Windows Ollama + gRPC bridge  
**Question**: Can we wire a gRPC lane for embeddings/generation alongside current HTTP?

---

## Current Setup (Working ✅)

```
SvelteKit (Node.js)
  ↓
HTTP to Ollama (:11434)
  ├─ Embeddings (embeddinggemma:latest)
  └─ Generation (gemma4-rotorquant:latest)
```

**Problem**: HTTP roundtrips add latency. Can we add gRPC (binary protocol, faster)?

---

## Option 1: Ollama Native Windows + gRPC Bridge

**Architecture**:
```
SvelteKit (Node.js)
  ├─ HTTP lane → Ollama :11434 (REST, fallback)
  └─ gRPC lane → Ollama gRPC :50051 (fast path)

Ollama (native Windows executable)
  ├─ HTTP server :11434
  └─ gRPC server :50051 (if enabled)
```

**Problem**: Ollama doesn't expose native gRPC interface. It only has REST (/api/embeddings, /api/generate).

**Workaround**: Build a gRPC bridge wrapper:

```protobuf
// embedding_service.proto
syntax = "proto3";
package embedding;

service EmbeddingService {
  rpc Embed(EmbedRequest) returns (EmbedResponse);
  rpc EmbedBatch(stream EmbedRequest) returns (stream EmbedResponse);
}

message EmbedRequest {
  string text = 1;
  string model = 2;
}

message EmbedResponse {
  repeated float embedding = 1;
  int32 dim = 2;
}
```

**Implementation** (Node.js gRPC bridge):
```typescript
// scripts/grpc/ollama-embeddings-bridge.ts
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import fetch from 'node-fetch';

const PROTO_PATH = './embedding_service.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {});
const embeddingProto = grpc.loadPackageDefinition(packageDefinition);

const server = new grpc.Server();

server.addService(embeddingProto.embedding.EmbeddingService.service, {
  async embed(call: any, callback: any) {
    const { text, model } = call.request;
    
    // Forward to Ollama HTTP
    const res = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text })
    });
    
    const data = await res.json();
    callback(null, {
      embedding: data.embedding,
      dim: data.embedding.length
    });
  },
  
  async *embedBatch(call: any) {
    // Streaming batch processing
    for await (const request of call) {
      const res = await fetch('http://127.0.0.1:11434/api/embeddings', {
        method: 'POST',
        body: JSON.stringify(request)
      });
      yield await res.json();
    }
  }
});

server.bindAsync('127.0.0.1:50051', grpc.ServerCredentials.createInsecure(), () => {
  server.start();
  console.log('gRPC bridge listening on :50051');
});
```

**Pros**:
- ✅ Adds gRPC lane without modifying Ollama
- ✅ Binary protocol (smaller payloads, faster parsing)
- ✅ Streaming batches (embedBatch RPC)
- ✅ Can run alongside HTTP (fallback if needed)

**Cons**:
- ❌ Overhead of bridge (still HTTP to Ollama internally)
- ❌ No real speedup vs direct HTTP (bridge is the bottleneck)
- ❌ Adds 300MB @grpc/grpc-js dependency
- ❌ gRPC handshake + serialization overhead

**Verdict**: **Not worth it.** Bridge adds latency instead of reducing it.

---

## Option 2: Ollama-CompatibleOpenAI + gRPC Client

**What**: Use Ollama's `/v1/embeddings` (OpenAI-compatible API) with a native gRPC client.

**Problem**: OpenAI API is REST-only. No official gRPC support.

**Verdict**: **Not viable.**

---

## Option 3: Local Ollama Native + Direct Library Linking

**What**: Load Ollama's inference engine directly (no HTTP server needed).

**Problem**: Ollama doesn't expose a public Rust or C library. It's a standalone Go binary.

**Workaround**: Call Ollama's Python bindings if they exist (they don't — Ollama is Go-only).

**Verdict**: **Not viable.**

---

## Option 4: Use existing gRPC services alongside Ollama

**What**: Wire gRPC endpoints that already exist in your stack:

```
SvelteKit
  ├─ HTTP → Ollama :11434 (embeddings, fallback LLM)
  ├─ gRPC → EmbeddingService :50051 (if running)
  ├─ gRPC → GenerationService :50052 (if available)
  └─ gRPC → RetrievalService :50053 (Go retrieval, verified working)
```

**Current gRPC services** (from your codebase):
- ✅ `:50053` — Go retrieval service (verified running)
- ✅ `:50051` — EmbeddingService (if it's in your stack)
- ⚠️  `:50052` — GenerationService (status unknown)
- ⚠️  `:50055` — CHR97 agent client (port collision note in CLAUDE.md)

**Implementation**:
```typescript
// scripts/grpc/grpc-client-router.ts
import * as grpc from '@grpc/grpc-js';

// Try gRPC first, fallback to HTTP
async function embed(text: string): Promise<number[]> {
  try {
    // Attempt gRPC :50051
    const channel = grpc.createChannel('127.0.0.1:50051', grpc.credentials.createInsecure());
    const stub = new EmbeddingServiceClient('...', channel);
    const response = await stub.embed({ text, model: 'embeddinggemma' });
    return response.embedding;
  } catch (err) {
    console.log('[gRPC] Fallback to HTTP:', err.message);
    // Fallback to Ollama HTTP
    const res = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
    });
    return (await res.json()).embedding;
  }
}
```

**Verdict**: **Check if :50051 EmbeddingService exists in your stack first.**

---

## Reality Check: What Ollama Natively Supports

**Ollama's Interfaces**:
1. ✅ **REST API** (:11434/api/*)
   - `/api/embeddings` → embed text
   - `/api/generate` → generate text
   - `/api/chat` → chat completion
   - Latency: ~1-2ms (local, not network)

2. ⚠️ **OpenAI-compatible** (:11434/v1/*)
   - Same REST API, OpenAI schema
   - No performance difference

3. ❌ **gRPC**: Not supported. Ollama is REST-only.

4. ❌ **GRPC reflection**: Not supported.

---

## Why HTTP to Local Ollama is Actually Fast

```
SvelteKit HTTP POST to Ollama
  ├─ DNS: 0ms (localhost)
  ├─ TCP handshake: ~1ms (loopback)
  ├─ HTTP serialization: <1ms (JSON encoder)
  ├─ Ollama inference: 500-2000ms (GPU work)
  ├─ HTTP response: <1ms (loopback)
  └─ Total: ~502-2001ms
  
Ollama HTTP is NOT the bottleneck. GPU inference is.
```

**gRPC benefits**:
- Binary protocol: saves ~100ms on large payloads (>1MB)
- Multiplexing: saves handshakes if batching calls
- Streaming: better for multi-turn or chunked responses

**For embeddings**: 768-dim float32 = 3KB payload. HTTP serialization cost: <1ms. Not worth gRPC overhead.

---

## Recommended Approach: Hybrid HTTP + Optional gRPC

**What to do**:

1. **Keep Ollama HTTP** (simple, working, no gRPC overhead)

2. **Check if EmbeddingService :50051 exists**:
   ```bash
   grpcurl -plaintext 127.0.0.1:50051 list
   # If response: EmbeddingService exists
   # If error: doesn't exist
   ```

3. **If :50051 exists**, wire a fallback lane:
   ```typescript
   async function embed(text: string) {
     // Try gRPC first (lower latency for batch)
     try {
       return await grpcEmbed(text);
     } catch {
       // Fallback to HTTP (single embeddings)
       return await httpEmbed(text);
     }
   }
   ```

4. **If :50051 doesn't exist**, stick with Ollama HTTP (optimal already).

---

## Windows Native Ollama Specifics

**Ollama on Windows Native** (no Docker):
- Binaries: `C:\Users\<user>\AppData\Local\Programs\Ollama\`
- Models: `C:\Users\<user>\.ollama\models\`
- Can share CUDA GPU directly (no Docker overhead)
- HTTP server :11434 (same as Docker)

**Running native**:
```powershell
# If Ollama Desktop is installed
ollama serve  # Start server in foreground

# Or via WinGet
winget install Ollama
```

**Pros vs Docker**:
- ✅ Slightly less overhead (no container)
- ✅ Direct NVIDIA driver access
- ❌ Not reproducible across machines
- ❌ Harder to manage versions

**Recommendation**: Use Docker (reproducible) OR native (if already installed). Either way, HTTP :11434 is the interface.

---

## Phase 2 Plan: Batching with HTTP

Since gRPC wrapper adds overhead, optimize batching instead:

```typescript
// Batch embedding requests (better than 1-by-1)
async function embedBatch(texts: string[]): Promise<number[][]> {
  // Instead of:
  // for (const text of texts) await embedOne(text)
  
  // Do parallel:
  return Promise.all(texts.map(t => embedOne(t)));
  // Concurrency: 5-10 parallel requests to :11434
}
```

**This is already done** in your Phase B queue consumer (batch processing).

---

## Answer: gRPC Lane for This Setup

**Short answer**: Ollama doesn't expose gRPC natively. HTTP to local Ollama is already optimal (network latency negligible on loopback).

**Options**:
1. ❌ Build gRPC bridge → adds overhead, not worth it
2. ✅ Keep HTTP to Ollama → simple, fast enough
3. ⏳ If :50051 EmbeddingService exists → wire as fallback (optional)

**Recommendation**: Stick with current HTTP setup. Optimize via:
- Batch processing (already done)
- LangGraph orchestration (Phase 2)
- TensorRT quantization (Phase 2, if needed)

---

**Verdict**: No gRPC lane needed for Ollama on Windows Native + Docker. HTTP is optimal.

If you have a separate gRPC embedding service (:50051), can provide Fallback setup.
