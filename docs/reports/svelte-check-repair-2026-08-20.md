# Svelte Check Repair — 2026-08-20

Status: `PARTIAL_REPAIR`

The bounded repair reduced the compiler error count to zero. The latest full
Svelte check exits `0` with `0` errors and `291` warnings across `100` files;
the warnings are remaining accessibility and unused-CSS hygiene work, not
compiler blockers.

The warning profile is primarily accessibility: 121 labels without associated
controls, 48 click handlers without keyboard handlers, 34 static interactive
elements, 20 explicit-label suggestions, 9 focus-support warnings, 1 role
warning, and 58 other Svelte hygiene warnings.

Fixed without database, Qdrant, Neo4j, Valkey, or canonical identity writes:

- llama-server cache/provider union drift
- inference observability backend union drift
- analysis event participant typing
- Postgres FTS derived-field typing
- ACP `graph-analysis` category typing
- event-fabric worker imports from the correct owner
- missing VLM/model/environment imports
- analysis worker semantic-envelope preservation
- normalized daily Graphify board identity fields
- Redis/cluster policy typing
- ACE context source-reference fallback
- canonical 768 learning-trainer projection
- regen loader and packet-vector contract repairs
- ontology tuple provenance defaults

The package export surface and the remaining frontend contract errors were
repaired. Direct `npx tsc -p packages/parent-atlas/tsconfig.json` and frontend
`npx tsc --noEmit --pretty false` both pass. The root `parent-atlas:build` script
still has an npm workspace-topology issue because it combines `--no-workspaces`
with `--workspace`; this is a script issue, not a package compiler failure.

Remaining work is warning hygiene: accessibility associations/roles and unused
CSS across 100 files. The admin render and Drizzle checks remain independently
proven.

Focused lane tests passed: the RAPIDS KNN client suite completed 2/2 tests after
the lane Vitest config received the repository `$lib` alias. No runtime or
canonical-store writes were performed.
