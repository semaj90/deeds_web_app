# Codebase Directory Map — 2026-04-07

> Generated via `rg` + PowerShell analysis of `sveltekit-frontend/`.
> Use this as the canonical reference for production hardening, dead-code removal, and file organization.

---

## 📊 Summary Statistics

| Category | Count |
|---|---|
| **Total source files** (`src/`) | 2,135 |
| **API endpoints** (`+server.ts`) | 410 |
| **Page routes** (`+page.svelte`) | 134 |
| **Layouts** (`+layout*`) | 17 |
| **Svelte components** (in `src/lib/`) | 564 |
| **Lib TypeScript files** | 721 |
| **ROOT CLUTTER** (`.log`/`.txt`/`.json`/`.bat`/`.py`/`.png`) | **540+** |

---

## 🗂️ Route Structure (`src/routes/` — 702 files)

| Group | Files | Description |
|---|---|---|
| `routes/api/` | **414** | REST API endpoints — bulk of server logic |
| `routes/(app)/` | **266** | Authenticated app pages |
| `routes/(dev)/` | 11 | Dev-only pages |
| `routes/login/` | 3 | Auth flow |
| `routes/register/` | 1 | Registration |
| `routes/minio/` | 1 | MinIO proxy |
| `routes/+layout*` | 3 | Root layouts |
| `routes/+page*` | 2 | Root landing |

### Route Group Detail (from file group counts)

```
src/routes/
├── api/                    414 files  ← REST API (~410 +server.ts endpoints)
│   ├── cases/
│   ├── evidence/
│   ├── ai/
│   ├── embeddings/
│   ├── search/
│   ├── chat/
│   ├── admin/
│   ├── mcp/
│   ├── redis/
│   ├── qdrant/
│   └── ...
├── (app)/                  266 files  ← App pages (auth-gated)
│   ├── dashboard/
│   ├── cases/
│   ├── evidence/
│   ├── admin/
│   ├── demos/
│   ├── chat/
│   └── ...
├── (dev)/                   11 files  ← Dev tooling only
├── login/                    3 files
└── register/                 1 file
```

---

## 📚 Library Structure (`src/lib/` — ~1,400 files)

| Directory | Files | Purpose |
|---|---|---|
| `lib/components/` | **609** | UI Svelte components |
| `lib/server/` | **441** | Server-only services (82 subdirs) |
| `lib/types/` | 50 | TypeScript type definitions |
| `lib/utils/` | 43 | Utility functions |
| `lib/services/` | 35 | Client/shared services |
| `lib/stores/` | 23 | Svelte stores |
| `lib/webgpu/` | 21 | WebGPU init + compute shaders |
| `lib/db/` | 19 | Database clients (Drizzle, pgvector) |
| `lib/gpu/` | 17 | GPU-side utilities |
| `lib/icons/` | 14 | SVG icon components |
| `lib/schemas/` | 13 | Zod validation schemas |
| `lib/ai/` | 12 | **Client-side AI** (E2B, router, cache) |
| `lib/shims/` | 11 | Polyfills / compatibility shims |
| `lib/machines/` | 10 | XState state machines |
| `lib/config/` | 8 | App configuration |
| `lib/features/` | 6 | Feature flags / scoped logic |
| `lib/cache/` | 6 | Client-side caching |
| `lib/client/` | 6 | Browser-side clients |
| `lib/data/` | 5 | Static data / fixtures |
| `lib/workers/` | 4 | Web workers |
| `lib/shared/` | 4 | Cross-boundary shared utilities |
| `lib/courtroom/` | 3 | Courtroom simulation |
| `lib/env/` | 2 | Environment validation |
| `lib/machines/` | 10 | State machines |
| `lib/validation/` | 1 | Runtime validation |

### `lib/server/` Subdirectory Detail (82 subdirs, 441 files)

Key server domains identified:

```
lib/server/
├── ai/                 AI inference routing, LLM adapters
├── auth/               Lucia auth, session management
├── cache/              Redis-backed cache layer
├── cases/              Case management domain
├── chat/               SSE chat, session streaming
├── db/                 Drizzle ORM, connection pools
├── embedding/          Ollama embed, batch embedder
├── evidence/           Evidence ingest + processing
├── inference/          Server-side LLM orchestration
├── legal/              Legal document processing, ingestion-worker
├── mcp/                MCP server integrations
├── minio/              MinIO S3 operations
├── monitoring/         Observability, metrics
├── ocr/                Tesseract OCR pipeline
├── qdrant/             Qdrant vector DB client
├── rag/                RAG pipeline
├── redis/              Redis streams + pub/sub
├── retrieval/          Hybrid search orchestration
├── security/           Rate limiting, sanitization
├── services/           Shared server services
├── tools/              Agentic tool definitions
├── training/           Training data generation
└── validation/         Request validation
```

### `lib/ai/` — Client AI Stack (recently integrated)

```
lib/ai/
├── gemma4-e2b-client.ts    ← NEW: E2B 2.3B WebGPU inference
├── client-llm-synthesis.ts ← NEW: IndexedDB cache orchestrator
├── client-router.ts        ← 4-tier routing (E2B→ONNX→Retrieval→Server)
├── client-cache.ts         ← IndexedDB stores (llmSynthesis v4)
├── client-embed.ts         ← Client-side embedding (Gemma3-270M)
├── client-quality.ts       ← Response quality scoring
├── model-ids.ts            ← Model ID constants (E2B, 270M)
├── citation-cache.ts       ← Citation deduplication cache
├── emotion-context.ts      ← Emotional context detection
├── base64-fp32-quantizer.ts← FP32 quantization utilities
├── ollama-config.ts        ← Ollama client config
└── onnx/                   ← ONNX model pipeline files
```

---

## 🏗️ Source Root Files (`src/` — key files)

```
src/
├── app.html                ← Main HTML shell (WebGPU feature detection)
├── app.d.ts                ← Global type augmentations
├── app.postcss             ← Global styles
├── hooks.client.ts         ← Browser: WebGPU init, E2B warmup
├── hooks.server.ts         ← Server: Auth, CORS, rate limit middleware
├── service-worker.ts       ← PWA service worker (cache strategies)
├── auth-store.svelte.ts    ← Auth Svelte store
├── global.d.ts             ← Window type extensions (__deedsE2BInference)
└── env.d.ts                ← Vite env type declarations
```

> [!WARNING]
> `src/hooks.server.ts.full` (5.5KB), `src/legal-ai-integration.ts.pre-batch-fix` (16KB)
> — STALE BACKUP FILES. Delete before production.

---

## 🚨 Production Hardening — Root Clutter (CRITICAL)

The `sveltekit-frontend/` root contains **540+ junk files** accumulated during development.
These must be cleaned before any production deployment.

### Files by Category

| Type | Count | Total Size | Action |
|---|---|---|---|
| `.log` files | **134** | ~2GB combined | 🗑️ Delete all |
| `.txt` files | **234** | ~1.5GB combined | 🗑️ Delete all (keep README) |
| `.json` report dumps | **98** | ~500MB | 🗑️ Delete (keep package/tsconfig/config) |
| `.png` screenshots | 27 | ~15MB | 🗑️ Delete |
| `.bat` scripts | 23 | ~50KB | ⚠️ Archive or delete |
| `.py` migration scripts | 20 | ~100KB | ⚠️ Archive to `scripts/` |
| `.cmd` scripts | 3 | ~5KB | 🗑️ Delete |
| `.db` SQLite files | 1 | ~5KB | 🗑️ Delete |

### Specific Large Files to Delete

```
# ERROR LOGS (>1MB each, cumulative GB)
error-log.txt           ~190MB ← DELETE
errors-output.txt       ~59MB  ← DELETE
autosolve.log           ~7MB   ← DELETE
check-errors.log        ~8MB   ← DELETE
ssr-errors.log          ~9MB   ← DELETE
error-analysis.txt      ~16MB  ← DELETE
errors-current.log      ~6MB   ← DELETE

# SVELTE CHECK DUMPS
svelte-check-post-phase*.log    ← DELETE ALL
svelte-check-results*.txt       ← DELETE ALL
check_full_phase108_v*.log      ← DELETE ALL

# TSC DUMPS
tsc_after_patch7.txt    ~7MB   ← DELETE
tsc_errors_analysis.txt ~3.6MB ← DELETE

# STALE JSON REPORTS (in root)
error-top1000.json      ~6MB   ← DELETE
ast-scan-report.json    ~376KB ← DELETE
svelte5-compliance-report.json ← DELETE

# BINARIES (should never be in project root)
caddy.exe               ~40MB  ← MOVE to tools/ or delete
codex-x86_64-pc-windows-msvc.exe ~62MB ← DELETE
go1.25.0.windows-amd64.msi ~53MB ← DELETE
jq.exe                  ~3.4MB ← DELETE
simd-8104.exe           ~16MB  ← MOVE to simd-bridge/

# TRAINING DATA (misplaced)
GEMMA3-LEGAL-MEGA-TRAINING.jsonl ~648KB ← MOVE to training-datasets/
GEMMA3-LEGAL-TRAINING-COMPLETE.jsonl   ← MOVE to training-datasets/
```

### Stale Backup Files in `src/`

```
src/hooks.server.ts.full                ← DELETE (stale backup)
src/legal-ai-integration.ts.pre-batch-fix ← DELETE (stale backup)
src/endpoints_fetch.txt                 ← DELETE (analysis artifact)
```

---

## 🔧 Config Files (KEEP — required for build)

```
sveltekit-frontend/
├── package.json           ← Dependencies
├── tsconfig.json          ← TypeScript config
├── svelte.config.js       ← SvelteKit adapter
├── vite.config.ts         ← Vite bundler
├── uno.config.ts          ← UnoCSS
├── drizzle.config.ts      ← Database ORM
├── playwright.config.ts   ← E2E tests
├── vitest.config.ts       ← Unit tests
├── postcss.config.js      ← CSS processing
├── eslint.config.js       ← Linting
├── .prettierrc            ← Formatting
├── .npmrc                 ← Package registry config
├── .env.production        ← Production env (⚠️ never commit secrets)
└── ecosystem.config.js    ← PM2 process manager
```

---

## 🐳 Docker / Deployment Files (ORGANIZE)

```
# KEEP (but consolidate):
Dockerfile.production       ← Primary prod Dockerfile
docker-compose.full.yml     ← Full stack compose
Caddyfile.development       ← Reverse proxy config
nginx.conf                  ← Nginx alternative
security-config.yml         ← Security headers
production-launch-plan.yml  ← Deployment plan

# ARCHIVE (not needed for prod):
Dockerfile.dev              ← Dev-only
Dockerfile.light            ← Lightweight variant
Dockerfile.fastapi          ← FastAPI sidecar
Dockerfile.optimized        ← Old optimized variant
docker-compose.dev.yml      ← Dev compose
docker-compose.light.yml    ← Light compose
```

---

## 📋 Recommended Cleanup Actions

### Phase 1 — Delete (safe, no value)
```powershell
# All .log files in root
Get-ChildItem *.log | Remove-Item

# Error/check txt dumps (>1MB)
Get-ChildItem *.txt | Where-Object {$_.Length -gt 100KB} | Remove-Item

# Phase-numbered report JSONs
Get-ChildItem *.json | Where-Object {$_.Name -match 'phase|error|fix|report|check|svelte'} | Remove-Item

# Debug screenshots
Get-ChildItem *.png | Remove-Item

# Stale scripts
Get-ChildItem *.py, *.bat, *.cmd | Where-Object {$_.Name -notmatch '^(start-|run-)'} | Remove-Item
```

### Phase 2 — Move to `docs_readme/archive/`
```
INFERENCE_ARCHITECTURE.md
YOLO_EVIDENCE_PIPELINE.md
CODEBASE_MAP.md (superseded by this file)
production-readiness-report.json
```

### Phase 3 — Move binaries out of project root
```
caddy.exe           → tools/caddy/
simd-8104.exe       → ../simd-bridge/
jq.exe              → tools/
codex-*.exe         → DELETE
go1.25.0.*.msi      → DELETE (use system Go)
```

### Phase 4 — `.gitignore` additions needed
```gitignore
# Add these to .gitignore:
*.exe
*.msi
*.db-shm
*.db-wal
dump.rdb
caddy.log
caddy-*.log
build-*.log
dev*.log
baseline-*.log
phase*.log
migration-*.log
single_file_errors.log
```

---

## ✅ Production-Ready Directories (no action needed)

| Directory | Status | Notes |
|---|---|---|
| `src/routes/api/` | ✅ | 410 endpoints, well-structured |
| `src/routes/(app)/` | ✅ | 134 pages, auth-gated |
| `src/lib/ai/` | ✅ | E2B + 270M + router all integrated |
| `src/lib/server/` | ✅ | 82 subdirs, domain-organized |
| `src/lib/components/` | ✅ | 609 components (audit for orphans) |
| `tests/e2e/` | ✅ | Playwright suite with 10 E2B tests |
| `drizzle/` | ✅ | Migration files intact |
| `static/` | ✅ | Public assets |
| `scripts/` | ✅ | Utility scripts (organized) |

## ⚠️ Directories Needing Audit

| Directory | Issue |
|---|---|
| `src/lib/components/` | 609 files — likely many orphaned/unused components |
| `src/lib/server/phase72/` | Phase-numbered dir — likely dead code |
| `src/lib/server/phase78/` | Phase-numbered dir — likely dead code |
| `src/lib/server/chrrom/` | Typo dir name (`chrrom` not `chrome`) |
| `src/lib/server/error-brain/` | Unclear ownership — audit needed |
| `src/lib/server/simulation/` | May be unused |
| `src/lib/server/pgai/` | pgai integration — verify if active |
| `tests/` (root) | Mix of vitest + playwright — clarify |
