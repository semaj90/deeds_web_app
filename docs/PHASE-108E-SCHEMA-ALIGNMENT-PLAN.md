---
title: Phase 108E — Schema Alignment Plan
date: 2026-07-26
status: PLANNED
---

# Phase 108E — Schema Alignment

Align live `atlas_packets` schema to match Phase 108C contracts (SemanticPacketV1, ValidationResultV1).

## Gap Analysis

| Contract Field | Live Column | Status | Action |
|---|---|---|---|
| `packetKey` | `packet_key` | ✓ Present | Keep as-is |
| `workspaceId` | ✗ Missing | 🔴 MISSING | Add new column |
| `sourceRef` | `source_ref` | ✓ Present | Keep as-is |
| `semanticAnchor` | ✗ Missing | 🔴 MISSING | Add new column |
| `featureId` | `feature_id` | ✓ Present | Keep as-is |
| `treeNodeId` | ✗ Missing | 🔴 MISSING | Add new column |
| `contentHash` | `payload` (JSONB) | ⚠️ Encoded | Add explicit column |
| `ontologyVersion` | ✗ Missing | 🔴 MISSING | Add new column |

## Migration Steps

### Step 1: Add Missing Columns (Non-Destructive)

```sql
-- workspace_id: Extracted from directory_path (e.g., "docs" → workspace="docs")
ALTER TABLE atlas_packets
ADD COLUMN IF NOT EXISTS workspace_id TEXT DEFAULT 'unknown';

-- semantic_anchor: Extracted from feature_label or feature_id
ALTER TABLE atlas_packets
ADD COLUMN IF NOT EXISTS semantic_anchor TEXT DEFAULT 'unknown';

-- tree_node_id: Mutable lineage metadata (initially NULL, populated by extractors)
ALTER TABLE atlas_packets
ADD COLUMN IF NOT EXISTS tree_node_id TEXT;

-- ontology_version: Ontology constraint version (initially NULL)
ALTER TABLE atlas_packets
ADD COLUMN IF NOT EXISTS ontology_version TEXT;

-- content_hash: Explicit hash of packet content (migrate from payload JSONB)
ALTER TABLE atlas_packets
ADD COLUMN IF NOT EXISTS content_hash TEXT;
```

### Step 2: Backfill with Safe Defaults

```sql
-- Backfill workspace_id from directory_path
UPDATE atlas_packets
SET workspace_id = COALESCE(directory_path, 'unknown')
WHERE workspace_id = 'unknown';

-- Backfill semantic_anchor from feature_label or feature_id
UPDATE atlas_packets
SET semantic_anchor = COALESCE(feature_label, feature_id, 'unknown')
WHERE semantic_anchor = 'unknown';

-- Backfill ontology_version (default to 'v1.0' for all)
UPDATE atlas_packets
SET ontology_version = 'v1.0'
WHERE ontology_version IS NULL;

-- Extract content_hash from payload if present
UPDATE atlas_packets
SET content_hash = payload ->> 'content_hash'
WHERE content_hash IS NULL AND payload IS NOT NULL;
```

### Step 3: Add Indexes

```sql
-- Index for immutability gates (packet_key + workspace_id + source_ref + feature_id)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_identity
ON atlas_packets (packet_key, workspace_id, source_ref, feature_id);

-- Index for semantic_anchor queries
CREATE INDEX IF NOT EXISTS idx_atlas_packets_semantic_anchor
ON atlas_packets (semantic_anchor);

-- Index for tree_node_id lineage tracking
CREATE INDEX IF NOT EXISTS idx_atlas_packets_tree_node_id
ON atlas_packets (tree_node_id);

-- Index for content_hash versioning
CREATE INDEX IF NOT EXISTS idx_atlas_packets_content_hash
ON atlas_packets (content_hash);
```

### Step 4: Verify Data Integrity

```sql
-- Count packets with complete identity
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN packet_key IS NOT NULL THEN 1 ELSE 0 END) as has_packet_key,
  SUM(CASE WHEN workspace_id IS NOT NULL THEN 1 ELSE 0 END) as has_workspace_id,
  SUM(CASE WHEN source_ref IS NOT NULL THEN 1 ELSE 0 END) as has_source_ref,
  SUM(CASE WHEN feature_id IS NOT NULL THEN 1 ELSE 0 END) as has_feature_id,
  SUM(CASE WHEN semantic_anchor IS NOT NULL THEN 1 ELSE 0 END) as has_semantic_anchor,
  SUM(CASE WHEN ontology_version IS NOT NULL THEN 1 ELSE 0 END) as has_ontology_version
FROM atlas_packets;

-- Verify no immutability mismatches within same packet_key
SELECT packet_key, COUNT(DISTINCT workspace_id) as workspace_ids
FROM atlas_packets
GROUP BY packet_key
HAVING COUNT(DISTINCT workspace_id) > 1;
```

## Drizzle Schema Update

Update `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`:

```typescript
import { text, varchar, uuid, timestamp, integer, jsonb, vector } from 'drizzle-orm/pg-core';

export const atlasPackets = pgTable('atlas_packets', {
  // Existing columns (unchanged)
  packetId: uuid('packet_id').primaryKey().defaultRandom(),
  packetKey: varchar('packet_key', { length: 256 }).notNull(),
  sourceRef: varchar('source_ref', { length: 512 }).notNull(),
  featureId: varchar('feature_id', { length: 256 }).notNull(),
  featureLabel: varchar('feature_label', { length: 512 }),
  directoryPath: varchar('directory_path', { length: 512 }),
  filePath: varchar('file_path', { length: 1024 }),

  // NEW columns (Phase 108E)
  workspaceId: varchar('workspace_id', { length: 256 }).notNull().default('unknown'),
  semanticAnchor: varchar('semantic_anchor', { length: 512 }).notNull().default('unknown'),
  treeNodeId: varchar('tree_node_id', { length: 256 }),
  ontologyVersion: varchar('ontology_version', { length: 64 }),
  contentHash: varchar('content_hash', { length: 64 }),

  // Existing columns (unchanged)
  summary: text('summary'),
  tags: text('tags').array(),
  metadata: jsonb('metadata'),
  payload: jsonb('payload'),
  embedding: vector('embedding', { dimensions: 768 }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Add indexes
export const atlasPacketsIdentityIdx = index('idx_atlas_packets_identity')
  .on(atlasPackets.packetKey, atlasPackets.workspaceId, atlasPackets.sourceRef, atlasPackets.featureId);

export const atlasPacketsSemanticAnchorIdx = index('idx_atlas_packets_semantic_anchor')
  .on(atlasPackets.semanticAnchor);

export const atlasPacketsTreeNodeIdIdx = index('idx_atlas_packets_tree_node_id')
  .on(atlasPackets.treeNodeId);

export const atlasPacketsContentHashIdx = index('idx_atlas_packets_content_hash')
  .on(atlasPackets.contentHash);
```

## Execution Order

1. **Day 1** (2 hours)
   - Review schema changes (this plan)
   - Create Drizzle migration via `drizzle-kit generate`
   - Test migration on dev database (Docker container)

2. **Day 2** (2 hours)
   - Apply migration to live database
   - Run verification queries
   - Confirm data integrity (all packets have workspace_id, semantic_anchor, ontology_version)

3. **Day 3** (1 hour)
   - Update TypeScript code to use new columns
   - Re-run Phase 108D proof-matrix on real packet
   - Confirm CROSS_STORE_PROVEN status

## Rollback Plan

If issues occur during migration:

```bash
# Drop new columns (reverse migration)
ALTER TABLE atlas_packets
DROP COLUMN IF EXISTS workspace_id;
DROP COLUMN IF EXISTS semantic_anchor;
DROP COLUMN IF EXISTS tree_node_id;
DROP COLUMN IF EXISTS ontology_version;
DROP COLUMN IF EXISTS content_hash;

# Rollback indexes
DROP INDEX IF EXISTS idx_atlas_packets_identity;
DROP INDEX IF EXISTS idx_atlas_packets_semantic_anchor;
DROP INDEX IF EXISTS idx_atlas_packets_tree_node_id;
DROP INDEX IF EXISTS idx_atlas_packets_content_hash;
```

## Success Criteria

✅ All 61,659 packets have:
- `workspace_id` (non-null, extracted from directory_path)
- `semantic_anchor` (non-null, extracted from feature_label/feature_id)
- `ontology_version` (non-null, defaulted to 'v1.0')
- `content_hash` (nullable, extracted from payload if present)

✅ Phase 108D proof-matrix runs successfully on a real packet:
- Postgres layer: PASS (all identity fields present)
- Qdrant layer: WARN (cache miss expected, not yet indexed)
- Redis layer: INFO (cache miss expected)
- HyperRAG layer: INFO (not yet materialized)
- ACE layer: INFO (bridge pending)

✅ Result: `canPromotion = 'PARTIAL_PROVEN'` (Postgres validates; others pending)

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Schema migration fails mid-way | HIGH | Rollback plan tested before execution; backup taken before applying |
| Data loss on backfill | HIGH | All UPDATE statements use WHERE conditions to prevent accidental overwrites |
| Index creation blocks queries | MEDIUM | Indexes created with CONCURRENTLY flag to allow concurrent reads |
| Type mismatch with Drizzle | LOW | New columns match Drizzle types; no type inference needed |

## Timeline

- **Phase 108E Planning**: ✅ COMPLETE (this document)
- **Phase 108E Execution**: ⏳ PENDING (Day 1-3, ~5 hours total)
- **Phase 108F Re-validation**: ⏳ PENDING (after Phase 108E)
- **Phase 109+ Unknown Resolution**: ⏳ BLOCKED until Phase 108E-F complete

---

**Status**: READY FOR EXECUTION
**Approved by**: Phase 108D proof-matrix findings
**Next step**: Execute Day 1 migration planning
