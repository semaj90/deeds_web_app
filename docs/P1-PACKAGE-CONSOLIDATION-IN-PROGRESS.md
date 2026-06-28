# P1 Package Consolidation — In Progress

**Date**: June 15, 2026 (Session 66 continuation)  
**Status**: 🚀 REFACTORING FROM LOOSE SCRIPTS TO MONOREPO PACKAGES  
**Objective**: Consolidate P1 verification scripts into `packages/parent-atlas` to enable a reusable repo-ingestion library model

---

## Overview

Parent Atlas was previously five standalone scripts in `scripts/atlas/`. Now consolidating into the modular package structure so it can be:
- Imported as a library (`@deeds/parent-atlas`)
- Called from other packages (`parent-atlas-opencode`, `sveltekit-frontend`)
- Reused for any repository ingestion (not just deeds-web-app)

Current state:
- `packages/parent-atlas` already exists in this repo.
- The package shell includes `src/index.ts`, `src/cli.ts`, `src/gates/*`, `src/adapters/*`, and `src/pipelines/*`.
- The remaining work is wiring, wrapper cleanup, and cross-package integration, not package creation from scratch.
- The backfill-readiness blocker is live schema reconciliation: the existing `atlas_*` tables still lag the package contract for tree nodes, summary layers, and topology indexes.

---

## Migration Tracker

### Phase A: Package scaffold and pipeline ports

✅ **Present in scaffold** (June 15, 2026):
1. `scripts/atlas/verify-p1-lineage.mjs` → `packages/parent-atlas/src/pipelines/verify-p1-lineage.ts`
2. `scripts/atlas/backfill-tree-nodes.mjs` → `packages/parent-atlas/src/pipelines/backfill-tree-nodes.ts`
3. `scripts/atlas/backfill-topology-index.mjs` → `packages/parent-atlas/src/pipelines/backfill-topology-index.ts`
4. `scripts/atlas/backfill-summary-stubs.mjs` → `packages/parent-atlas/src/pipelines/backfill-summary-stubs.ts`
5. `scripts/atlas/test-qdrant-connectivity.mjs` → `packages/parent-atlas/src/pipelines/test-qdrant-connectivity.ts`

**Status**: Package scaffold exists. Next: reconcile the live schema, then finish any remaining CLI/wrapper wiring and OpenCode surfaces.

### Phase B: Convert to TypeScript Modules

**Todo**:
- [ ] Normalize the remaining wrapper behavior around the package CLI entrypoints
- [ ] Confirm any shell wrappers stay thin and backward-compatible
- [ ] Update environment handling for the reusable package boundary where needed
- [ ] Add/refresh JSDoc for any new exported package entrypoints
- [ ] Reconcile live `atlas_*` table shapes with the package gate expectations before the next backfill pass

### Phase C: Integrate with CLI

**Todo**:
- [ ] Keep the CLI subcommands aligned with the current package surface:
  - `atlas verify p1-lineage` → calls verifyLineage()
  - `atlas backfill tree-nodes [--dry-run|--apply] [--limit N] [--verify]` → backfillTreeNodes()
  - `atlas backfill topology-index` → backfillTopologyIndex()
  - `atlas backfill summary-stubs` → backfillSummarySummaryStubs()
  - `atlas test qdrant-connectivity` → testQdrantConnectivity()

### Phase D: Wire Package Scripts

**Todo**:
- [ ] Keep `packages/parent-atlas/package.json` aligned with the current CLI:
  ```json
  "scripts": {
    "verify:p1:lineage": "node --experimental-vm-modules dist/cli.js verify p1-lineage",
    "backfill:tree-nodes:dry": "node --experimental-vm-modules dist/cli.js backfill tree-nodes --dry-run",
    "backfill:tree-nodes:apply": "node --experimental-vm-modules dist/cli.js backfill tree-nodes --apply",
    "backfill:topology-index": "node --experimental-vm-modules dist/cli.js backfill topology-index",
    "backfill:summary-stubs": "node --experimental-vm-modules dist/cli.js backfill summary-stubs",
    "test:qdrant": "node --experimental-vm-modules dist/cli.js test qdrant-connectivity"
  }
  ```

### Phase E: Wire Root Package.json

**Todo**:
- [ ] Add to `/package.json` only if any missing root aliases still need to point at the package:
  ```json
  "atlas:lineage:verify": "npm -w @deeds/parent-atlas run verify:p1:lineage",
  "atlas:backfill:tree-nodes": "npm -w @deeds/parent-atlas run backfill:tree-nodes:dry",
  "atlas:backfill:tree-nodes:apply": "npm -w @deeds/parent-atlas run backfill:tree-nodes:apply",
  "atlas:backfill:topology-index": "npm -w @deeds/parent-atlas run backfill:topology-index",
  "atlas:backfill:summary-stubs": "npm -w @deeds/parent-atlas run backfill:summary-stubs",
  "atlas:qdrant:connectivity": "npm -w @deeds/parent-atlas run test:qdrant"
  ```
- Keep `scripts/atlas/*.mjs` as thin wrappers for backwards compatibility (do NOT delete)

### Phase F: OpenCode Integration

**Todo**:
- [ ] Create `packages/parent-atlas-opencode/` only if the OpenCode integration is moved into a standalone package
- [ ] Wire OpenCode commands to parent-atlas library:
  - `atlas.ingestRepo(path)` → calls library ingestRepo()
  - `atlas.verifyLineage()` → calls verifyLineage()
  - `atlas.findPacket(key)` → calls packet search
  - `atlas.health()` → calls health check

---

## Canonical Identity (P1 Freeze)

All scripts maintain the locked identity contract:

```
directory_path → source_ref → file_path → feature_id → feature_label 
  → packet_key → tree_node_id
```

**Verification result** (June 15, 2026):
- ✅ Tree nodes: 8,823 (5,572 documents + 3,251 chunks)
- ✅ Packet linkage: 3,251/3,251 = 100%
- ✅ Orphaned nodes: 0

---

## Next Milestone

Once Phase A-E complete, Parent Atlas is **library-first**, not script-first. Then:

1. **Refactor for arbitrary repos** — Remove deeds-web-app assumptions (env vars, paths, schema names)
2. **OpenCode integration** — Expose as CLI commands + MCP tools
3. **P2 Rust Parser** — Replace AST extraction, feed tree parser output into the library
4. **Live schema reconciliation** — align tree / summary / topology tables before any fresh backfill or plugin promotion

---

## Files Reference

| File | Purpose |
|------|---------|
| `packages/parent-atlas/src/pipelines/verify-p1-lineage.ts` | P1 lineage verification (new location) |
| `packages/parent-atlas/src/pipelines/backfill-tree-nodes.ts` | Tree hierarchy backfill (new location) |
| `packages/parent-atlas/src/pipelines/backfill-topology-index.ts` | 4D topology backfill (new location) |
| `packages/parent-atlas/src/pipelines/backfill-summary-stubs.ts` | Summary layer stubs (new location) |
| `packages/parent-atlas/src/pipelines/test-qdrant-connectivity.ts` | Qdrant health check (new location) |
| `scripts/atlas/verify-p1-lineage.mjs` | Original (keep as wrapper) |
| `scripts/atlas/backfill-*.mjs` | Originals (keep as wrappers) |
| `scripts/atlas/test-qdrant-connectivity.mjs` | Original (keep as wrapper) |

---

**Owner**: Parent Atlas Consolidation Task  
**Last Updated**: June 15, 2026 (Session 66)
