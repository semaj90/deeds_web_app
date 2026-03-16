# deeds_labs/ Archival — Move to Separate GitHub Repo

## Status: TODO
## Priority: Medium
## Created: 2026-03-16
## Updated: 2026-03-16 (Session: Onboarding wizard + dir audit)

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

## Also Pending: src/lib/ Slim Candidates (Dir Audit 2026-03-16)

| Directory | Issue | Action |
|-----------|-------|--------|
| `src/lib/tracking/` | 7 of 8 files dead (only `telemetry.ts` used) | Archive 7 files to deeds_labs/ |
| `src/lib/stores/machines/` | 0 importers (shadows `src/lib/machines/`) | Archive or delete |
| `src/lib/utils/*.mjs` | 92 test/build scripts in $lib (not imported) | Move to `scripts/` or archive |
