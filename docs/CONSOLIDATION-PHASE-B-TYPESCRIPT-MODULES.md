# Consolidation Phase B: TypeScript Module Conversion

**Date**: June 15, 2026 (Session 66 continuation)  
**Status**: 🚀 IN PROGRESS  
**Objective**: Convert copied `.ts` files from ES modules (.mjs) to proper TypeScript modules with exported functions

---

## Overview

P1 scripts were copied as-is from `scripts/atlas/*.mjs` to `packages/parent-atlas/src/pipelines/*.ts`. Now converting to library-friendly modules:
- Remove `#!/usr/bin/env node` shebangs (CLI handles invocation)
- Export named functions (not top-level main execution)
- Use `src/env.ts` for environment config (not local dotenv)
- Add JSDoc with purpose, args, returns
- Maintain `.mjs` originals as thin wrappers for backwards compatibility

---

## Conversion Pattern

### Before (Current State)
```typescript
#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function verifyLineage() { /* ... */ }

verifyLineage()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ Error:', err.message); process.exit(1); });
```

### After (Library Pattern)
```typescript
import { pool } from '../adapters/postgres.js';

export async function verifyLineage(opts?: { verbose?: boolean }): Promise<{
  packets: number;
  treeNodes: number;
  topologyEntries: number;
  summaryLayers: number;
  linkageStatus: Record<string, number>;
}> {
  // Implementation
  return { /* results */ };
}
```

---

## Files to Convert

### 1. `verify-p1-lineage.ts`
**Current**: Standalone script with main execution  
**Target**: Export `verifyLineage()` function  
**Changes**:
- [ ] Remove shebang
- [ ] Remove `dotenv.config()`
- [ ] Import pool from `../adapters/postgres.js`
- [ ] Change main function to named export
- [ ] Return typed result object (not just console output)
- [ ] Keep log helpers (console.log) but allow caller to suppress or consume output
- [ ] Add JSDoc

**Expected signature**:
```typescript
export async function verifyLineage(opts?: {
  verbose?: boolean;
  client?: pg.PoolClient;
}): Promise<P1LineageReport>;

interface P1LineageReport {
  packets: {
    total: number;
    sourceRef: number;
    featureId: number;
    packetKey: number;
  };
  treeNodes: {
    total: number;
    documents: number;
    chunks: number;
    withPacketKey: number;
  };
  topologyIndex: {
    total: number;
    withSom: number;
    withQdrant: number;
    withNeo4j: number;
    withAuthority: number;
  };
  summaryLayers: {
    total: number;
    uniquePackets: number;
    uniqueLevels: number;
    withContent: number;
  };
  linking: {
    packetsToTree: number;
    packetsToTopo: number;
    packetsToSummary: number;
    fullyLinked: number;
  };
  status: 'PASS' | 'PARTIAL' | 'FAIL';
}
```

### 2. `backfill-tree-nodes.ts`
**Current**: Standalone script with CLI argument parsing  
**Target**: Export `backfillTreeNodes()` function  
**Changes**:
- [ ] Remove shebang
- [ ] Import pool from `../adapters/postgres.js`
- [ ] Extract args into function parameters
- [ ] Return typed report object
- [ ] Add JSDoc

**Expected signature**:
```typescript
export async function backfillTreeNodes(opts: {
  dryRun?: boolean;
  apply?: boolean;
  limit?: number;
  verify?: boolean;
  client?: pg.PoolClient;
}): Promise<TreeNodesBackfillReport>;

interface TreeNodesBackfillReport {
  mode: 'dry-run' | 'apply';
  filesProcessed: number;
  documentsCreated: number;
  chunksCreated: number;
  duplicateDocuments: number;
  duplicateChunks: number;
  errors: string[];
  timestamp: string;
}
```

### 3. `backfill-topology-index.ts`
**Current**: Standalone script  
**Target**: Export `backfillTopologyIndex()` function  
**Changes**:
- [ ] Remove shebang
- [ ] Import pool + Qdrant client
- [ ] Extract args into function parameters
- [ ] Return typed report

**Expected signature**:
```typescript
export async function backfillTopologyIndex(opts: {
  dryRun?: boolean;
  apply?: boolean;
  limit?: number;
}): Promise<TopologyIndexBackfillReport>;
```

### 4. `backfill-summary-stubs.ts`
**Current**: Standalone script  
**Target**: Export `backfillSummarySummaryStubs()` function  
**Changes**:
- [ ] Remove shebang
- [ ] Import pool
- [ ] Extract args into function parameters
- [ ] Return typed report

**Expected signature**:
```typescript
export async function backfillSummarySummaryStubs(opts: {
  dryRun?: boolean;
  apply?: boolean;
  levels?: string[];
}): Promise<SummaryStubsBackfillReport>;
```

### 5. `test-qdrant-connectivity.ts`
**Current**: Standalone test script  
**Target**: Export `testQdrantConnectivity()` function  
**Changes**:
- [ ] Remove shebang
- [ ] Import Qdrant client from adapters
- [ ] Extract test logic into function
- [ ] Return connectivity status object

**Expected signature**:
```typescript
export async function testQdrantConnectivity(opts?: {
  verbose?: boolean;
}): Promise<QdrantConnectivityReport>;

interface QdrantConnectivityReport {
  restAvailable: boolean;
  grpcAvailable: boolean;
  collections: number;
  points: number;
  errors: string[];
}
```

---

## Environment Handling

All modules should use `src/env.ts` instead of local `dotenv.config()`:

```typescript
// In src/env.ts (singleton)
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  QDRANT_URL: process.env.QDRANT_URL,
  REDIS_URL: process.env.REDIS_URL,
  // ... etc
};
```

Then in pipelines:
```typescript
import { env } from '../env.js';
import { pool } from '../adapters/postgres.js';

const client = await pool.connect();
```

---

## Return Value Pattern

All backfill/verify functions should return **structured data** (not just console output):

```typescript
interface BackfillReport {
  mode: 'dry-run' | 'apply';
  timestamp: string;
  duration: number;        // ms
  itemsProcessed: number;
  itemsCreated: number;
  itemsDuplicate: number;
  errors: Array<{ code: string; message: string; context?: any }>;
  summary: {
    status: 'success' | 'partial' | 'failed';
    message: string;
  };
}
```

Callers (CLI, OpenCode, API routes) format output based on their needs:
- CLI: print to console
- OpenCode: return structured result
- API: return JSON response

---

## JSDoc Template

```typescript
/**
 * Verify P1 lineage end-to-end.
 * 
 * Checks that all packets are properly linked to tree nodes, topology index,
 * and summary layers. Reports coverage and identifies gaps.
 * 
 * @param opts - Options object
 * @param opts.verbose - Include detailed per-table output
 * @param opts.client - Optional existing DB client (will create new if not provided)
 * @returns P1 lineage report with coverage metrics
 * @throws {Error} If database query fails
 */
export async function verifyLineage(opts?: {
  verbose?: boolean;
  client?: pg.PoolClient;
}): Promise<P1LineageReport>
```

---

## Backwards Compatibility

Keep `scripts/atlas/*.mjs` originals as **thin wrappers**:

```javascript
// scripts/atlas/verify-p1-lineage.mjs (WRAPPER)
#!/usr/bin/env node

import { verifyLineage } from '../../packages/parent-atlas/dist/pipelines/verify-p1-lineage.js';

const args = {
  verbose: process.argv.includes('--verbose'),
};

await verifyLineage(args)
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
```

**Do NOT delete originals** — CI and user scripts may call them directly.

---

## Phase B Checklist

- [ ] Convert `verify-p1-lineage.ts` to exported function
- [ ] Convert `backfill-tree-nodes.ts` to exported function
- [ ] Convert `backfill-topology-index.ts` to exported function
- [ ] Convert `backfill-summary-stubs.ts` to exported function
- [ ] Convert `test-qdrant-connectivity.ts` to exported function
- [ ] Create `src/env.ts` environment singleton
- [ ] Add return type interfaces to `src/gates/types.ts` or new `src/pipelines/types.ts`
- [ ] Update `src/index.ts` to export all pipeline functions
- [ ] Rebuild parent-atlas: `cd packages/parent-atlas && npm run build`
- [ ] Create wrapper scripts in `scripts/atlas/` for backwards compat
- [ ] Test: `npm run atlas:lineage:verify` still works
- [ ] Test: library imports work from TypeScript code

---

## Success Criteria

- ✅ All 5 pipeline functions exported and typed
- ✅ No top-level script execution in module files
- ✅ Environment config centralized in `src/env.ts`
- ✅ Return types match CLI/OpenCode needs
- ✅ Backwards-compatible wrappers in `scripts/atlas/`
- ✅ Parent-atlas package builds without errors
- ✅ Root npm scripts still work (backwards compat verified)

---

**Owner**: Parent Atlas Module Conversion (Phase B)  
**Last Updated**: June 15, 2026 (Session 66)  
**Next Phase**: Phase C — CLI Integration
