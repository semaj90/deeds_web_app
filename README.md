# Deeds Web App

The active web app in this repository lives in `sveltekit-frontend`.

## Docs

- [INSTALL.md](INSTALL.md) explains the fresh-clone install and local startup flow.
- [REQUIREMENTS.md](REQUIREMENTS.md) lists the minimum and recommended machine requirements.
- [CODEBASE_MAP.md](CODEBASE_MAP.md) summarizes the top-level directory layout for repo navigation.
- [sveltekit-frontend/CODEBASE_MAP.md](sveltekit-frontend/CODEBASE_MAP.md) is the deeper application-specific map for the SvelteKit app.
- [ACE Startup & CUDA Bridge Guide](sveltekit-frontend/docs/ACE_STARTUP_CUDA_BRIDGE.md) covers high-performance serialization, native bridge wiring, and service sequencing.
 - [Universal App Readiness Checklist](docs/UNIVERSAL_APP_READINESS_CHECKLIST.md) — product & engineering checklist for releases and audits.

## Fresh Install

### Prerequisites

- Node.js 20 or newer
- npm
- Optional but recommended on Windows: Git for Windows and Docker Desktop with WSL2 enabled

## Audit And Mapping Tools

The repo's audit playbooks assume `rg` is available for fast codebase-wide search.

- `rg` (`ripgrep`) is the default search and wiring-audit tool.
- `awk` and `gawk` are useful for shell-side report slicing; on Windows they usually come from Git for Windows or WSL rather than from this repo.

Verify them in PowerShell with:

```powershell
Get-Command rg
Get-Command awk
Get-Command gawk
```

### Start the app after downloading the repo

```powershell
cd sveltekit-frontend
npm ci
npm run dev
```

The dev server starts on `http://localhost:5173`.

## Important: do not use a production-only install for local development

`npm run dev` depends on packages such as `cross-env` and `vite` being installed locally.

For local development, use:

```powershell
cd sveltekit-frontend
npm ci
```

Do not use these for a fresh local dev setup:

```powershell
npm ci --omit=dev
npm ci --only=production
```

If you do, `npm run dev` will fail on a new machine because required development packages will be missing.

## Services used by the dev script

The default `npm run dev` script points at local services on `127.0.0.1`, including:

- PostgreSQL
- Redis
- Ollama

Some app features may be degraded until those services are running.

## Windows / WSL2 notes

VS Code Remote Development is not required, but it works fine with this repo.

If you use WSL2:

- open the repo in WSL and run `npm ci` and `npm run dev` inside WSL
- avoid mixing a Windows install and a WSL install in the same working tree
- if you use Docker Desktop with WSL2, do not also install a separate Docker Engine inside the WSL distro

## Production

Use the production build/runtime path for deployment. Do not use `npm run dev` in production.
