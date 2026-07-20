# Cline Quick Setup — Gemma4 Direct Integration

**TL;DR**: Point Cline directly to llama-server for <50ms latency and full tool-calling support.

## 1. Verify llama-server is running

```bash
curl http://127.0.0.1:8090/v1/models
# Should return: {"data": [...], "object": "list"}
```

## 2. Configure Cline

**Location**: `.cline-config.json` or IDE settings

```json
{
  "model": "gemma4-legal-iq4xs-direct.gguf",
  "baseUrl": "http://127.0.0.1:8090/v1",
  "apiKey": "local-no-auth",
  "streaming": true,
  "tools": true,
  "kvCache": true,
  "kvCacheTtl": 256,
  "temperature": 0.3,
  "maxTokens": 4096
}
```

## 3. Test streaming

```bash
curl -X POST http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma4-legal-iq4xs-direct.gguf",
    "messages": [{"role": "user", "content": "hello"}],
    "stream": true,
    "cache_prompt": true
  }' | head -20
```

## 4. Test tool-calling

```bash
curl -X POST http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma4-legal-iq4xs-direct.gguf",
    "messages": [{"role": "user", "content": "call a tool named get_time"}],
    "stream": false,
    "max_tokens": 128
  }' | jq '.choices[0].message.content'
# Should contain: <tool_call>{"name":"get_time"...}</tool_call>
```

## Performance

| Metric | Direct (:8090) | Via Facade (:5173) |
|--------|------------|------------|
| Latency | <50ms | 250ms |
| KV Cache | Native | Explicit prefill |
| Auth | None | Session |
| Best For | Cline | Multi-user RAG |

**Use direct mode for Cline. Use facade for retrieval orchestration.**

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Connection refused" | Start llama-server: `npm run turbo:start` |
| High latency (>1s) | Check GPU (nvidia-smi), reduce context |
| No tool-calls recognized | Verify model outputs `<tool_call>` format |
| Cache not working | Check `cache_prompt: true` in request |

## Next: Run Evaluation

```bash
# See model comparison (Gemma4 vs HForF)
node scripts/test/evaluation/smoke-test.mjs

# See full evaluation system docs
cat docs/evaluation-system.md
```

## Why Direct?

1. **Latency**: No SvelteKit middleware (45ms vs 250ms)
2. **Tool Calling**: Native format recognized immediately
3. **KV Caching**: Direct TurboQuant prefilling (8-10× speedup)
4. **Simplicity**: No database roundtrips, no auth checks

**Result**: Fast, responsive Cline integration with full capabilities.

---

For detailed docs: see `CONTEXT-STREAMING-SUMMARY.md` and `docs/KV-CACHE-STREAMING-SETUP.md`
