## ADDED Requirements

### Requirement: Deep-audit gate dispatch table SHALL match the live indexer schema
The `/deep-audit` skill's gate dispatch table (documented in root `CLAUDE.md`) SHALL only reference fields that actually exist on `sveltekit-frontend/docs/graph/codebase-graph.json`'s per-file objects. A dispatch entry referencing a nonexistent field (e.g. `f.parsesBody` for G5) SHALL be corrected to match the indexer's real emitted schema before that gate's fail count is used to drive fixes.

#### Scenario: G5 dispatch field exists on indexed file objects
- **WHEN** the deep-audit skill evaluates gate G5 (Zod on body-parsing routes) against a file object from `codebase-graph.json`
- **THEN** every field it reads (e.g. the body-parsing indicator) is present in that file object's actual key set, not assumed from stale documentation

### Requirement: Deep-audit gate scoring SHALL exclude vendor and backup directories
Raw gate counts computed from `codebase-graph.json` SHALL exclude known vendor/backup/scratch directories (`scripts/api-cleanup/`, `llama-cpp-turboquant-gemma4/`, `tools/agentic-research/`, `scripts/phase104-backups/`, `granite-docling-258M/`) so fail counts reflect live project code, not stale snapshots or third-party forks.

#### Scenario: A backup directory's route files do not count toward G4/G5/G16
- **WHEN** the indexer or a deep-audit pass computes G4/G5/G16 fail counts for `+server.ts` files
- **THEN** files under `scripts/api-cleanup/` (or another recognized vendor/backup path) are excluded from both the denominator and the fail list
