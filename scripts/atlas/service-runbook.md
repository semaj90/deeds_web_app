Service runbook — start & validate vector/embedding sidecars

Purpose

Bring up and validate the local services required for indexing: Qdrant (6333), Ollama (11434), SeaweedFS/MinIO (S3 gateway), and the embedding sidecar (engram-embed or equivalent). Includes Docker and native checks, logs, and quick troubleshooting steps.

General advice

- Do not edit repo `.env` files. Export environment variables in-shell when needed.
- Run the checks from the repo root (`C:\Users\james\Videos\deeds-web-app`).
- Use the existing Docker Compose if available (likely named services in `docker/` or `docker-compose.yml`).

1) Quick status checks

PowerShell commands to verify ports:

```powershell
# TCP checks
Test-NetConnection -ComputerName localhost -Port 6333   # Qdrant
Test-NetConnection -ComputerName localhost -Port 11434  # Ollama
Test-NetConnection -ComputerName localhost -Port 8333   # SeaweedFS S3
Test-NetConnection -ComputerName localhost -Port 8382   # SeaweedFS Filer UI
```

HTTP checks (use Invoke-RestMethod or curl):

```powershell
# Qdrant
Invoke-RestMethod -Uri 'http://127.0.0.1:6333/' -Method Get -ErrorAction Stop
# Ollama
Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -Method Get -ErrorAction Stop
# SeaweedFS master status
Invoke-RestMethod -Uri 'http://127.0.0.1:9333/cluster/status' -Method Get -ErrorAction Stop
# Embedding sidecar (example)
Invoke-RestMethod -Uri 'http://127.0.0.1:3005/health' -Method Get -ErrorAction SilentlyContinue
```

2) Start services via Docker Compose (preferred)

If you have a compose file provided by the repo, run it from the repo root. Example:

```powershell
# Start containers in detached mode
docker compose up -d qdrant ollama seaweedfs engram-embed

# If the compose file uses different service names, run 'docker compose ps' to inspect
docker compose ps
```

After starting, follow logs to watch for readiness:

```powershell
# Follow logs (Windows PowerShell)
docker compose logs -f qdrant
docker compose logs -f ollama
docker compose logs -f seaweedfs
docker compose logs -f engram-embed
```

3) Start/validate Qdrant

If Qdrant is a container named `qdrant`:

```powershell
# Check basic HTTP root
Invoke-RestMethod -Uri 'http://127.0.0.1:6333/'

# If Qdrant is not running, start container
docker compose up -d qdrant
# Or run standalone:
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant:v1.2.0
```

Common issues:
- Port already in use — pick a free host port or stop the conflicting service.
- Data-dir permissions — bind mount must be writable by container.

4) Start/validate Ollama (local model server)

Ollama is usually started with `ollama serve` or via a container. On Windows, ensure Ollama is installed and accessible in PATH.

```powershell
# Start Ollama (if installed)
ollama serve  # runs on 11434 by default

# Verify
Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags'
```

If the server fails to start (exit code 1), inspect `ollama` stdout/stderr for model loading errors or missing files. Common fixes: ensure model files exist, sufficient GPU memory, or start with CPU-only mode.

5) Start/validate SeaweedFS (S3 gateway) or MinIO

If the project uses SeaweedFS, start the Seaweed containers (master, volume, filer, s3). Example via compose:

```powershell
docker compose up -d seaweed-master seaweed-volume seaweed-filer seaweed-s3
# Verify master
Invoke-RestMethod -Uri 'http://127.0.0.1:9333/cluster/status'
```

If MinIO is used instead, ensure the access key/secret match the env passed to services.

6) Start/validate embedding sidecar (engram-embed)

The embedding sidecar often provides `/embed` or `/health` endpoints. Use the repo's service name or `scripts/dev` helper.

```powershell
# Example endpoint checks
Invoke-RestMethod -Uri 'http://127.0.0.1:3005/health'
Invoke-RestMethod -Uri 'http://127.0.0.1:3005/embed' -Method Post -Body (@{text='test'} | ConvertTo-Json)
```

If the sidecar returns 404, inspect its expected route (open its README or source) — the path may be different (e.g., `/api/embed` or `/v1/embeddings`).

7) Logs and debugging

- Use `docker compose logs -f <service>` to stream logs.
- For standalone services, run them in the foreground to see errors.
- Common causes of failure: missing env vars (DB credentials, model paths), insufficient GPU memory, port collisions, and filesystem permission errors.

8) Verification summary (example commands)

```powershell
# Quick health probes
Invoke-RestMethod -Uri 'http://127.0.0.1:6333/'
Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags'
Invoke-RestMethod -Uri 'http://127.0.0.1:9333/cluster/status'
Invoke-RestMethod -Uri 'http://127.0.0.1:3005/health'
```

9) Next steps after services are healthy

- Run the Qdrant indexer (I'll prepare the `index-to-qdrant.mjs` helper next if you want).
- Or run the loader script to persist profiles to Postgres if DB is ready.
