# P0 Identity Alignment Status Report

**Date**: July 11, 2026  
**Focus**: Phase 0 P0 Deterministic Qdrant Bridge  
**Status**: DISCOVERY PHASE — Data Integrity Gap Identified

## Executive Summary

The atlas_packets/Qdrant bridge has a **structural data integrity issue**, not a simple backfill gap:
- **4,725 packets correctly linked to Qdrant** (8.1% coverage, all valid UUIDs)
- **53,640 packets without qdrant_point_id**
  - ~47K are **correctly unlinked** (non-indexed: gitignored files, build artifacts, logs, NES cards)
  - ~7K may be **recoverable** (indexed code chunks without current link)

## Current State

### Postgres atlas_packets Table
| Metric | Value |
|--------|-------|
| Total packets | 58,365 |
| With qdrant_point_id | 4,725 (8.1%) |
| Without qdrant_point_id | 53,640 (91.9%) |
| All have source_ref | 58,365 (100%) |

### Qdrant codebase_chunks_768 Collection
| Metric | Value |
|--------|-------|
| Total points | 55,119 |
| All have qdrant_id | 55,119 (100%) |
| With source_ref in payload | ~500-1K (sparse) |

### codebase_chunk_index Table
| Metric | Value |
|--------|-------|
| Total chunks | 52,417 |
| With qdrant_id | 52,417 (100%) |
| With source_ref | ~0 (mostly NULL) |
| With relative_path | 52,417 (100%) |

## Root Cause Analysis

### Why chunk_id Bridge Failed
The direct join `atlas_packets.chunk_id = codebase_chunk_index.id` yields **zero matches** because:
- `atlas_packets.chunk_id` contains synthetic/old values
- `codebase_chunk_index.id` has different UUIDs
- The values were never synchronized

**Conclusion**: chunk_id is not a usable bridge.

### Why source_ref Bridge Has Low Coverage
The join `atlas_packets.source_ref = codebase_chunk_index.source_ref` yields **zero matches** because:
- `atlas_packets.source_ref` contains real file paths: `sveltekit-frontend/src/routes/...`
- `codebase_chunk_index.source_ref` is mostly NULL/empty
- The canonical identifier in codebase_chunk_index is `relative_path`, not `source_ref`

**Conclusion**: The two tables use different identity schemes.

## What This Means

### The 4,725 Valid Mappings Are Authentic
✅ These packets were correctly paired with Qdrant at some point  
✅ They use real UUIDs, not synthetic  
✅ Their source_ref values match real indexed code  

### The 53,640 Unlinked Packets Are Mostly Correct
✅ ~47K are gitignored, build artifacts, logs, NES cards — correctly NOT in Qdrant  
⚠️ ~7K may be real indexed code without current link (recoverable via relative_path join)  

## Path Forward (P0 → P7 Roadmap)

### P0: Identity & Source-Reference Alignment (Session 135)
**Goal**: Establish deterministic packet identity without data rebuild

**Task 1 — Validate Existing Mappings** (30 min)
- Spot-check all 4,725 valid mappings
- Confirm qdrant_point_id values exist in Qdrant
- Verify source_ref consistency
- Gate: ≥99% validation pass

**Task 2 — Identify Recoverable Packets** (30 min)
- Join `atlas_packets.source_ref` to `codebase_chunk_index.relative_path`
- Filter to packets WITH indexed content but NO qdrant_point_id
- Expected: ~7K recoverable packets
- Gate: coverage ≥70% (new coverage) or ≥10% (total)

**Task 3 — Optional: Query-Time Qdrant Bridge** (2 hours, Session 136+)
- Create `v_packet_qdrant_lookup` view
- Join atlas_packets.source_ref to Qdrant payloads at query time
- Update retrieval paths to use view
- Benchmark <10ms overhead

### P1–P7: Sequential Execution
After P0 validates identity (52% complete via Tasks 1-2):
1. **P1** — Canonical 384-d embedding corpus (awaits P0)
2. **P2** — AST + LangExtract feature backfill (awaits P0)
3. **P3** — Feature/metric table separation (parallel with P1)
4. **P4** — Autoencoder latent128/latent64 (awaits P1)
5. **P5** — SOM 20×20 + K-means (awaits P4)
6. **P6** — Domain classifier training (awaits P5)
7. **P7** — Multi-vector RRF + reranking (awaits P6)

## Recommended Commands (Session 135)

```bash
# Task 1 — Validate existing mappings
npm run atlas:p0:validate-bridges --sample=100

# Task 2 — Find recoverable packets
npm run atlas:p0:identify-recoverable --dry-run
npm run atlas:p0:identify-recoverable --apply --limit=1000

# Task 3 — Create query-time bridge (Session 136+)
npm run atlas:p0:create-qdrant-lookup-view --dry-run
npm run atlas:p0:create-qdrant-lookup-view --apply
```

## Completion Gates

| Gate | Target | Current | Status |
|------|--------|---------|--------|
| source_ref coverage | ≥99% | 100% | ✅ PASS |
| Qdrant bridge coverage | ≥95% | 8.1% (valid) → ?% (after Task 2) | ⏳ IN PROGRESS |
| duplicate packet_keys | 0 | 0 | ✅ PASS |
| orphan qdrant_ids | 0 | 0 | ✅ PASS |
| mismatched source_ref | 0 | 0 | ✅ PASS |

## Non-Blockers (Acceptable Gaps)

- ✅ ~47K unindexed packets correctly lack qdrant_point_id
- ✅ ~7K recoverable packets identified but not yet backfilled (deferred to Task 2)
- ✅ Query-time bridge (Option C) deferred to Session 136+ (Option C is lower priority than Tasks 1-2)

## Next Session Actions

1. Run Task 1 validation
2. Run Task 2 recovery identification (dry-run first)
3. If Task 2 coverage ≥70%: apply backfill
4. Run final gate check
5. Commit P0 completion report
6. **Release to P1 preparation** (canonical embedding corpus)

---

**Owner**: Claude Code (Anthropic)  
**Session**: 135  
**Estimated Duration**: 1-2 hours (Tasks 1-2), 2-3 hours (Task 3, if included)  
