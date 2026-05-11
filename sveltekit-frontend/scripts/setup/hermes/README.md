# Hermes Desktop + Ollama setup (enhanced)

Operator-facing installer for the Hermes Agent local stack. Adapted from the
Nous Research upstream `irm` one-shot with five enhancements (2026-05-11):

| Enhancement | What it does |
|---|---|
| `-SafeMode` | Bundles `-AutoSelectModels -SkipModelPull -SkipEmbeddingPull -SkipContextAlias` — first-run no-pull mode |
| `-ConfigureMcp` + `-TraceMcpUrl` | Writes `~/.hermes/mcp.json` so Hermes' MCP client connects to the local TRACE :8788 with the read-only allowlist from `docs/architecture/hermes-agent-windows-gemma4-guide.md` |
| Pre-flight checks (`Invoke-Preflight`) | Windows build version, free disk GB, Docker on PATH when `-Include*` switches need it, hermes CLI when `-IncludeHermesWorkspace` |
| TRACE MCP health probe | Added to `Write-HealthSummary` — surfaces up/down state of port 8788 |
| Machine-parsable JSON summary | `[setup-hermes] summary={...}` line at end + `setup-hermes-summary.json` written to `$DownloadDir` |

## Recommended first-run commands

### Conservative (no model pulls, no Docker)

```powershell
.\setup-hermes-desktop-ollama.ps1 -SafeMode
```

Installs Hermes Desktop, Ollama, sets persistent env vars
(FlashAttention + q8_0 KV + 64K context), starts Ollama, auto-picks
already-installed models. No Docker, no Workspace, no shortcuts.

### Conservative + Hermes Agent MCP wired to the regen pipeline

```powershell
.\setup-hermes-desktop-ollama.ps1 -SafeMode -ConfigureMcp
```

Adds the read-only TRACE MCP config so a freshly-installed Hermes Agent
sees `trace.kag_search`, `db.schema_overview`, `kb.hybrid_search`, etc.
on first run.

### Full stack (operator-confirmed; long install)

```powershell
.\setup-hermes-desktop-ollama.ps1 -LaunchHermesDesktop `
    -IncludeLocalDeepResearch -IncludeHermesWorkspace -IncludeRedis `
    -CreateDesktopShortcuts -LaunchBrowser `
    -AutoSelectModels -ConfigureMcp
```

Adds: LDR + SearXNG + Redis (Docker), Hermes Workspace (clones + pnpm
dev :3000), desktop shortcuts, browser auto-open. **Expect 10-30+ min
on a fresh box.**

## What gets persisted

- **Windows User env vars**: `OLLAMA_FLASH_ATTENTION=1`,
  `OLLAMA_KV_CACHE_TYPE=q8_0`, `OLLAMA_CONTEXT_LENGTH=65536`,
  `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_KEEP_ALIVE=30m`. These affect every
  future Ollama session, not just Hermes.
- **`~/.hermes/.env`**: `API_SERVER_ENABLED=true` (only when Workspace
  starts the gateway).
- **`~/.hermes/mcp.json`**: TRACE MCP allowlist (only with `-ConfigureMcp`).
- **`$DownloadDir`**: installers, Modelfiles, compose files, summary.json.
- **Desktop shortcuts** (only with `-CreateDesktopShortcuts`).

## Background services left running

| Service | Port | Started when |
|---|---|---|
| Ollama serve | 11434 | always |
| Hermes Desktop GUI | n/a | `-LaunchHermesDesktop` |
| Local Deep Research | 5000 | `-IncludeLocalDeepResearch` |
| SearXNG | 8080 | `-IncludeLocalDeepResearch` |
| Redis Stack | 6379 / 8001 | `-IncludeRedis` |
| Hermes Workspace (pnpm dev) | 3000 | `-IncludeHermesWorkspace` |
| Hermes Gateway | 8642 | Workspace + `hermes` CLI present |
| Hermes Dashboard | 9119 | Workspace + `hermes` CLI present |

Each starts in a minimized PowerShell window. Killing the window stops
the service.

## Cleanup / undo

```powershell
# Stop Ollama
Stop-Process -Name ollama -Force

# Stop Docker services
docker compose -f "$env:USERPROFILE\Downloads\Hermes-Ollama\local-deep-research-docker-desktop\docker-compose.yml" down

# Remove Hermes Desktop (uninstaller)
# Settings → Apps → "Hermes Desktop" → Uninstall

# Unset Ollama env vars
[Environment]::SetEnvironmentVariable("OLLAMA_FLASH_ATTENTION", $null, "User")
[Environment]::SetEnvironmentVariable("OLLAMA_KV_CACHE_TYPE", $null, "User")
[Environment]::SetEnvironmentVariable("OLLAMA_CONTEXT_LENGTH", $null, "User")
[Environment]::SetEnvironmentVariable("OLLAMA_NUM_PARALLEL", $null, "User")
[Environment]::SetEnvironmentVariable("OLLAMA_KEEP_ALIVE", $null, "User")

# Delete Hermes config
Remove-Item -Recurse -Force "$env:USERPROFILE\.hermes"
```

## Cross-references

- Upstream: from `irm https://raw.githubusercontent.com/NousResearch/...`
- Phase A handoff brief: `docs/handoffs/2026-05-11_hermes-handoff-p1-4-drizzle-drift.md`
- Hermes install guide: `docs/architecture/hermes-agent-windows-gemma4-guide.md`
- TRACE MCP allowlist source: same guide, §"Wiring Hermes to TRACE MCP"
