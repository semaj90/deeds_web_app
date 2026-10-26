# TurboVec Kanban Consolidation Report

Generated: 2026-10-25T09:37:39.581Z
Board tasks: 123
Mass inputs: 6889
Unique records: 6747
Embedded records: 6725
TurboVec backend mix: search-derived=6, unavailable=6719
simdjson parses: 3957958 bytes

## Consolidation groups
- **lib:cluster:0**: 4 records, 4 open, clusters=0, families=lib
  - Consolidate duplicate open work into one parent kanban item and keep the file-level labels as links.
  - top: lib › icons | lib › shims | lib › agent | lib › shared
- **atlas:unclustered:21581e7ba3afc66b**: 1 records, 1 open, clusters=none, families=atlas
  - Single record; no merge action yet.
  - top: atlas › recommendation workflow
- **lib:unclustered:32d9daf1e448236d**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › webgpu
- **search:unclustered:a4be46c8d4babeb9**: 1 records, 1 open, clusters=none, families=search
  - Single record; no merge action yet.
  - top: search › hyperrag
- **auth:unclustered:576c2f7ca9d20b54**: 1 records, 1 open, clusters=none, families=auth
  - Single record; no merge action yet.
  - top: auth › session management
- **analysis:unclustered:8b0737b3543eb4cd**: 1 records, 1 open, clusters=none, families=analysis
  - Single record; no merge action yet.
  - top: analysis › lang extraction
- **lib:unclustered:3c91afb1cc01fa94**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › schemas
- **errors:cluster:0**: 1 records, 1 open, clusters=0, families=errors
  - Single record; no merge action yet.
  - top: errors › error handling
- **lib:unclustered:623bfebbd7db1baf**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › models
- **lib:unclustered:f004aecbaaa256ce**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › stores › svelte › ts
- **workspace:unclustered:172458463e5c9885**: 1 records, 1 open, clusters=none, families=workspace
  - Single record; no merge action yet.
  - top: workspace › sveltekit-frontend
- **lib:unclustered:c88e1f5a473b91bd**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › server
- **lib:unclustered:36b60f350bbc562c**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › components
- **lib:unclustered:c8453cdffc98211e**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › services
- **lib:unclustered:b5b4e7e51868d7ed**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › types
- **lib:unclustered:7bc3ad1aa82b9f4e**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › utils
- **lib:unclustered:82cbd2f9dddb3dff**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › stores
- **workspace:unclustered:68b119e58eae3be2**: 1 records, 1 open, clusters=none, families=workspace
  - Single record; no merge action yet.
  - top: workspace › vscode-extension
- **lib:unclustered:03aca664d2c48536**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › machines
- **lib:unclustered:413adffa6409e5d5**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › workers
- **lib:unclustered:3750c7ba0f95ca5d**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › client
- **lib:unclustered:e45cf50d5400b97b**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › config
- **workspace:cluster:0**: 1 records, 1 open, clusters=0, families=workspace
  - Single record; no merge action yet.
  - top: workspace › simd-bridge
- **lib:unclustered:0f7535e57367fde4**: 1 records, 1 open, clusters=none, families=lib
  - Single record; no merge action yet.
  - top: lib › data

## Suggested board actions
- Merge the highest-overlap open groups into one parent kanban item per feature family.
- Keep file-level feature labels as provenance links, not separate board cards.
- Use the board TurboVec annotations as a routing hint for consolidation reviews.
- Review the top open groups first; they are the best candidates for parent-atlas compression.

## Notes
- TurboVec is used as a prefilter and grouping aid, not as the source of truth.
- Open tasks remain anchored in the kanban board and the master todo.
- simdjson is used to batch-parse large JSON and JSONL inputs before scoring.
