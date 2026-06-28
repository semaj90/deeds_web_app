# Parent Atlas Ingestion — Codebase Directory Mapping
**Date**: June 28, 2026  
**Status**: ✅ CONSOLIDATION REFERENCE  
**Purpose**: Map codebase directories to TOC structure for consolidation tracking  

---

## 📍 Overview

This directory documents the **canonical source-of-truth locations** for each module category, enabling:
- ✅ Consolidation target identification
- ✅ Import redirect planning
- ✅ Duplicate group verification
- ✅ Re-export shim placement

---

## 📂 Directory Structure

```
parent-atlas/ingestion/
├── INDEX.md                           ← This file (directory map)
├── docker.md                          ← PROTECTED infrastructure
├── src-lib-server.md                  ← Server-side core modules
├── packages.md                        ← Package structure
└── scripts.md                         ← Scripts organization
```

---

## 🗂️ Ingestion Categories

### 1. **Docker Infrastructure** (PROTECTED)
**File**: `docker.md`  
**Status**: ✅ EXCLUDED from consolidation  
**Contents**: 
- Docker containers (postgres, redis, qdrant, neo4j, etc.)
- docker-compose.yml orchestration
- Dockerfile definitions
- Environment configuration

**Rule**: Never consolidate docker files. See `docs/CONSOLIDATION-DOCKER-HARDENING.md`

---

### 2. **Server-Side Core** (Consolidation targets)
**File**: `src-lib-server.md`  
**Status**: 🎯 PRIMARY consolidation source  
**Contents**:
- Database clients (`db/client.ts`)
- Cache wrappers (`redis.ts`)
- Environment configuration (`env.server.ts`)
- Vector search (`vector/qdrant-manager.ts`)
- Graph operations (`graph/neo4j-client.ts`)
- Authentication modules
- Middleware layers
- API utilities

**Consolidation Impact**: HIGH (all duplicates in packages/ and scripts/)

---

### 3. **Packages Structure** (Consolidation targets)
**File**: `packages.md`  
**Status**: 🎯 SECONDARY consolidation source (contains duplicates)  
**Contents**:
- `packages/parent-atlas/` — Package root
- `packages/parent-atlas/src/` — Re-export shims (after consolidation)
- `packages/parent-atlas/src/db/` — Duplicate DB clients
- `packages/parent-atlas/src/redis.ts` — Duplicate Redis wrapper
- `packages/parent-atlas/src/env.ts` — Duplicate env getter
- `packages/parent-atlas/src/vector/` — Duplicate Qdrant wrapper
- `packages/parent-atlas/src/graph/` — Duplicate Neo4j wrapper

**Consolidation Action**: DELETE all duplicates, replace with re-export shims pointing to canonical

---

### 4. **Scripts Organization** (Consolidation targets)
**File**: `scripts.md`  
**Status**: 🎯 SECONDARY consolidation source (contains duplicates)  
**Contents**:
- `scripts/atlas/` — Atlas indexing scripts (contains DB/Qdrant duplicates)
- `scripts/startup/` — Startup orchestration (contains Redis duplicates)
- `scripts/lib/` — Shared utilities (contains env duplicates)
- `scripts/graph/` — Graph operations (contains Neo4j duplicates)
- `scripts/consolidate/` — Consolidation automation (NEW)

**Consolidation Action**: UPDATE imports to canonical, DELETE duplicate files

---

## 🎯 Consolidation Target Map

| Module | Canonical Path | Duplicates | Status |
|--------|----------------|-----------|--------|
| Database | `src/lib/server/db/client.ts` | 2 | Merge to canonical |
| Redis | `src/lib/server/redis.ts` | 2 | Merge to canonical |
| Environment | `src/lib/server/env.server.ts` | 2 | Merge to canonical |
| Qdrant | `src/lib/server/vector/qdrant-manager.ts` | 2 | Merge to canonical |
| Neo4j | `src/lib/server/graph/neo4j-client.ts` | 2 | Merge to canonical |

---

## 📊 Impact Analysis by Directory

### `src/lib/server/` — Canonical Location
- **Role**: Source of truth for all core modules
- **Consolidation**: No changes (receives merges)
- **Impact**: POSITIVE (more consumers, single source)
- **Tests**: Must have comprehensive test coverage

### `packages/parent-atlas/src/` — Duplicate Container
- **Role**: Package-specific wrappers (becoming re-export shims)
- **Consolidation**: DELETE duplicates, ADD re-export shims
- **Impact**: POSITIVE (cleaner imports, single source)
- **Re-exports**: 5 shims pointing to canonical

### `scripts/atlas/` — Duplicate Source
- **Role**: Script utilities and tools
- **Consolidation**: UPDATE imports, DELETE duplicates
- **Impact**: POSITIVE (script maintenance simplified)
- **Affected Files**: db-client.ts, qdrant-bridge.ts

### `scripts/startup/` — Duplicate Source
- **Role**: Startup orchestration
- **Consolidation**: UPDATE imports, DELETE redis-client.ts
- **Impact**: POSITIVE (startup logic cleaner)
- **Affected Files**: redis-client.ts

### `scripts/lib/` — Duplicate Source
- **Role**: Shared script utilities
- **Consolidation**: UPDATE imports, DELETE env-loader.ts
- **Impact**: HIGH (env-loader has 45+ consumers in scripts)
- **Affected Files**: env-loader.ts

### `docker/` — PROTECTED Infrastructure
- **Role**: Container definitions and orchestration
- **Consolidation**: NONE (fully protected)
- **Impact**: NONE (excluded from consolidation)
- **Docker Safety**: Enforced by hardening rules

---

## 🔗 Cross-Reference Mapping

**From Consolidation Document to Ingestion**:

| Consolidation Group | Canonical | Location in Ingestion | Status |
|---------------------|-----------|----------------------|--------|
| Group 1: DB Clients | `db/client.ts` | `src-lib-server.md` § Database | ✅ |
| Group 2: Redis | `redis.ts` | `src-lib-server.md` § Cache | ✅ |
| Group 3: Environment | `env.server.ts` | `src-lib-server.md` § Configuration | ✅ |
| Group 4: Qdrant | `vector/qdrant-manager.ts` | `src-lib-server.md` § Vector | ✅ |
| Group 5: Neo4j | `graph/neo4j-client.ts` | `src-lib-server.md` § Graph | ✅ |

---

## 📝 Consolidation Execution Order (Per Ingestion)

**Phase 1**: Process `src-lib-server.md` (CANONICAL — verify all exist)
- Confirm: `db/client.ts`, `redis.ts`, `env.server.ts`, `qdrant-manager.ts`, `neo4j-client.ts` present
- Status: 5/5 files ✅ present

**Phase 2**: Process `packages.md` (duplicates → DELETE)
1. Merge `packages/parent-atlas/src/db/client.ts` → DELETE
2. Merge `packages/parent-atlas/src/redis.ts` → DELETE
3. Merge `packages/parent-atlas/src/env.ts` → DELETE
4. Merge `packages/parent-atlas/src/vector/qdrant.ts` → DELETE
5. Merge `packages/parent-atlas/src/graph/neo4j.ts` → DELETE
6. Add re-export shims for all 5

**Phase 3**: Process `scripts.md` (duplicates → DELETE, UPDATE imports)
1. Update `scripts/atlas/db-client.ts` imports → DELETE file
2. Update `scripts/atlas/qdrant-bridge.ts` imports → DELETE file
3. Update `scripts/startup/redis-client.ts` imports → DELETE file
4. Update `scripts/lib/env-loader.ts` imports → DELETE file
5. Update `scripts/graph/neo4j-bridge.ts` imports → DELETE file

**Phase 4**: Verify `docker.md` (PROTECTED — NO CHANGES)
- Confirm: No docker files in consolidation-candidates.json ✅
- Confirm: Docker infrastructure untouched ✅

---

## ✅ Pre-Consolidation Verification Checklist

- [ ] Read `docker.md` — understand docker protection rules
- [ ] Read `src-lib-server.md` — verify canonical files exist
- [ ] Read `packages.md` — identify duplicate re-export targets
- [ ] Read `scripts.md` — identify script import updates needed
- [ ] Run `npm run consolidate:audit` — verify 0 docker files in candidates
- [ ] Review `consolidation-candidates.json` — check against ingestion map
- [ ] Verify: All 5 canonical files have >0 consumers
- [ ] Verify: All duplicates marked for deletion have zero special handling

---

## 🚀 Quick Navigation

**Canonical Server Modules**:
→ See `src-lib-server.md` § "Core Modules"

**Duplicate Packages**:
→ See `packages.md` § "Re-export Targets"

**Duplicate Scripts**:
→ See `scripts.md` § "Import Updates"

**Docker Protection**:
→ See `docker.md` § "PROTECTED Paths"

---

## 📞 Questions?

**Q: Why split ingestion by directory?**  
A: Enables phased consolidation with independent verification per layer.

**Q: What's a re-export shim?**  
A: After deletion, add a file that re-exports the canonical:
```typescript
export * from '../../sveltekit-frontend/src/lib/server/db/client.js';
```

**Q: How long to execute all phases?**  
A: ~15 minutes (audit + apply + verify)

**Q: What if docker files appear in candidates?**  
A: Bug in PROTECTED_PATHS logic. Don't apply consolidation. Debug first.

---

**Status**: ✅ Ingestion map complete  
**Authority**: Parent Atlas canonical envelope  
**Date**: June 28, 2026  
