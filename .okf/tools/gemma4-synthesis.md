---
type: tool
title: Gemma4 Legal Synthesis Model
id: tool/gemma4-synthesis
status: active
owners:
  - legal-ai-team
source_refs:
  - llama-server (TurboQuant quantized)
  - sveltekit-frontend/src/lib/server/ollama.ts
related:
  - pipeline/retrieval-ranking-synthesis
  - system/deep-research
---

# Gemma4 Legal Synthesis Model

## Overview

Gemma4 (`gemma4-legal-iq4xs-direct.gguf`) is the canonical legal synthesis model. It is a thinking model with built-in reasoning for legal domain Q&A. It runs via llama-server at :8090 with TurboQuant quantization (IQ4_XS, 5.3GB VRAM on RTX 3060 Ti).

## Model Specifications

| Property | Value | Notes |
|---|---|---|
| **Base Model** | Google Gemma4 (27B) | Legal-fine-tuned variant |
| **Quantization** | IQ4_XS | Intermediate quantization, ~8.8GB → 5.3GB |
| **Thinking Enabled** | Yes | Reasoning tokens included in generation |
| **Context Window** | 8192 (dynamic, up to 65536 with KV cache) | See KV cache config below |
| **Embedding Dimension** | N/A | Not used for embeddings (use embeddinggemma) |
| **VRAM Required** | 5.3GB | Fits RTX 3060 Ti (8GB) with buffer |
| **Inference Endpoint** | http://127.0.0.1:8090/v1 | OpenAI-compatible API |

## Launching Gemma4

### Via launch script (Recommended)

```powershell
# From sveltekit-frontend/
$env:TURBO_PROFILE = 'turboquant-safe'  # or 'turboquant' after validation
$env:TURBO_CTX = '65536'
$env:LLAMA_SERVER_PATH = 'C:\path\to\llama-server.exe'  # Optional, uses default if unset

npm run turbo:start:detached
```

### Manual llama-server command

```bash
llama-server.exe -m gemma4-legal-iq4xs-direct.gguf \
  -c 65536 \
  -ngl 99 \
  -fa on \
  -ctk q8_0 \
  -ctv q8_0 \
  --cache-prompt \
  --cache-reuse 256 \
  -p "your-optional-port"
```

**Flag Reference**:
- `-c 65536` — Context window size (large for legal documents)
- `-ngl 99` — GPU layers (99 = all layers on GPU, partial offload if needed)
- `-fa on` — Flash Attention (REQUIRED for KV cache quantization)
- `-ctk q8_0` — KV cache type for keys (8-bit, stable baseline)
- `-ctv q8_0` — KV cache type for values (8-bit, stable baseline)
  - Optional upgrade after validation: `-ctv turbo3` (80% compression, 5% accuracy loss, 3–4× context window)
- `--cache-prompt` — Enable KV cache reuse across requests
- `--cache-reuse 256` — Max cached prompts before eviction

## OpenAI-Compatible API

All requests use standard OpenAI chat completion format:

```typescript
POST http://127.0.0.1:8090/v1/chat/completions
{
  "model": "gemma4-legal-iq4xs-direct.gguf",
  "messages": [
    { "role": "system", "content": "You are a legal assistant..." },
    { "role": "user", "content": "Query or context" }
  ],
  "temperature": 0.3,
  "top_p": 0.9,
  "max_tokens": 1024,
  "stream": false,
  "cache_prompt": true,
  "timeout": 90000  // 90s max for thinking + generation
}
```

### Response Format

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1726920547,
  "model": "gemma4-legal-iq4xs-direct.gguf",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Legal answer with reasoning..."
      },
      "finish_reason": "stop"  // or "length" if max_tokens reached
    }
  ],
  "usage": {
    "prompt_tokens": 247,
    "completion_tokens": 512,
    "total_tokens": 759
  }
}
```

## Thinking Model Behavior (Important)

Gemma4 is a thinking model with built-in chain-of-thought reasoning. **This impacts streaming and token budgets**:

1. **Reasoning tokens come first**: When `stream: true`, the thinking block (350–400 tokens) arrives before content tokens
2. **Token budget is consumed by thinking**: If `max_tokens: 256`, thinking alone fills the budget, leaving zero tokens for content
3. **Always use `stream: true` for Gemma4**: Non-streaming blocks on the thinking phase; streaming allows token measurement

**Recommended settings**:
```json
{
  "max_tokens": 1024,    // Reserve 256–400 for thinking, 600–800 for content
  "stream": true,        // REQUIRED
  "temperature": 0.3,    // Low temperature for legal precision
  "top_p": 0.9           // Reduce hallucination
}
```

## Streaming Response Assembly

For thinking models, stream response chunks and accumulate content tokens:

```typescript
const res = await fetch('http://127.0.0.1:8090/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gemma4-legal-iq4xs-direct.gguf',
    messages,
    stream: true,
    max_tokens: 1024,
    temperature: 0.3
  })
});

let assembled = '';
let thinkingBlock = '';
let isThinking = true;

const decoder = new TextDecoder();
let buf = '';

for await (const chunk of res.body) {
  buf += decoder.decode(chunk, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;

    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') break;

    try {
      const parsed = JSON.parse(payload);
      const delta = parsed.choices?.[0]?.delta;

      if (delta?.content) {
        if (delta.content.includes('</thinking>')) {
          isThinking = false;
        }
        if (!isThinking) {
          assembled += delta.content;  // Accumulate non-thinking content
        } else {
          thinkingBlock += delta.content;  // Accumulate thinking
        }
      }
    } catch {
      // Skip malformed SSE lines
    }
  }
}

const finalAnswer = assembled.trim();
```

## Health Check

```bash
curl -s http://127.0.0.1:8090/v1/models | jq '.data[0]'
# Response should include:
# "id": "gemma4-legal-iq4xs-direct.gguf"
# "owned_by": "local"
```

## Deployment Considerations

### For Production (Legal Use)
- Use `-ctk q8_0 -ctv q8_0` (stable, proven)
- Set `temperature: 0.3` (lower is better for legal precision)
- Always use `stream: true`
- Monitor token usage; thinking tokens cost real inference time
- Set timeout ≥ 60s for complex reasoning queries

### For Development
- Use the same settings as production (avoid branch divergence)
- Test with representative legal queries (FRE, UCC, case analysis)
- Validate response quality before tuning hyperparameters

### For GPU Acceleration
- RTX 3060 Ti (8GB): Use `-ngl 99` (full GPU), `-c 65536` (fits with KV cache)
- RTX 3090 (24GB): Use `-ngl 99`, `-c 131072` (max context without OOM)
- CPU-only: Use `-ngl 0`, reduce `-c 8192`, set lower batch size

## Common Issues

| Issue | Diagnosis | Fix |
|---|---|---|
| "input (145 tokens) is too large to process" | `--ubatch-size` is too small | Restart with `--ubatch-size 512` or higher |
| Thinking block never ends | KV cache collision | Restart llama-server (clear session state) |
| VRAM OOM | Model + KV cache + batch too large | Reduce `-c` window size or disable GPU layers (`-ngl 0`) |
| Response is repetitive/stuck | Temperature too high or cache corruption | Reduce temperature to 0.1, restart server |
| Latency >20s per token | GPU not being used | Check `-ngl` flag, verify `nvidia-smi` shows process |

## References

- [llama.cpp README](https://github.com/ggerganov/llama.cpp) — KV cache quantization details
- [Gemma Model Card](https://huggingface.co/google/gemma-7b) — Legal fine-tuning notes
- [TurboQuant Paper](https://arxiv.org/abs/2407.14057) — KV cache compression algorithm
