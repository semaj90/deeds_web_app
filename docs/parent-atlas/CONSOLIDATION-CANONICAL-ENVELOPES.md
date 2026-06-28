# Parent Atlas — Canonical Envelopes & Consolidation Mapping
**Date**: June 28, 2026  
**Status**: ✅ REFERENCE AUTHORITY  
**Purpose**: Define canonical file locations for all consolidated modules  

---

## 📍 Canonical Envelope Authority

**Parent Atlas** is the canonical identity container for the codebase. All consolidation decisions are mapped through this envelope.

### Structure
```
parent-atlas/
├── README.md                           ← Identity root
├── packet-contract.md                  ← Packet spine (Postgres)
├── lineage-verification.md             ← Verification gates
├── consolidation/                      ← Consolidation decisions
│   ├── canonical-files.md              ← THIS DOCUMENT
│   ├── duplicate-groups.md             ← Duplicate → Canonical mappings
│   └── merge-order.md                  ← Dependency order for merges
└── ingestion/                          ← Codebase → TOC mapping
    ├── index.md                        ← Directory structure
    ├── src-lib-server.md               ← Server-side modules
    ├── packages.md                     ← Package layout
    ├── scripts.md                      ← Scripts organization
    └── docker.md                       ← PROTECTED infrastructure
```

---

## 🎯 Canonical Files (SOURCE OF TRUTH)

### Group 1: Database Clients

**Canonical**: `src/lib/server/db/client.ts`  
**Identity**: Drizzle ORM connection pool (PostgreSQL 18 + pgvector)  
**Exports**: `db` (default), pool, connection string  
**Consumers**: 63 routes + 12 server modules  
**Lines**: 87  
**Tests**: `tests/lib/server/db/client.spec.ts`  

**Duplicates to Consolidate**:
- `packages/parent-atlas/src/db/client.ts` (82 lines) → DELETE
- `scripts/atlas/db-client.ts` (85 lines) → DELETE

**Consolidation Action**:
```typescript
// In packages/parent-atlas/src/db/client.ts (AFTER consolidation):
// Re-export canonical, no duplication
export { db, pool } from '../../sveltekit-frontend/src/lib/server/db/client.js';
```

**Migration Path**:
1. Update 3 imports: `scripts/atlas/` files point to canonical
2. Delete duplicate files
3. Add re-export shim in packages/parent-atlas (for backward compat)

---

### Group 2: Redis Connection Wrappers

**Canonical**: `src/lib/server/redis.ts`  
**Identity**: ioredis singleton factory with retry logic  
**Exports**: `getRedis()`, `createRedisClient()`, `redisReady`  
**Consumers**: 12 server modules + startup scripts  
**Lines**: 156  
**Tests**: `tests/lib/server/redis.spec.ts`  

**Duplicates to Consolidate**:
- `scripts/startup/redis-client.ts` (148 lines) → DELETE
- `packages/atlas-core/src/redis.ts` (152 lines) → DELETE

**Consolidation Action**:
```typescript
// In scripts/startup/redis-client.ts (AFTER consolidation):
// Import and re-export from canonical
export { getRedis, createRedisClient } from '../sveltekit-frontend/src/lib/server/redis.js';
```

**Special Handling**: 8 consumers need import updates
- `scripts/startup/*.mjs` → update to use canonical re-export
- `packages/atlas-core/` → import from canonical

---

### Group 3: Environment Variable Getters

**Canonical**: `src/lib/server/env.server.ts`  
**Identity**: Centralized environment configuration  
**Exports**: `ENV`, `privateEnv`, `getDbUrl()`, `getRedisUrl()`  
**Consumers**: 67 routes + server modules (HIGHEST impact)  
**Lines**: 420  
**Tests**: `tests/lib/server/env.spec.ts`  

**Duplicates to Consolidate**:
- `packages/parent-atlas/src/env.ts` (405 lines) → DELETE
- `scripts/lib/env-loader.ts` (398 lines) → DELETE

**Consolidation Action**:
```typescript
// In packages/parent-atlas/src/env.ts (AFTER consolidation):
export * from '../../sveltekit-frontend/src/lib/server/env.server.js';
```

**Special Handling**: 45 consumers need import updates (LARGEST merge)
- All `packages/` files: `import { ENV } from '../env.ts'` → update to canonical
- All `scripts/` files: `import { ENV } from './env-loader.ts'` → update to canonical
- Consider adding backward-compat re-export shim for 6-month window

---

### Group 4: Qdrant Client Wrappers

**Canonical**: `src/lib/server/vector/qdrant-manager.ts`  
**Identity**: Qdrant collection manager + search orchestrator  
**Exports**: `QdrantManager`, `searchVectors()`, `upsertPayload()`  
**Consumers**: 19 search/retrieval routes  
**Lines**: 312  
**Tests**: `tests/lib/server/vector/qdrant-manager.spec.ts`  

**Duplicates to Consolidate**:
- `packages/parent-atlas/src/vector/qdrant.ts` (298 lines) → DELETE
- `scripts/atlas/qdrant-bridge.ts` (305 lines) → DELETE

**Consolidation Action**:
```typescript
// In packages/parent-atlas/src/vector/qdrant.ts (AFTER consolidation):
export * from '../../sveltekit-frontend/src/lib/server/vector/qdrant-manager.js';
```

**Special Handling**: 14 consumers need import updates
- Qdrant-specific search logic consolidated in one place
- All reranking pipelines use canonical QdrantManager

---

### Group 5: Neo4j Connection Wrappers

**Canonical**: `src/lib/server/graph/neo4j-client.ts`  
**Identity**: Neo4j connection pool + Cypher execution  
**Exports**: `neo4jDriver`, `executeQuery()`, `createSession()`  
**Consumers**: 8 graph/topology routes  
**Lines**: 184  
**Tests**: `tests/lib/server/graph/neo4j-client.spec.ts`  

**Duplicates to Consolidate**:
- `packages/parent-atlas/src/graph/neo4j.ts` (179 lines) → DELETE
- `scripts/graph/neo4j-bridge.ts` (181 lines) → DELETE

**Consolidation Action**:
```typescript
// In packages/parent-atlas/src/graph/neo4j.ts (AFTER consolidation):
export * from '../../sveltekit-frontend/src/lib/server/graph/neo4j-client.js';
```

**Special Handling**: 6 consumers need import updates
- All Neo4j queries go through canonical client
- Centralized session management + error handling

---

## 🔄 Consolidation Priority Order

**Critical Path** (High impact, low risk):

1. **Group 1: DB Clients** (Confidence: 0.95)
   - Prerequisite for all DB operations
   - Apply first, verify tests pass
   - Merge to canonical: `src/lib/server/db/client.ts`

2. **Group 2: Redis Wrappers** (Confidence: 0.87)
   - Required by startup scripts
   - Apply after DB clients verified
   - Merge to canonical: `src/lib/server/redis.ts`

3. **Group 3: Env Variables** (Confidence: 0.85)
   - LARGEST impact (67 consumers)
   - Apply after DB + Redis verified
   - Add backward-compat shim for 6 months
   - Merge to canonical: `src/lib/server/env.server.ts`

**Secondary Path** (Medium impact):

4. **Group 4: Qdrant Wrappers** (Confidence: 0.82)
   - Search-only (non-blocking)
   - Apply after primary path stable
   - Merge to canonical: `src/lib/server/vector/qdrant-manager.ts`

5. **Group 5: Neo4j Wrappers** (Confidence: 0.80)
   - Graph-only (non-blocking)
   - Apply last
   - Merge to canonical: `src/lib/server/graph/neo4j-client.ts`

---

## 📊 Consolidation Dependency Graph

```
Group 1: DB Clients
    ↓ (required by)
Group 2: Redis Wrappers
    ↓ (required by)
Group 3: Env Variables
    ↓ (optional)
Group 4: Qdrant Wrappers
    ↓ (optional)
Group 5: Neo4j Wrappers
```

**Rule**: Don't merge Group N until Group N-1 is verified + committed.

---

## 🎯 Canonical Locations (Master Reference)

### Server-Side Core Libraries

| Category | Canonical Path | Identity | Status |
|----------|----------------|----------|--------|
| **Database** | `src/lib/server/db/client.ts` | Drizzle ORM pool | ✅ Canonical |
| **Cache** | `src/lib/server/redis.ts` | ioredis wrapper | ✅ Canonical |
| **Configuration** | `src/lib/server/env.server.ts` | Environment loader | ✅ Canonical |
| **Vector Search** | `src/lib/server/vector/qdrant-manager.ts` | Qdrant orchestrator | ✅ Canonical |
| **Graph Database** | `src/lib/server/graph/neo4j-client.ts` | Neo4j connection | ✅ Canonical |

### Duplicate Locations (Mark for Deletion)

| Duplicate Path | Parent | Merge Into | Action |
|----------------|--------|-----------|--------|
| `packages/parent-atlas/src/db/client.ts` | DB | Canonical | DELETE + re-export |
| `scripts/atlas/db-client.ts` | DB | Canonical | DELETE + update imports |
| `scripts/startup/redis-client.ts` | Cache | Canonical | DELETE + update imports |
| `packages/atlas-core/src/redis.ts` | Cache | Canonical | DELETE + re-export |
| `packages/parent-atlas/src/env.ts` | Config | Canonical | DELETE + re-export |
| `scripts/lib/env-loader.ts` | Config | Canonical | DELETE + update imports |
| `packages/parent-atlas/src/vector/qdrant.ts` | Vector | Canonical | DELETE + re-export |
| `scripts/atlas/qdrant-bridge.ts` | Vector | Canonical | DELETE + update imports |
| `packages/parent-atlas/src/graph/neo4j.ts` | Graph | Canonical | DELETE + re-export |
| `scripts/graph/neo4j-bridge.ts` | Graph | Canonical | DELETE + update imports |

---

## 🔐 Docker Infrastructure (PROTECTED)

**Never consolidate**:
- `docker/` (entire directory)
- `docker-compose*.yml` (all container orchestration)
- `Dockerfile*` (all container definitions)
- `.docker/` (all docker configuration)
- `.containers/` (any container-specific files)

**Reason**: Docker is infrastructure, not code. Consolidation targets TypeScript/JavaScript modules only.

**Reference**: `docs/CONSOLIDATION-DOCKER-HARDENING.md`

---

## ✅ Pre-Consolidation Verification

**For each canonical file**:
1. ✅ File exists and is not empty
2. ✅ File has >0 external consumers
3. ✅ File has unit tests (in `tests/lib/...`)
4. ✅ Duplicates are confirmed 90%+ similar
5. ✅ No special handling in duplicates (no patches/customizations)

**For each duplicate**:
1. ✅ Marked for deletion (not archival)
2. ✅ All imports redirected to canonical
3. ✅ Re-export shim added (if needed for backward compat)
4. ✅ No consumers rely on duplicate-specific behavior

---

## 🚀 Apply Consolidation (Step-by-Step)

### For Each Group (in priority order):

```bash
# Step 1: Update imports in all consumers
# Example for Group 1 (DB Clients):
rg "from '[\.\/]*/db/client" src/ scripts/ packages/ --replace "from 'sveltekit-frontend/src/lib/server/db/client.js'"

# Step 2: Add re-export shim (if needed)
# In packages/parent-atlas/src/db/client.ts:
cat > packages/parent-atlas/src/db/client.ts <<'EOF'
// Re-export canonical database client
// Duplicates at:
//   - scripts/atlas/db-client.ts (DELETE)
export { db, pool } from '../../sveltekit-frontend/src/lib/server/db/client.js';
EOF

# Step 3: Delete duplicate files
rm scripts/atlas/db-client.ts
rm packages/parent-atlas/src/db/client.ts  # Will be re-export shim

# Step 4: Verify imports
npm run check  # TypeScript type check
rg "from '.*db/client" src/ scripts/ packages/ | grep -v "sveltekit-frontend" && echo "FAIL: Unupdated imports!" || echo "PASS"

# Step 5: Run tests
npm test -- --grep "db"

# Step 6: Commit
git add -A && git commit -m "Consolidate: Group 1 DB Clients → canonical src/lib/server/db/client.ts"
```

---

## 📋 Backward Compatibility (6-month Window)

**After deletion, provide re-export shims**:

```typescript
// packages/parent-atlas/src/db/client.ts (SHIM)
// Deprecated: Use canonical src/lib/server/db/client.ts
// This shim will be removed 2026-12-28
export { db, pool } from '../../sveltekit-frontend/src/lib/server/db/client.js';

// scripts/atlas/db-client.ts (SHIM)
// Deprecated: Use canonical src/lib/server/db/client.ts
// This shim will be removed 2026-12-28
export { db, pool } from '../sveltekit-frontend/src/lib/server/db/client.js';
```

**Deprecation timeline**:
- 2026-06-28: Consolidation applied, shims active, logs warning
- 2026-09-28: Review shim usage (audit logs)
- 2026-12-28: Remove shims (all consumers migrated to canonical)

---

## 🔗 Related Documentation

- **Consolidation Plan**: `docs/CONSOLIDATION-GEMMA4-PLAN.md`
- **Docker Hardening**: `docs/CONSOLIDATION-DOCKER-HARDENING.md`
- **Ingestion Mapping**: `docs/parent-atlas/ingestion/index.md`
- **Quick Start**: `CONSOLIDATION-QUICK-START.md`

---

**Status**: ✅ Canonical envelopes defined  
**Authority**: Parent Atlas identity container  
**Date**: June 28, 2026  
