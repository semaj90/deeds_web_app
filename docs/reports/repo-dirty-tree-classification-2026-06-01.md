# Repo Dirty Tree Classification

Generated: 2026-06-17T16:13:46.258Z
Repo: C:\Users\james\Videos\deeds-web-app

## Summary
- Total dirty entries: 18
- Intentional generated artifacts: 11
- Source changes: 5
- Untracked large blobs: 0
- Submodule dirtiness: 2

## Buckets
### intentionalGeneratedArtifacts
- Count: 11
- Sample paths:
  - `claude/worktrees/agent-a38668f2` (M ) - defaulted to generated/mirror surface
  - `.claude/worktrees/agent-a6ea9982` ( M, 0 GB) - defaulted to generated/mirror surface
  - `.claude/worktrees/agent-a7203461` ( M, 0 GB) - defaulted to generated/mirror surface
  - `.claude/worktrees/agent-ae7221f6` ( M, 0 GB) - defaulted to generated/mirror surface
  - `docs/reports/parent-atlas-production-readiness-report.json` ( M, 0 GB) - derived/generated surface
  - `docs/reports/parent-atlas-production-readiness-report.md` ( M, 0 GB) - derived/generated surface
  - `granite-docling-258M` ( M, 0 GB) - defaulted to generated/mirror surface
  - `models/embeddinggemma_300m` ( M, 0 GB) - defaulted to generated/mirror surface
  - `simd-bridge/cpp/binding.cc` ( M, 0 GB) - defaulted to generated/mirror surface
  - `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml` ( M, 0 GB) - defaulted to generated/mirror surface

### sourceChanges
- Count: 5
- Sample paths:
  - `AGENTS.md` ( M, 0 GB) - source or active-note surface
  - `scripts/phase66_automated_error_fixer.py` ( M, 0 GB) - source or active-note surface
  - `scripts/atlas/parent-atlas-doc-indexing.mjs` (??, 0 GB) - source or active-note surface
  - `scripts/atlas/turbovec-gpu-consolidate.mjs` (??, 0 GB) - source or active-note surface
  - `src/lib/server/retrieval/cli.ts` (??, 0 GB) - source or active-note surface

### untrackedLargeBlobs
- Count: 0
- Sample paths:

### submoduleDirtiness
- Count: 2
- Sample paths:
  - `claude-mem` ( M, 0 GB) - gitlink modified in working tree
  - `turbovec` ( M, 0 GB) - gitlink modified in working tree

## Notes
- Obsidian-vault mirrors remain derived indexing surfaces, not canonical sources.
- LangExtract summarization should run before archive moves on generated evidence.
- The dirty submodule is `turbovec`; `claude-mem` is a gitlink but not currently dirty.
- Raw rg search dumps should be chunked into parent-atlas packets before archive decisions.