# Embeddings Docker Compose (Ollama + FastEmbed + Postgres + Redis)

This compose file provides a minimal local stack to run embeddings and test Phase43.

Files:
- `docker-compose.embeddings.yml` - brings up Postgres (pgvector), Redis, FastEmbed (placeholder), and an Ollama placeholder.

Notes:
- Replace the `fastembed` service image with a GPU-enabled image if you have one. FastEmbed can be started with `--device cuda`.
- The Ollama desktop app may not expose the HTTP API by default. Run `ollama serve` to expose `http://localhost:11434`.
- Alternatively set the env var `EMBEDDING_GPU_SERVICE_URL` to point Phase43 to a different embedding service (e.g., `http://localhost:8001`).

Quick start:

1. Start core services:

```powershell
docker compose -f docker-compose.embeddings.yml up -d
```

2. (Recommended) Start Ollama server with GPU layers enabled (PowerShell):

```powershell
$env:OLLAMA_GPU_LAYERS='25'
ollama serve
```

Or use the helper script / VS Code task:

```powershell
pwsh -NoProfile -File scripts/start-ollama-gpu.ps1 -GpuLayers 25
```

3. Run Phase43 analyzer (point to the embedding service if required):

```powershell
$env:EMBEDDING_GPU_SERVICE_URL='http://localhost:8001'
node sveltekit-frontend/scripts/phase43-ai-analyzer.mjs <log-file>
```
