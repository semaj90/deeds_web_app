# VS Code Extension Performance Log

**Generated:** 2026-05-28T01:45:52.445Z
**Branch:** `main` | **Dirty files:** 28
**VS Code:** 1.121.0
**Extensions installed:** 55

---

## Summary

| Category | Count |
|---|---|
| Warnings | 16 |
| Info notices | 1 |
| Folder-open tasks | 16 |
| `files.watcherExclude` present | ✅ Yes |
| `search.exclude` present | ✅ Yes |
| Missing from watcherExclude | ✅ None |

---

## Folder-Open Tasks (startup-cost landmines)

| Label | Command |
|---|---|
| 🤖 LangGraph NATS Worker | `npx tsx scripts/agent-worker.ts` |
| Dev Server (GPU, detached) | `node scripts/startup/run-detached.mjs dev:gpu` |
| 🤖 Startup: TRACE MCP Server (:8788) | `node scripts/ensure-mcp-server.mjs --spawn && echo '🤖 TRACE MCP Server :8788 ready'` |
| 🩺 Startup: Service Health Check | `node scripts/startup/run-service-health-check.mjs` |
| 🗺️ Startup: Auto-Map Codebase (graphify:daily) | `node scripts/startup/run-graphify-daily-startup.mjs` |
| 🧠 Startup: ACE Context Pack Smoke | `node scripts/startup/run-ace-context-pack-startup.mjs` |
| 🧠 Startup: ACE Top Retrieval Smoke | `node scripts/startup/run-ace-top-retrieval-startup.mjs` |
| 🧩 Startup: Feature Map Smoke | `node scripts/startup/run-feature-map-startup.mjs` |
| 🚀 Startup: ACE Incremental Refresh (detached, safe) | `npm run startup:ace:detached` |
| 🩺 Startup: Atlas Smoke Gate (16 probes, detached) | `$stamp = 'logs/task-output/.atlas-smoke-last-run'; $cooldownSec = 1800; if ((Test-Path $stamp) -and ` |
| 🔥 Startup: Seed Hit-Demand (chunk_hit_log → Redis, detached) | `$stamp = 'logs/task-output/.hit-demand-last-run'; $cooldownSec = 300; if ((Test-Path $stamp) -and ((` |
| 🧪 Startup: OpenCode Sidecars Smoke (detached) | `$stamp = 'logs/task-output/.opencode-sidecar-smoke-last-run'; $cooldownSec = 900; $portsReady = (Tes` |
| CMake: Auto-Build on Startup | `if (Test-Path '${workspaceFolder}/simd-bridge/cpp/build/Release/tensorrt_bridge.node') { Write-Host ` |
| Extension: Compile on Startup | `npm run compile` |
| 🚀 Start TurboQuant | `npm run turbo:start:detached` |
| 🦉🚀 Hermes Stack: Full (Gateway + Workspace + MCP) | `""` |

---

## Folder Sizes

| Folder | Size |
|---|---|
| `node_modules` | 1835 pkgs |
| `.svelte-kit` | 0 MB |
| `.vite` | — (not found) |
| `dist` | — (not found) |
| `build` | 2462 MB ⚠️ |
| `.tmp` | 178 MB |
| `logs` | 29 MB |
| `coverage` | — (not found) |

---

## Issues

### ⚠️ `folderOpen-task`
**Task "🤖 LangGraph NATS Worker" runs on folder open — startup-cost landmine**

> npx tsx scripts/agent-worker.ts

---

### ⚠️ `folderOpen-task`
**Task "Dev Server (GPU, detached)" runs on folder open — startup-cost landmine**

> node scripts/startup/run-detached.mjs dev:gpu

---

### ⚠️ `folderOpen-task`
**Task "🤖 Startup: TRACE MCP Server (:8788)" runs on folder open — startup-cost landmine**

> node scripts/ensure-mcp-server.mjs --spawn && echo '🤖 TRACE MCP Server :8788 ready'

---

### ⚠️ `folderOpen-task`
**Task "🩺 Startup: Service Health Check" runs on folder open — startup-cost landmine**

> node scripts/startup/run-service-health-check.mjs

---

### ⚠️ `folderOpen-task`
**Task "🗺️ Startup: Auto-Map Codebase (graphify:daily)" runs on folder open — startup-cost landmine**

> node scripts/startup/run-graphify-daily-startup.mjs

---

### ⚠️ `folderOpen-task`
**Task "🧠 Startup: ACE Context Pack Smoke" runs on folder open — startup-cost landmine**

> node scripts/startup/run-ace-context-pack-startup.mjs

---

### ⚠️ `folderOpen-task`
**Task "🧠 Startup: ACE Top Retrieval Smoke" runs on folder open — startup-cost landmine**

> node scripts/startup/run-ace-top-retrieval-startup.mjs

---

### ⚠️ `folderOpen-task`
**Task "🧩 Startup: Feature Map Smoke" runs on folder open — startup-cost landmine**

> node scripts/startup/run-feature-map-startup.mjs

---

### ⚠️ `folderOpen-task`
**Task "🚀 Startup: ACE Incremental Refresh (detached, safe)" runs on folder open — startup-cost landmine**

> npm run startup:ace:detached

---

### ⚠️ `folderOpen-task`
**Task "🩺 Startup: Atlas Smoke Gate (16 probes, detached)" runs on folder open — startup-cost landmine**

> $stamp = 'logs/task-output/.atlas-smoke-last-run'; $cooldownSec = 1800; if ((Test-Path $stamp) -and ((Get-Date) - (Get-Item $stamp).LastWriteTime).TotalSeconds -lt $cooldownSec) { Write-Host ('🩺 atla

---

### ⚠️ `folderOpen-task`
**Task "🔥 Startup: Seed Hit-Demand (chunk_hit_log → Redis, detached)" runs on folder open — startup-cost landmine**

> $stamp = 'logs/task-output/.hit-demand-last-run'; $cooldownSec = 300; if ((Test-Path $stamp) -and ((Get-Date) - (Get-Item $stamp).LastWriteTime).TotalSeconds -lt $cooldownSec) { Write-Host ('🔥 hit-de

---

### ⚠️ `folderOpen-task`
**Task "🧪 Startup: OpenCode Sidecars Smoke (detached)" runs on folder open — startup-cost landmine**

> $stamp = 'logs/task-output/.opencode-sidecar-smoke-last-run'; $cooldownSec = 900; $portsReady = (Test-NetConnection 127.0.0.1 -Port 8791 -InformationLevel Quiet) -and (Test-NetConnection 127.0.0.1 -Po

---

### ⚠️ `folderOpen-task`
**Task "CMake: Auto-Build on Startup" runs on folder open — startup-cost landmine**

> if (Test-Path '${workspaceFolder}/simd-bridge/cpp/build/Release/tensorrt_bridge.node') { Write-Host 'tensorrt_bridge.node already built — skipping' } else { Write-Host 'Building tensorrt_bridge.node..

---

### ⚠️ `folderOpen-task`
**Task "Extension: Compile on Startup" runs on folder open — startup-cost landmine**

> npm run compile

---

### ⚠️ `folderOpen-task`
**Task "🚀 Start TurboQuant" runs on folder open — startup-cost landmine**

> npm run turbo:start:detached

---

### ⚠️ `folderOpen-task`
**Task "🦉🚀 Hermes Stack: Full (Gateway + Workspace + MCP)" runs on folder open — startup-cost landmine**

> ""

---

### ℹ️ `python-envs`
**python-envs.pythonProjects is present in settings.json — can slow down Python env scanning**

> [{"path":".","envManager":"ms-python.python:venv","packageManager":"ms-python.python:pip"}]

---

## Installed Extensions (first 30)

| Extension | Version |
|---|---|
| `antfu.unocss` | 66.6.8 |
| `anthropic.claude-code` | 2.1.118 |
| `christian-kohler.path-intellisense` | 2.10.0 |
| `csstools.postcss` | 1.0.9 |
| `dbaeumer.vscode-eslint` | 3.0.24 |
| `docker.docker` | 0.13.0 |
| `esbenp.prettier-vscode` | 12.4.0 |
| `formulahendry.auto-rename-tag` | 0.1.10 |
| `github.remotehub` | 0.64.0 |
| `github.vscode-github-actions` | 0.31.3 |
| `golang.go` | 0.52.2 |
| `google.colab` | 0.7.5 |
| `llvm-vs-code-extensions.vscode-clangd` | 0.4.0 |
| `ms-azuretools.vscode-containers` | 2.4.1 |
| `ms-edgedevtools.vscode-edge-devtools` | 2.1.10 |
| `ms-playwright.playwright` | 1.1.17 |
| `ms-python.debugpy` | 2025.18.0 |
| `ms-python.python` | 2026.4.0 |
| `ms-python.vscode-python-envs` | 1.26.0 |
| `ms-toolsai.jupyter` | 2025.9.1 |
| `ms-toolsai.jupyter-keymap` | 1.1.2 |
| `ms-toolsai.jupyter-renderers` | 1.3.0 |
| `ms-toolsai.vscode-jupyter-cell-tags` | 0.1.9 |
| `ms-toolsai.vscode-jupyter-slideshow` | 0.1.6 |
| `ms-vscode-remote.remote-containers` | 0.422.1 |
| `ms-vscode-remote.remote-ssh` | 0.120.0 |
| `ms-vscode-remote.remote-ssh-edit` | 0.87.0 |
| `ms-vscode-remote.remote-wsl` | 0.104.3 |
| `ms-vscode-remote.vscode-remote-extensionpack` | 0.26.0 |
| `ms-vscode.cmake-tools` | 1.22.28 |

_…and 25 more extensions._

---

_JSON output: `.tmp/vscode-extension-performance-log.json`_
