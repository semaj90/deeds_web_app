# Graphify Stages 0–5 Gate Status (July 24, 2026)

## Summary

**Stage 4**: ✅ **COMPLETE** — 149,897 topology facts extracted (11,176 nodes + 138,721 edges)  
**Stage 4b**: ✅ **PASS** — 0% orphaned edges, canonical identity integrity validated  
**Stage 5**: 🔴 **FAIL** — Degenerate graph (all nodes score 0.000076, no differentiation)

## Root Cause Analysis

**Stage 5 gate failure is architectural, not a code bug.**

### Graph Composition (Stage 4 Output)
- Total nodes: 11,176
- **94% from venv-gemma4** (10,502 nodes): external library dependencies only
- **6% from project code** (674 nodes): claude-mem, scripts, utilities
- Total edges: 138,721
- **Primarily external imports**: `sys`, `os`, `asyncio`, etc.

### Why PageRank Failed
- **PageRank requires internal graph structure**: nodes → internal calls → differentiation
- **Current graph is disconnected**: all edges are outbound to external libraries
- **Result**: uniform distribution, all nodes converge to identical score (1/N * damping factor)
- **Top-K ordering cannot be validated**: no scoring variance

### Root Cause: Stage 1 File Enumeration
- Stage 1 used `rg --files` (respects .gitignore on Unix)
- Windows ripgrep does NOT reliably read `.gitignore` for venv directories
- `.gitignore` lists `.venv-gemma4/` and `.venv/` but ripgrep enumerated 1,941 files from venv
- Fixed in second Stage 1 run with explicit `--glob '!.venv*'` excludes

## Impact Timeline

| Stage | Input Source | Output | Issue |
|-------|--------------|--------|-------|
| Stage 1a | ripgrep (no glob exclude) | 27,704 files (includes venv) | ❌ INCORRECT |
| Stage 2a | Stage 1a files | 65,496 facts (94% venv) | ❌ SKEWED |
| Stage 4 | Stage 2a facts | 149,897 topology (94% venv edges) | ❌ DEGENERATE GRAPH |
| Stage 5 | Stage 4 topology | Uniform PageRank scores | ❌ GATE FAIL |
| --- | --- | --- | --- |
| Stage 1b | ripgrep (with `--glob '!.venv*'`) | 25,803 files (correct) | ✅ FIXED |
| Stage 2b | Stage 1b files | ~60K facts (project-weighted) | ⏳ PENDING |
| Stage 4b | Stage 2b facts | ~100K+ topology (internal edges) | ⏳ PENDING |
| Stage 5b | Stage 4b topology | Differentiated PageRank scores | ⏳ PENDING |

## Decisions Made

### Keep Current Stage 4 Output
- ✅ Artifact is **complete and valid** (149,897 records, 0% malformed)
- ✅ Represents **actual dependency graph** (libraries + external imports)
- ⏸️ **Not suitable for authority ranking** (internal project topology required)
- 📊 Useful for: library inventory, external dependency audit, API surface analysis

### Regenerate from Corrected Stage 1
- ✅ Stage 1b fixes ripgrep gitignore issue (25,803 files)
- ⏳ Needs Stage 2b re-run (structural extraction)
- ⏳ Needs Stage 4b re-run (topology with project-weighted edges)
- ⏳ Stage 5b will have proper graph structure for PageRank

## Next Steps (Ordered)

### IMMEDIATE
1. ✅ Stage 1b inventory complete (25,803 project files only)
2. ⏳ Run Stage 2b: `node scripts/atlas/stage2-structural-extraction-tree-sitter.mjs`
3. ⏳ Run Stage 4b: `rm docs/stage4/topology_facts.ndjson && node scripts/atlas/stage4-topology-extraction-parallel.mjs`
4. ⏳ Run Stage 5b: `node scripts/atlas/stage5-pagerank-authority-validated.mjs`

### CONDITIONAL (If Stage 5b passes gate)
5. Run Stage 4c: `node scripts/atlas/stage4c-edge-endpoint-validation.mjs`
6. Writeback PageRank to Postgres (authorized by gate pass)
7. Proceed to Stages 6–14

## Gate Status Matrix

| Gate | Status | Evidence | Blocker |
|------|--------|----------|---------|
| INFRASTRUCTURE_VERIFIED | ✅ PASS | 7/7 services online | No |
| FILE_INVENTORY_CORRECT | ✅ PASS | 25,803 files (no venv) | No |
| STRUCTURAL_EXTRACTION_PROVEN | ⏳ PENDING | Stage 2b not run | Yes |
| EDGE_ENDPOINT_INTEGRITY_PROVEN | ✅ PASS (Stage 4a) | 0% orphaned | No |
| NETWORKX_REFERENCE_PROVEN | 🔴 FAIL (Stage 5a) | Degenerate graph | **Yes** |
| NEO4J_GDS_PARITY_PROVEN | ⏳ PENDING | Awaiting Stage 5b pass | No |

## Confidence Levels

- **Stage 1b fix**: 98% (explicit glob excludes proven to work)
- **Stage 2b**: 85% (regex extraction, some extraction variance expected)
- **Stage 4b**: 90% (parallel file I/O proven; depends on Stage 2b quality)
- **Stage 5b**: 75% (depends on Stage 4b having meaningful internal edges)

## Files Involved

| File | Size | Records | Status |
|------|------|---------|--------|
| `docs/stage1/indexed_file_candidates.ndjson` | ~5 MB | 25,803 | ✅ Current (corrected) |
| `docs/stage2/structural_facts.ndjson` | ~12 MB | 65,496 | ❌ Outdated (from old Stage 1) |
| `docs/stage3/semantic_facts.ndjson` | ~6 MB | 65,496 | ❌ Outdated (mock fixture only) |
| `docs/stage4/topology_facts.ndjson` | 39 MB | 149,897 | ⏳ Valid but skewed (venv-heavy) |
| `docs/stage4b/edge-endpoint-validation-report.json` | 2 KB | 1 report | ✅ PASS (no orphans) |
| `docs/stage5/pagerank-validation-report.json` | 3 KB | 1 report | 🔴 FAIL (gate fail) |

## Recommendation

**Do NOT manually fix the degenerate PageRank scores.** The gate is correctly failing because the graph lacks structure. Regenerating from Stage 1b is the proper fix.

**Estimated time for regeneration**: ~25 minutes total (Stage 2b: 1min + Stage 4b: 10-15min + Stage 5b: 5min)

---

**Next checkpoint**: After Stage 2b completion, re-evaluate graph distribution before proceeding to Stage 4b re-run.
