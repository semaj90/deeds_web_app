# Phase 3C — Directory Topology & Cold Storage Foundation

**Date**: 2026-06-11  
**Status**: ✅ COMPLETE  
**Mode**: Read-only, no mutations

---

## Overview

Phase 3C builds the canonical directory topology mapping and cold-storage infrastructure for Parent Atlas. Four foundational deliverables:

1. **Directory Topology Map** — source_ref → directory → feature_id identity chain
2. **Hidden Surface Registry** — inventory of all canonical and non-canonical storage layers
3. **Packet Temperature Classification** — HOT/WARM/COLD distribution analysis
4. **SeaweedFS Manifest** — cold-storage archival plan (summaries + centroids, NOT raw code)

---

## Deliverables

### 1. Directory Topology Map
**File**: `docs/reports/directory-topology-map.json`  
**Command**: `npm run atlas:phase3c:directory-topology-map`

**Stats**:
- Total Mappings: **10,951**
- Total Directories: **326**
- Top directories: sveltekit-frontend (3,037), api-cleanup (2,438), lib (2,436)

**Purpose**: Canonical source_ref → directory → feature_id mapping for replayability.

**Identity Chain**: `source_ref → feature_id → qdrant_point_id → som_cluster`

---

### 2. Hidden Surface Registry
**File**: `docs/reports/hidden-surface-registry.json`  
**Command**: `npm run atlas:phase3c:hidden-surface-registry`

**Surfaces Inventoried**:
| Surface | Backend | Purpose |
|---------|---------|---------|
| ATLAS | Postgres | Canonical source of truth |
| NESCHROM97 | Filesystem | Archived card exports (.opencode/) |
| DUCKDB | Filesystem | Offline analytics snapshots |
| ENGRAM | Filesystem | Runtime memory cache + vector index |
| SEAWEEDFS | Object Storage | Cold object storage (planned) |

**Preservation Rules**:
- **ATLAS**: Never mutate without explicit backfill
- **NESCHROM97**: Read-only archive, evidence only
- **DUCKDB**: Generated, not canonical
- **ENGRAM**: Ephemeral, regenerated on startup
- **SEAWEEDFS**: Future — manifests + summaries + centroids only (NOT raw code)

---

### 3. Packet Temperature Classification
**File**: `docs/reports/packet-temperature-report.json`  
**Command**: `npm run atlas:phase3c:packet-temperature`

**Distribution**:
- **HOT** (accessed last 7 days, feature_count > 5): **9,484 packets**
- **WARM** (accessed 7-30 days ago): **427 packets**
- **COLD** (last accessed > 30 days ago): **0 packets**

**Storage Placement**:
- HOT: Redis hot cache + Postgres
- WARM: Postgres only
- COLD: DuckDB / SeaweedFS (future)

---

### 4. SeaweedFS Cold-Storage Manifest
**File**: `docs/reports/seaweedfs-manifest.json`  
**Command**: `npm run atlas:phase3c:seaweedfs-manifest`

**Status**: Planned (0 archival entries currently — summaries/centroids not yet populated in atlas_directory_manifest)

**Archival Strategy**:
- **What to Archive**: Directory summaries, feature centroids, packet metadata
- **What NOT to Archive**: Raw code, full embedding vectors, source files
- **Target**: `s3://atlas-cold/` (SeaweedFS S3 gateway)
- **TTL**: 2,555 days (~7 years)
- **Restore Capability**: Full — can reconstruct topology from manifests

---

## Validation Results

| Check | Status | Details |
|-------|--------|---------|
| `npm run check:fast` | ✅ PASS | TypeScript validation clean |
| `npm run atlas:production-readiness` | ✅ PASS 66 / WARN 0 / FAIL 0 | Full health |
| `npm run opencode:tasks:refresh` | ✅ PASS | 199 recommendation events |
| `npm run opencode:tasks:state` | ✅ PASS | 12 tasks, 4 open, 0 archived |

---

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `scripts/atlas/build-directory-topology-map.mjs` | Directory topology builder | 180 |
| `scripts/atlas/build-hidden-surface-registry.mjs` | Surface inventory | 240 |
| `scripts/atlas/classify-packet-temperature.mjs` | Temperature classifier | 150 |
| `scripts/atlas/generate-seaweedfs-manifest.mjs` | Cold-storage manifest | 190 |

**Total New Code**: ~760 lines (all read-only, no mutations)

---

## NPM Aliases Registered

```bash
npm run atlas:phase3c:directory-topology-map
npm run atlas:phase3c:hidden-surface-registry
npm run atlas:phase3c:packet-temperature
npm run atlas:phase3c:seaweedfs-manifest
```

---

## Key Principles Upheld

✅ **No mutations** — all scripts are read-only analysis  
✅ **Provenance preserved** — every table/field traced back to source  
✅ **Replayability** — identity chains enable full reconstruction  
✅ **Collection safety** — `codebase_chunks_768` hard-coded, never inherits `QDRANT_COLLECTION`  
✅ **Surface separation** — ATLAS (canonical) ≠ NESCHROM97/DUCKDB/ENGRAM/SEAWEEDFS (evidence/cache)  

---

## Architecture Now Complete

**Phase 3 Status**:
- ✅ **3A** — Multi-Lane Retrieval Foundation (complete)
- ✅ **3B** — Retrieval Integration & Fusion (complete)
- ✅ **3C** — Directory Topology & Cold Storage (complete)

---

## Next Phase

**Phase 4** — TBD  
**Prerequisites Met**: All 3 Phase-3 lanes complete, production readiness at PASS 66/0/0

---

## Counts by Directory

**Top 10 by Mapping Count**:
1. sveltekit-frontend: 3,037 mappings (749 features)
2. api-cleanup: 2,438 mappings (8 features)
3. lib: 2,436 mappings (7 features)
4. routes: 1,333 mappings (5 features)
5. atlas: 339 mappings (3 features)
6. tests: 181 mappings (69 features)
7. turbovec: 178 mappings (156 features)
8. case_data: 147 mappings (2 features)
9. simd-bridge: 136 mappings (130 features)
10. opencode: 65 mappings (4 features)

---

## Commands Run

```bash
# Phase 3C Builders
npm run atlas:phase3c:directory-topology-map
npm run atlas:phase3c:hidden-surface-registry
npm run atlas:phase3c:packet-temperature
npm run atlas:phase3c:seaweedfs-manifest

# Validation
npm run check:fast
npm run atlas:production-readiness
npm run opencode:tasks:refresh
npm run opencode:tasks:state
```

---

**Status**: Ready for Phase 4 planning.
