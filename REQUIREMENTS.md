# Requirements

The active application in this repository is the SvelteKit app under `sveltekit-frontend`.

## Minimum Requirements

These are the minimum requirements to install dependencies and start the local dev server:

- Node.js 20 or newer
- npm
- Git

## Recommended on Windows

For a smoother Windows setup, the recommended environment is:

- Windows with WSL2 available
- Git for Windows or a WSL shell with GNU userland tools available
- Docker Desktop with the WSL2 backend enabled

These are recommended, not required, for a basic `npm run dev` startup.

## Local Service Requirements For Full Features

The default development script expects these services at the following addresses:

- PostgreSQL at `127.0.0.1:5432`
- Redis at `127.0.0.1:6379`
- Ollama at `127.0.0.1:11434`

Without these services, the frontend can still start, but features that depend on the database, cache, or model runtime may be limited or unavailable.

## Optional Tooling

These tools are useful for broader workflows in the repo but are not required just to start the frontend:

- ripgrep (`rg`) for repo-wide audit and wiring searches
- `awk` or `gawk` for shell-side filtering of large reports and search output
- Docker Desktop for local service orchestration
- PowerShell for repo scripts ending in `.ps1`
- Go for the retrieval service and related tooling
- NVIDIA GPU support for GPU-specific development flows

Quick PowerShell verification:

```powershell
Get-Command rg
Get-Command awk
Get-Command gawk
```

## Dependency Install Requirement

For local development, install all dependencies in `sveltekit-frontend`:

```powershell
cd sveltekit-frontend
npm ci
```

Do not use a production-only install for local development:

```powershell
npm ci --omit=dev
npm ci --only=production
```

The development workflow depends on packages that are not available in a production-only install.
