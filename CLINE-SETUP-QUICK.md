# Cline Setup: KV Cache + Direct Streaming

## Install

```bash
# 1. Get Cline extension (VS Code / Cursor / Windsurf)
# VS Code: ext install saoudrizwan.claude-dev
# Cursor: built-in

# 2. Copy config to your IDE settings
cp .cline-config.json ~/.cline/config.json
```

## Configure (Pick One)

### Option A: Fastest (Direct to llama-server, no RAG)

```json
{
  "model": "gemma4-local",
  "provider": "openai-compatible",
  "baseUrl": "http://127.0.0.1:8090/v1",
  "model": "gemma4-legal-iq4xs-direct.gguf",
  "streaming": true,
  "kvCache": true
}
```

**Latency:** 45ms to first token  
**Use for:** Code questions, debugging, quick answers

### Option B: Full Featured (With RAG + Tools, via facade)

```json
{
  "model": "gemma4-with-rag",
  "baseUrl": "http://127.0.0.1:5173/api/cline/chat",
  "streaming": true,
  "tools": true,
  "kvCache": true
}
```

**Latency:** 250ms to first token  
**Use for:** Research, full context, tool calling

## Verify Setup

```bash
# 1. Check llama-server is running
curl http://127.0.0.1:8090/v1/models

# 2. Check SvelteKit dev server (if using Option B)
curl http://localhost:5173/api/health

# 3. Test streaming
curl -N -X POST http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma4-legal-iq4xs-direct.gguf",
    "messages": [{"role": "user", "content": "hello"}],
    "stream": true,
    "cache_prompt": true
  }' | head -20
```

## Usage in Cline

```
Open Cline Chat → Select model → Type query
↓
(Direct mode: <50ms to first token)
↓
Streaming response in real-time
↓
(Tool mode: can call functions, cache results)
↓
Full conversation history with KV reuse
```

## Performance

| Setting | Latency | Cache Reuse |
|---------|---------|-------------|
| Direct (8090) | ~45ms | ✅ Native TurboQuant |
| Via Facade (5173) | ~250ms | ✅ Explicit prefill |

After 3+ turns, cache hits should give **8-10× speedup** on context tokens.

## Troubleshoot

**"Connection refused :8090"**
```bash
npm run turbo:start
```

**"Connection refused :5173"**
```bash
npm run dev  # Start SvelteKit dev server
```

**Slow streaming (>200ms)**
→ Using Option B (facade). Use Option A for raw speed.

**No cache reuse**
→ Check `cache_prompt: true` in config
→ Check llama-server started with `-cache-prompt -fa on`

## Full Docs

See [KV-CACHE-STREAMING-SETUP.md](docs/KV-CACHE-STREAMING-SETUP.md) for:
- Architecture details
- Tool calling loops
- Cache mechanics
- Monitoring dashboard
- API reference

---

**tl;dr:** Use Option A (direct `:8090`) for speed, Option B (facade `:5173`) for full agent features.
