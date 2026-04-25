# AI Summarization Integration – Release 8.1.2 (2025-08-12)

Status: PRODUCTION READY

## Components

- GPU-accelerated Go summarizer (HTTP): 8091
- Go cluster service (HTTP): 8090
- Frontend (SvelteKit/Vite): 5173
- Ollama: 11434
- Redis (optional): 6379
- PostgreSQL: 5432
- WebSocket/SSE endpoints mounted in Go service: /ws, /api/events

## Highlights

- Concurrency limiting and 429 backpressure with Retry-After
- L1+L2 caching (in-process TTL + Redis write-through)
- SSE streaming with proxy at /api/ai/summarize/stream
- Health and metrics aggregators; Windows-native launchers

## Quick start

```powershell
# Start SvelteKit dev
npm --prefix sveltekit-frontend run dev

# Build + run summarizer (Windows)
# via VS Code Task: "Summarizer: Run HTTP Service" or:
powershell -ExecutionPolicy Bypass -File scripts/start-summarizer.ps1 -Port 8091 -OllamaBaseUrl http://localhost:11434

# Health checks
curl -s http://localhost:8091/health
curl -s http://localhost:8090/health
```

## Notes

- Vector search route still references a Go service at 8084 for GPU endpoints; summarizer is 8091. Align per use-case.
- Retry-After now forwarded by SvelteKit summarize proxy for client backoff.
