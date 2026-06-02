# Repo Dirty Tree Classification

Generated: 2026-06-02T02:28:29.413Z
Repo: C:\Users\james\Videos\deeds-web-app

## Summary
- Total dirty entries: 774
- Intentional generated artifacts: 630
- Source changes: 143
- Untracked large blobs: 0
- Submodule dirtiness: 1

## Buckets
### intentionalGeneratedArtifacts
- Count: 630
- Sample paths:
  - `opencode/ace-packet-summary.md` (M ) - derived/generated surface
  - `.opencode/ace-packet.json` ( M, 0 GB) - derived/generated surface
  - `.opencode/recommendations/recommendations.json` ( M, 0 GB) - derived/generated surface
  - `.opencode/recommendations/recommendations.md` ( M, 0 GB) - derived/generated surface
  - `.opencode/recommendations/tasks.md` ( M, 0 GB) - derived/generated surface
  - `.opencode/recommendations/tasks.ndjson` ( M, 0 GB) - derived/generated surface
  - `docs/6_1_26` ( M, 0 GB) - defaulted to generated/mirror surface
  - `docs/reports/contract-error-map-report.json` ( M, 0 GB) - derived/generated surface
  - `docs/reports/contract-error-map-report.md` ( M, 0 GB) - derived/generated surface
  - `docs/reports/drizzle-postgres-contract-report.json` ( M, 0 GB) - derived/generated surface

### sourceChanges
- Count: 143
- Sample paths:
  - `.vscode/tasks.json` ( M, 0 GB) - source or active-note surface
  - `IMPLEMENTATION_STATUS.md` ( M, 0 GB) - source or active-note surface
  - `MASTER-FEATURE-TODO-2026-05-20.md` ( M, 0 GB) - source or active-note surface
  - `docs/CODEBASE-FEATURE-MAPPING-2026-05-29.md` ( M, 0 GB) - source or active-note surface
  - `docs/architecture/kanban-parent-atlas-alignment.md` ( M, 0 GB) - active completion note
  - `docs/architecture/offline-synthesis-parent-atlas.md` ( M, 0 GB) - source or active-note surface
  - `docs/graph/contract-error-map.json` ( M, 0 GB) - source or active-note surface
  - `docs/graph/kanban-board.json` ( M, 0 GB) - source or active-note surface
  - `opencode.json` ( M, 0 GB) - source or active-note surface
  - `package.json` ( M, 0 GB) - source or active-note surface

### untrackedLargeBlobs
- Count: 0
- Sample paths:

### submoduleDirtiness
- Count: 1
- Sample paths:
  - `turbovec` ( M, 0 GB) - gitlink modified in working tree

## Notes
- Obsidian-vault mirrors remain derived indexing surfaces, not canonical sources.
- LangExtract summarization should run before archive moves on generated evidence.
- The dirty submodule is `turbovec`; `claude-mem` is a gitlink but not currently dirty.
- Raw rg search dumps should be chunked into parent-atlas packets before archive decisions.