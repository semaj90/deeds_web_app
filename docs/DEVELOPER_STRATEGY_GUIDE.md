# Developer Quick Start — Deeds Web App

This file collects the minimal local development prerequisites and quick-start commands used by the team for reproducing CI smoke and running the app locally.

## Prerequisites
- Node.js 20.x
- npm (comes with Node)
- Docker (for running dependent services locally)
- PowerShell (Windows) or Bash (Linux / macOS)

## Required Services (dev ports)
- Ollama: 11434
- Qdrant: 6333
- Postgres: 5432
- Redis: 6379
- SeaweedFS S3 gateway (optional): 8333
- RabbitMQ: 5672 (management 15672)

You can run services via docker-compose or locally if you prefer.

## Quick local dev (Docker compose recommended)
1. Install dependencies

```powershell
cd sveltekit-frontend
npm ci
```

2. Start required infra (example using Docker Compose)

```powershell
# from repo root (if you have docker-compose.yml configured)
# adjust service selection to your environment
docker compose up -d postgres redis qdrant rabbitmq seaweedfs
```

3. Start dev server

```powershell
cd sveltekit-frontend
npm run dev
```

4. Optional: start Ollama (if installed locally)

```powershell
# Ollama binary example (platform-specific)
ollama server start
```

## Running analyzer (dry-run)
The CI runs the analyzer in dry-run mode and uploads `sveltekit-frontend/reports/`.

```powershell
cd sveltekit-frontend
# match CI env
$env:ERROR_BRAIN_ENABLED='true'
$env:ERROR_BRAIN_DRY_RUN='true'
$env:ERROR_BRAIN_APPLY_MODE='off'
$env:ERROR_BRAIN_TRANSPORT='none'
node scripts/batch-merger-fixer-v2.mjs --analyze
```

If the generated report contains `summary.filesAnalyzed: 0`, check analyzer configuration in `scripts/batch-merger-fixer-v2.mjs` and ensure any `paths` or include globs match the repo layout.

## Useful checks
- Health endpoint (dev): `GET http://localhost:5173/api/health`
- Typecheck: `npm run typecheck:native` (tsgo) or `npm run check`
- Tests: `npm run test:run`

## Troubleshooting
- If `npm ci` fails, remove `node_modules` and retry.
- If analyzer produces an empty report, run it with `--verbose` if supported or open `scripts/batch-merger-fixer-v2.mjs` to inspect discovery globs.

---
Add more platform-specific notes here as needed; this is intended to be a minimal onboarding checklist for new devs and CI parity.
