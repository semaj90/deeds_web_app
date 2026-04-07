# Production Hardening — Directory Audit 2026-04-07

> Verdict on every directory and file category in `sveltekit-frontend/`.
> Green = keep as-is | Yellow = keep but clean | Red = delete/archive

---

## ✅ REQUIRED FOR PRODUCTION — Keep Untouched

### Source Code
| Directory | Why Needed |
|---|---|
| `src/routes/api/` | 410 REST endpoints — entire API surface |
| `src/routes/(app)/` | 134 authenticated app pages |
| `src/routes/(dev)/` | Dev routes (exclude in prod build via env flag) |
| `src/routes/login/` | Auth entry point |
| `src/routes/register/` | User registration |
| `src/routes/+layout*` | Root layout, server layout, root page |
| `src/lib/ai/` | E2B client, router, synthesis cache, ONNX pipeline |
| `src/lib/components/` | 609 UI components (audit orphans separately) |
| `src/lib/server/` | All server-side services (auth, db, embed, legal, rag, etc.) |
| `src/lib/db/` | Drizzle ORM + pgvector client |
| `src/lib/stores/` | Svelte stores (auth, cases, evidence, etc.) |
| `src/lib/webgpu/` | WebGPU init (needed for E2B client-side inference) |
| `src/lib/types/` | TypeScript type definitions |
| `src/lib/schemas/` | Zod validation schemas |
| `src/lib/utils/` | Shared utility functions |
| `src/lib/services/` | Client/shared services |
| `src/lib/config/` | App configuration |
| `src/lib/machines/` | XState state machines |
| `src/lib/workers/` | Web workers |
| `src/lib/icons/` | SVG icon components |
| `src/lib/cache/` | Client-side cache utilities |
| `src/lib/features/` | Feature flags |
| `src/lib/shared/` | Cross-boundary shared code |
| `src/lib/shims/` | Polyfills for WASM/ONNX compat |
| `src/lib/gpu/` | GPU compute utilities |
| `src/lib/env/` | Environment validation |
| `src/lib/validation/` | Runtime validation |
| `src/lib/courtroom/` | Courtroom simulation feature |
| `src/hooks.client.ts` | Browser init (WebGPU, E2B warmup) |
| `src/hooks.server.ts` | Server middleware (auth, CORS, rate limit) |
| `src/app.html` | HTML shell |
| `src/app.postcss` | Global styles |
| `src/service-worker.ts` | PWA caching |
| `src/global.d.ts` | Window type augmentations |
| `src/app.d.ts` | App-level type augmentations |

### Build & Config
| File | Why Needed |
|---|---|
| `package.json` | Dependencies |
| `tsconfig.json` | TypeScript config |
| `svelte.config.js` | SvelteKit adapter (Node/static) |
| `vite.config.ts` | Bundler, aliases, WASM, WebGPU plugins |
| `uno.config.ts` | UnoCSS design tokens |
| `drizzle.config.ts` | Database ORM config |
| `postcss.config.js` | CSS processing |
| `eslint.config.js` | Linting rules |
| `.prettierrc` | Code formatting |
| `.npmrc` | Registry config |
| `.env.production` | Prod environment (no secrets committed) |
| `ecosystem.config.js` | PM2 process manager |
| `vitest.config.ts` | Unit test runner |
| `playwright.config.ts` | E2E test config |

### Database / Infra
| Directory/File | Why Needed |
|---|---|
| `drizzle/` | Migration files — CRITICAL, run on deploy |
| `static/` | Public assets (fonts, favicon, images) |
| `docker-compose.full.yml` | Full stack definition |
| `Dockerfile.production` | Production container |
| `Caddyfile.development` | Reverse proxy (or nginx.conf) |
| `security-config.yml` | Security headers config |
| `redis.conf` | Redis configuration |
| `init-db.sql` | Database seed SQL |
| `setup-database.sql` | DB setup scripts |

### Tests
| Directory | Why Needed |
|---|---|
| `tests/e2e/` | Playwright E2E suite (including E2B tests) |
| `tests/global-setup.ts` | Test seeding |
| `tests/global-teardown.ts` | Test cleanup |

### Training Data (keep, don't deploy)
| File | Verdict |
|---|---|
| `training-datasets/` | Keep — needed for fine-tuning |
| `GEMMA3-LEGAL-MEGA-TRAINING.jsonl` | ⚠️ MOVE to `training-datasets/` |
| `GEMMA3-LEGAL-TRAINING-COMPLETE.jsonl` | ⚠️ MOVE to `training-datasets/` |

---

## ⚠️ CONDITIONAL — Keep with Cleanup

### `src/lib/server/` — Suspicious Subdirs
| Subdir | Issue | Action |
|---|---|---|
| `phase72/` | Phase-numbered = dead code | `rg --files` to check if imported → delete if not |
| `phase78/` | Phase-numbered = dead code | Same |
| `chrrom/` | Typo of "chrome" | Check imports → rename or delete |
| `error-brain/` | Unclear purpose | Check if imported anywhere |
| `simulation/` | May be dev-only | Check if any route imports it |
| `pgai/` | pgai integration | Check if pg_ai extension is in use |

### `.bat` Scripts — Mostly Obsolete
| Script | Verdict |
|---|---|
| `start-dev-lowmem.bat` | ✅ Keep — useful dev helper |
| `start-full-quic.bat` | ✅ Keep — QUIC stack launcher |
| `start-docker-dev-stack.bat` | ✅ Keep — Docker startup |
| `start_mcp.bat` | ✅ Keep — MCP server start |
| `run-ace-search.bat` | ✅ Keep — ACE search tool |
| `run-ace-synthesis.bat` | ✅ Keep — ACE synthesis tool |
| `build-gpu.bat` | ✅ Keep — GPU build helper |
| `PHASE72-*.bat` (4 files) | 🗑️ Delete — phase-specific, obsolete |
| `ADD_PHASE74_TEST.bat` | 🗑️ Delete — stale phase test |
| `QUICK-FIX.bat` | 🗑️ Delete — old one-off fix |
| `fix-imports.bat` | 🗑️ Delete — migration artifact |
| `scan-svelte5-issues.bat` | 🗑️ Delete — Svelte 5 migration complete |
| `cleanup-async-backups.bat` | 🗑️ Delete — one-time cleanup done |
| `quic-status.bat` | ✅ Keep — monitoring tool |
| `check-pytorch.bat` | 🗑️ Delete — pytorch not in stack |

### `.py` Scripts — All Migration Artifacts
All 20 `.py` files are from the Svelte 5 migration (Sep-Nov 2025):
`fix-*.py`, `migrate-*.py`, `convert-*.py`, `systematic-*.py` etc.

**Verdict: 🗑️ Delete all** — the migration is complete. Svelte 5 is already running. These can never be safely re-run on the current codebase.

### `.json` — Keep vs Delete
| File | Verdict | Reason |
|---|---|---|
| `mcp.json` | ✅ Keep | MCP server config |
| `mcp-multicore-config.json` | ✅ Keep | MCP multi-core config |
| `redis-monitoring-config.json` | ✅ Keep | Redis monitoring |
| `codebase-index.json` | ✅ Keep | Codebase search index |
| `CMakePresets.json` | ✅ Keep | C++ build config (simd-bridge) |
| `vcpkg.json` | ✅ Keep | C++ deps |
| `PHASE78_MANIFEST.json` | 🗑️ Delete | Stale phase artifact |
| `production-readiness-report.json` | 🗑️ Delete | Old report (superseded) |
| `agentic-demo-report.json` | 🗑️ Delete | One-off demo artifact |
| `svelte-check-*.json` | 🗑️ Delete ALL | Error snapshots, up to 400MB |
| `error-*.json` / `errors-*.json` | 🗑️ Delete ALL | Error analysis dumps |
| `*-report.json` / `*-fix-report.json` | 🗑️ Delete ALL | One-time migration reports |
| `*-analysis-*.json` | 🗑️ Delete ALL | Analysis artifacts |
| `phase*.json` | 🗑️ Delete ALL | Phase automation artifacts |
| `.phase72-plan.json` | 🗑️ Delete | Hidden phase artifact |
| `.phase79-fixes.json` | 🗑️ Delete | Hidden phase artifact |
| `.svelte-check-output.json` | 🗑️ Delete | 2MB check output cache |
| `.eslint-cache.json` | ⚠️ Keep | ESLint speedup cache (gitignore it) |
| `.error-patterns-cache.json` | 🗑️ Delete | Stale cache |

### Binaries in Root
| File | Size | Verdict |
|---|---|---|
| `caddy.exe` | 40MB | ⚠️ MOVE to `tools/` — used for local proxy |
| `simd-8104.exe` | 16MB | ⚠️ MOVE to `../simd-bridge/bin/` |
| `jq.exe` | 3.4MB | ⚠️ MOVE to `tools/` — used by bat scripts |
| `codex-x86_64-pc-windows-msvc.exe` | 62MB | 🗑️ Delete — Codex CLI, not part of stack |
| `go1.25.0.windows-amd64.msi` | 54MB | 🗑️ Delete — installer, use system Go |
| `som-cache.db` | tiny | 🗑️ Delete — SOM cache artifact |
| `dump.rdb` | tiny | 🗑️ Delete — Redis dump artifact |

### Screenshots (`.png`)
| File | Verdict |
|---|---|
| `legalcorpus_gpt318.png` (2.2MB, Mar 2026) | ✅ Keep — recent corpus screenshot, may be docs |
| `screenshot-legal-corpus.png` (Mar 2026) | ✅ Keep — recent |
| `fugitivedx-screenshot.png` (Mar 2026) | ✅ Keep — recent |
| `evidence-upload-*.png` (Feb 2026) | ✅ Keep — recent test evidence |
| All 2025-09 screenshots (fugitivedx-*, debug-*, demo-routes-*) | 🗑️ Delete — >6 months old, debug artifacts |

---

## 🗑️ DELETE — No Production Value Whatsoever

### `.log` files (134 total, ~2GB+)
**Delete all.** Zero production value. These are accumulated dev/build logs:

```
# Safe to delete all of these:
autosolve.log, baseline-before-phase23.log, build-errors.log,
build-output.log, caddy*.log, check-errors.log, check*.log,
dev*.log, error*.log, errors*.log, factory-run.log,
gpu-metrics-debug.log, migration-*.log, output.log,
phase*.log, pipeline-output.log, ssr-errors.log,
svelte-check-*.log, tier3-run.log, tsc*.log, type-errors.log,
vite*.log, worker.log, redis.log, crawl.log, ...
```

### Stale backup files in `src/`
```
src/hooks.server.ts.full                 ← DELETE (stale .full backup)
src/legal-ai-integration.ts.pre-batch-fix ← DELETE (stale .pre-batch-fix backup)
src/endpoints_fetch.txt                  ← DELETE (analysis artifact)
```

### Miscellaneous root garbage
```
NUL                    ← Windows null device artifact
Remove-Item            ← PowerShell command accidentally saved as file
$env/                  ← PowerShell variable artifact
{                      ← JSON fragment accidentally saved
log(`              ← JS fragment accidentally saved
m.name)            ← JS fragment accidentally saved
setTimeout(resolve ← JS fragment accidentally saved
--input            ← CLI arg accidentally saved as file
dy                 ← Unknown 28-byte file
model              ← Empty/unknown
codex              ← Codex CLI stub
npm                ← npm command stub
node               ← Node stub
drizzle-kit        ← drizzle-kit stub
```

---

## 📋 Cleanup Script (Review Before Running)

```powershell
# ── Phase 1: Absolute safe deletes ──────────────────
# Delete all .log files (zero production value)
Get-ChildItem *.log | Remove-Item -Force
Write-Host "Deleted .log files"

# Delete stale src backups
Remove-Item 'src\hooks.server.ts.full' -Force -ErrorAction SilentlyContinue
Remove-Item 'src\legal-ai-integration.ts.pre-batch-fix' -Force -ErrorAction SilentlyContinue
Remove-Item 'src\endpoints_fetch.txt' -Force -ErrorAction SilentlyContinue

# Delete artifact files with no extension
@('NUL','Remove-Item','$env','model','codex','npm','node','dy',
  'drizzle-kit','--input','{','log(`','m.name)','setTimeout(resolve') |
  ForEach-Object { Remove-Item $_ -Force -ErrorAction SilentlyContinue }

# ── Phase 2: JSON report dumps ───────────────────────
Get-ChildItem *.json | Where-Object {
  $_.Name -match 'svelte-check|error|fix-report|migration-report|phase|compliance|analysis|ast-|batch-|pattern|corruption|syntax|comma|colon|arrow|ternary|semicolon|class-spacing|label-revert|leading-|css-|bits-ui|bullmq|zero-percent|async-fix|async-effect|phantom|missing-commas|object-property|function-param|attribute-comma|for-to-html|agentic-demo|production-readiness|component-analysis|redis-mass'
} | Remove-Item -Force
Write-Host "Deleted JSON reports"

# ── Phase 3: All Python migration scripts ────────────
Get-ChildItem *.py | Remove-Item -Force
Write-Host "Deleted migration scripts"

# ── Phase 4: Stale .bat scripts ─────────────────────
@('PHASE72-FULL-HEALING.bat','PHASE72-MULTI-AI-ANALYSIS.bat',
  'PHASE72-DEMO-QUICK.bat','PHASE72-QUICKSTART.bat',
  'ADD_PHASE74_TEST.bat','QUICK-FIX.bat','fix-imports.bat',
  'scan-svelte5-issues.bat','cleanup-async-backups.bat','check-pytorch.bat',
  'build.cmd','check.cmd','dev.cmd') |
  ForEach-Object { Remove-Item $_ -Force -ErrorAction SilentlyContinue }

# ── Phase 5: Binaries ────────────────────────────────
Remove-Item 'codex-x86_64-pc-windows-msvc.exe' -Force -ErrorAction SilentlyContinue
Remove-Item 'go1.25.0.windows-amd64.msi' -Force -ErrorAction SilentlyContinue
Remove-Item 'dump.rdb' -Force -ErrorAction SilentlyContinue
Remove-Item 'som-cache.db' -Force -ErrorAction SilentlyContinue

# Move tools to proper location (create tools/ first)
New-Item -ItemType Directory -Path 'tools' -Force | Out-Null
Move-Item 'caddy.exe' 'tools\caddy.exe' -Force -ErrorAction SilentlyContinue
Move-Item 'jq.exe' 'tools\jq.exe' -Force -ErrorAction SilentlyContinue

# ── Phase 6: Old debug screenshots ───────────────────
@('debug-chat-interface.png','debug-homepage.png',
  'demo-routes-error.png','demo-routes-no-server.png','error-screenshot.png',
  'final-demo-routes.png','fugitivedx-basic.png','fugitivedx-database-test.png',
  'fugitivedx-database-viewport-working.png','fugitivedx-database-viewport.png',
  'fugitivedx-database-working.png','fugitivedx-error-screenshot.png',
  'gaming-components-test.png','homepage-debug.png','homepage-test.png',
  'login-debug.png','playwright-error-screenshot.png','route-all-routes-final.png',
  'step-1-home.png','step-2-register.png','step-3-filled-register.png',
  'working-demo-routes-error.png') |
  ForEach-Object { Remove-Item $_ -Force -ErrorAction SilentlyContinue }

# ── Phase 7: Move training data ─────────────────────
New-Item -ItemType Directory -Path 'training-datasets' -Force | Out-Null
Move-Item 'GEMMA3-LEGAL-MEGA-TRAINING.jsonl' 'training-datasets\' -Force -ErrorAction SilentlyContinue
Move-Item 'GEMMA3-LEGAL-TRAINING-COMPLETE.jsonl' 'training-datasets\' -Force -ErrorAction SilentlyContinue
```

---

## 📈 Estimated Result After Cleanup

| Metric | Before | After |
|---|---|---|
| Root files | 682 | ~80 |
| Root disk usage | ~3GB+ | ~200MB |
| Git repo cleanliness | ❌ Polluted | ✅ Clean |
| Docker image size | Large | Smaller (no copy of junk) |
| Developer onboarding | Confusing | Clear |
