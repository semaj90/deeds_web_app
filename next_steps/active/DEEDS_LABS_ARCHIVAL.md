# deeds_labs/ Archival — Move to Separate GitHub Repo

## Status: TODO
## Priority: Medium
## Created: 2026-03-16
## Updated: 2026-03-16 (Session: deeds_labs cleanup + orphan wiring)

---

## Problem

`deeds_labs/` is **gitignored** — all archived files are effectively invisible to version control.
If the local disk is lost, all archive history disappears. Currently contains:

- **30+ archived `src/lib/` directories** (middleware, orchestration, moogle, etc.)
- **17,900+ archived files** across 35+ root dirs
- **610+ .md files** (documentation, specs, analysis)
- **Corrupted service files** (312 from `src/lib/services/`)
- **Svelte 4 archive** (pre-migration components)
- **Dead microservices** (Python, Go, Docker configs)
- **Phase 99 corrupted files** (83 .svelte files from commit 0a2bd98929)
- **phantom-code-lab/**: markdown-pipeline.ts, webgpu-cuda-bridge.ts (archived this session)

## Solution

1. **Create `semaj90/deeds-labs` GitHub repo** (private)
2. **Initialize git in `deeds_labs/`** and push all contents
3. **Add README.md** explaining the archive structure
4. **Add `.gitignore`** for build artifacts, node_modules, etc.
5. **Update main repo CLAUDE.md** with link to archive repo

## Directory Structure (deeds_labs/)

```
deeds_labs/
├── lib-dead-directories/    # 30+ archived src/lib/ dirs
├── svelte4-archive/         # Pre-Svelte 5 components
├── corrupted-services/      # 312 corrupted service files
├── dead-microservices/      # Python/Go/Docker dead code
├── phase99-corrupted/       # 83 corrupted .svelte files
└── docs-archive/            # Archived documentation
```

## Why This Matters

- **Disaster recovery**: If local drive fails, archive is lost forever
- **Team onboarding**: New devs can see evolution of the codebase
- **Corruption reference**: Phase 99 corrupted files serve as detection patterns
- **Code archaeology**: Some archived code may be useful for future features

## Steps

```bash
cd deeds_labs/
git init
git add .
git commit -m "Initial archive: 17,900+ files from deeds-web-app cleanup sessions"
gh repo create semaj90/deeds-labs --private --source=. --push
```

---

## Cleanup Completed (2026-03-16)

**~12.6GB freed from deeds_labs/:**

| Target | Size Freed | Action |
|--------|-----------|--------|
| `snapshots/2026-03-10/bucket-a-generated/` | 4.3GB | Deleted (auto-generated code) |
| `frontend/.../dirs/logs/` | ~3.3GB | Kept 4 sample files |
| `frontend/.../dirs/reports/` | ~4.3GB | Emptied (all entries were directories) |
| `frontend/.../dirs/phase72_logs/` | 284MB | Deleted |
| `projects/evidence-service/node_modules/` | 341MB | Deleted |
| `projects/legacy-projects/.../node_modules/` | 133MB | Deleted |

**Tarball compression estimates (for GitHub push sizing):**
- `services/` (source code): 667MB raw → 304MB gzip (2.2x compression)
- Small dirs (docs, configs): 19MB raw → 1.5MB gzip (12.7x compression)
- Full deeds_labs (~21GB after cleanup) → estimated 3-7GB tarball
- GitHub soft limit: 5GB — may need to split or use Git LFS for large dirs

---

## Also Pending: src/lib/ Slim Candidates (Dir Audit 2026-03-16)

| Directory | Issue | Action |
|-----------|-------|--------|
| `src/lib/tracking/` | 7 of 8 files dead (only `telemetry.ts` used) | Archive 7 files to deeds_labs/ |
| `src/lib/stores/machines/` | 0 importers (shadows `src/lib/machines/`) | Archive or delete |
| `src/lib/utils/*.mjs` | 92 test/build scripts in $lib (not imported) | Move to `scripts/` or archive |

---

## Orphan Files Archived (2026-03-16)

**Moved to `deeds_labs/lib-dead-directories/batch-2026-03-16-orphans/`:**
- `messaging/`: rabbitmq-integration.js (5 syntax errors), rabbitmq-legal-queue.ts (missing NES dep)
- `state/`: 2x bullmq backups, 2x .code-workspace, xstate-detective-mode.js
- `agents/__tests__/` (empty)
- `client/`: securityOrchestrator.ts, webgpuWorker.ts (placeholder)
- `actions/`: draggable.ts (Svelte 4)
- `components/`: UploadArea.svelte.d.ts (no impl), NesModal.svelte, SimilarCasesPanel.svelte, SummaryEditor.svelte (all 3 duplicates of subdirectory versions)

---

## Missing API Route Stubs (Backlog)

**Created as stubs (2026-03-16)** — return empty results, need real DB/Qdrant wiring:
- `/api/search/cases` (GET) — stub created
- `/api/search/laws` (GET) — stub created
- `/api/search/suggestions` (GET) — stub created
- `/api/search/filters` (GET) — stub created
- `/api/analytics/search` (POST) — stub created

**Still missing:**
- `/api/workflow-events` — referenced by `src/lib/client/workflow-event-stream.ts`

**Audit lesson**: Glob patterns treat `[id]` as character class, not literal dir name.
`/cases/[id]/board/` was falsely flagged as missing because `**/cases/[id]/board/**`
matched zero files. Always verify dynamic route segments with `ls` or `find`.

---

## Type Safety Audit (Backlog)

- **Zod validation**: 118/258 API routes (46%) have validation — 140 remaining
- **Auth guards**: ~30/258 routes check `locals.user` — ~228 unguarded
- **src/lib/services/**: 312 corrupted files blanket-excluded from tsconfig
- **Drizzle 0.44 + Svelte 5 runes**: Full type review deferred
