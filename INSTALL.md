# Install

The active web app in this repository lives in `sveltekit-frontend`.

## Quick Start

### Prerequisites

- Node.js 20 or newer
- npm
- Git

### Recommended audit tools

The repo's wiring and architecture audits assume `rg` is available, and `awk` or `gawk` are useful for shell-side filtering when you are working through larger reports.

- Install `ripgrep` (`rg`) for repo-wide search and path tracing.
- On Windows, `awk` and `gawk` usually come from Git for Windows or WSL.

Verify them in PowerShell with:

```powershell
Get-Command rg
Get-Command awk
Get-Command gawk
```

### Fresh install after cloning

```powershell
cd sveltekit-frontend
npm ci
npm run dev
```

The local dev server starts on `http://localhost:5173`.

## Important

Local development requires a full development install inside `sveltekit-frontend`.

Use:

```powershell
cd sveltekit-frontend
npm ci
```

Do not use these commands for local development:

```powershell
npm ci --omit=dev
npm ci --only=production
```

If you use a production-only install, `npm run dev` can fail because required development packages such as `cross-env` and `vite` will be missing.

## Local Services

The default `npm run dev` script points at these local services:

- PostgreSQL on `127.0.0.1:5432`
- Redis on `127.0.0.1:6379`
- Ollama on `127.0.0.1:11434`

The app can still start without every service running, but some features will be degraded until those services are available.

## Windows / WSL2 Notes

- VS Code Remote Development is optional.
- If you use WSL2, run `npm ci` and `npm run dev` inside WSL.
- Avoid mixing a Windows install and a WSL install in the same working tree.
- If you use Docker Desktop with WSL2, do not install a separate Docker Engine inside the WSL distro.

## Production

`npm run dev` is for local development only.
Use the production build/runtime path for deployment.
