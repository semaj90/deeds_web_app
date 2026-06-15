# Bifrost + Gemma4 — Actual Architecture (NOT Rotorquant)

## Critical Finding: You're NOT Using `gemma4-rotorquant:latest`

**You have TWO separate Gemma4 artifacts:**

### 1. Ollama Running (Currently Active)
```
Ollama :11434
  └─ gemma4-rotorquant:latest (5.1GB)
     └─ Deployed via: ollama pull gemma4-rotorquant:latest
     └─ Used by: bifrostChat() → Bifrost (:3040) → Ollama fallback
```

### 2. Local GGUF File (On Disk, Not Loaded)
```
models/gemma4-legal-iq4xs-direct.gguf (4.8GB, IQ4_XS quantization)
  └─ Status: LOCAL, on disk, never loaded into llama-server
  └─ Intended for: direct llama-server.exe loading (if TurboQuant were active)
  └─ Used by: some local inference paths (cross-encoder-reranker, atlas-search)
```

### 3. TurboQuant (Configured But NOT Running)
```
Expected: llama-server.exe :8090 (loads models/gemma4-legal-iq4xs-direct.gguf)
Actual:   NOT RUNNING — port 8090 is free
Fallback: bifrostChat() automatically routes to Ollama :11434 instead
```

---

## Current Routing Chain (What Actually Happens)

```
User Query
  ↓
bifrostChat(messages, model, options)  [src/lib/server/ollama.ts:780]
  ├─ Check: is TurboQuant healthy? (isTurboQuantHealthy @ :8090)
  │  └─ RESULT: No response → TurboQuant not running
  │
  ├─ FALLBACK: Route to Bifrost (:3040/v1)
  │  └─ Bifrost model: ollama/gemma4-rotorquant:latest (normalized)
  │
  ├─ Bifrost L1 (Redis exact-match)
  │  └─ RESULT: Check cache for SHA-256(model + messages + params)
  │
  ├─ Bifrost L2 (Qdrant semantic)
  │  └─ RESULT: Vector similarity search (threshold 0.82)
  │
  └─ Bifrost L3 (Cold inference)
     └─ ROUTE: bifrost-gateway → Ollama :11434
     └─ MODEL: gemma4-rotorquant:latest (the actual Ollama model)
     └─ LATENCY: ~25 seconds (cold), ~5ms (L1 hit), ~2-5s (L2 hit)
```

---

## The Mismatch Explained

Your code references THREE different model identifiers:

| Identifier | What It Is | Where It's Used | Status |
|---|---|---|---|
| `gemma4-rotorquant:latest` | Ollama model (pulled via `ollama pull`) | bifrostChat(), Bifrost config, ENV | **ACTIVE** |
| `gemma4-legal-iq4xs-direct.gguf` | Local GGUF quantization | ollama.ts fallback logic, some routes | **ON DISK, NOT LOADED** |
| `turboquant/gemma4-legal.gguf` | TurboQuant model (legacy naming) | Docs, some service files | **LEGACY, NOT USED** |

**The confusion:** You have a local GGUF file but Bifrost (and most of your code) is configured to use the Ollama-pulled model instead.

---

## Why Bifrost Still Works

Even though you're not using the local GGUF, Bifrost works fine because:

1. **Bifrost is model-agnostic** — it caches responses by model name + messages + params
2. **It routes to whatever you tell it** — you tell it to use `ollama/gemma4-rotorquant:latest`
3. **Ollama has that model loaded** — `ollama/gemma4-rotorquant:latest` is currently running
4. **L1/L2 cache still works** — 4-hour TTL on exact-match and semantic hits

So Bifrost is **working correctly** with your **actual running model** (Ollama's gemma4-rotorquant).

---

## Options for Atlas Summarization

### Option A: Use Ollama Model (Current, Recommended)
```typescript
const summary = await bifrostChat(
  [{ role: 'user', content: `Summarize:\n${code}` }],
  'gemma4-rotorquant:latest',  // Ollama model, already running
  {
    cacheKey: `atlas:dir:${directory}`,
    temperature: 0.3,
    maxTokens: 200,
  }
);
```

**Pros:**
- Model already pulled and running
- Bifrost caching works out of box
- 4-hour TTL on cache
- Fallback to Ollama if Bifrost fails

**Cons:**
- Latency: ~25s cold (Ollama inference)
- If Ollama overloaded, slower than local GGUF would be

### Option B: Use Local GGUF (Requires TurboQuant)
```typescript
// Requires: llama-server.exe running with models/gemma4-legal-iq4xs-direct.gguf
const summary = await bifrostChat(
  [{ role: 'user', content: `Summarize:\n${code}` }],
  'gemma4-legal-iq4xs-direct.gguf',  // Local GGUF
  {
    cacheKey: `atlas:dir:${directory}`,
    temperature: 0.3,
    maxTokens: 200,
  }
);
```

**Pros:**
- Direct GGUF load = no Ollama overhead
- Faster inference (~3-5s)
- More control over quantization (IQ4_XS)
- Can use TurboQuant KV cache optimizations

**Cons:**
- Requires separate llama-server.exe process
- Requires TurboQuant binary (not stock llama.cpp)
- Must be manually started/monitored
- Bifrost would NOT know about this model (different endpoint)

---

## Decision: For Atlas Summarization

**Recommendation: Stick with Option A (Ollama gemma4-rotorquant:latest)**

**Reasons:**
1. ✅ Model already running and proven stable
2. ✅ Bifrost caching already wired
3. ✅ No additional infrastructure (no TurboQuant binary needed)
4. ✅ Fallback chain works (Bifrost → Ollama)
5. ✅ L1/L2 cache gives 60-80% hit rate on repeated startups
6. ⚠️ Local GGUF requires TurboQuant setup (separate work)

**Modified integration guide:**

```typescript
// sveltekit-frontend/src/lib/server/atlas/bifrost-summary-worker.ts
import { bifrostChat } from '$lib/server/ollama.js';

export async function summarizePacketViaBifrost(packet: PacketToSummarize) {
  const prompt = `Summarize this file in 1-2 sentences:
  - Core responsibility
  - Key exports (types, functions)
  - Key dependencies

File: ${packet.filePath}

\`\`\`typescript
${packet.fileContent}
\`\`\`

Respond with ONLY the summary.`;

  // Use Ollama model (currently running via Bifrost)
  const dir = packet.sourceRef.split('/').slice(0, -1).join('/');
  const summary = await bifrostChat(
    [{ role: 'user', content: prompt }],
    'gemma4-rotorquant:latest',  // Ollama model (Bifrost knows about it)
    {
      cacheKey: `atlas:dir:${dir}`,
      temperature: 0.3,
      maxTokens: 200,
    }
  );

  return summary;
}
```

---

## To Use the Local GGUF Instead (Future)

If you want to switch to the local GGUF file:

1. **Start TurboQuant with the GGUF:**
   ```powershell
   $env:TURBO_PROFILE = 'stock'
   npm run turbo:start:detached
   ```
   This loads `models/gemma4-legal-iq4xs-direct.gguf` into llama-server :8090

2. **Update code to use the GGUF:**
   ```typescript
   const summary = await bifrostChat(
     messages,
     'gemma4-legal-iq4xs-direct.gguf',  // Local GGUF
     { cacheKey: 'atlas:dir:...' }
   );
   ```

3. **Note:** Bifrost won't cache this model (it's not in Bifrost's known model list)
   - But bifrostChat() will still work — it falls back to direct inference
   - You'd lose Bifrost's L1/L2 cache for this model

4. **Alternative:** Point Bifrost at TurboQuant instead of Ollama
   ```typescript
   // env.server.ts
   BIFROST_OPENAI_BASE_URL: 'http://127.0.0.1:8090/v1'  // TurboQuant instead of :3040
   ```
   But this would require changing Bifrost config (not currently wired)

---

## Summary: What You Actually Have

| Component | Model | Status | Used By |
|---|---|---|---|
| **Ollama** | gemma4-rotorquant:latest (5.1GB) | ✅ RUNNING | Bifrost L3, fallback path |
| **Bifrost** | ollama/gemma4-rotorquant:latest | ✅ CACHED | bifrostChat() L1/L2/L3 |
| **Local GGUF** | gemma4-legal-iq4xs-direct.gguf (4.8GB) | ⏸️ ON DISK | Fallback paths (not loaded) |
| **TurboQuant** | llama-server :8090 | ⏸️ NOT RUNNING | Would be interceptor for :8090 |

**For Atlas summarization:** Use Bifrost + Ollama (Option A). It's already working and cached.

