# Phase 1 Completion Report: Glyph Records Storage + Ingestion

**Date:** 2026-05-29
**Status:** ✅ COMPLETE

## Overview

Phase 1 of the glyphs-as-training-data plan successfully implements durable storage for GlyphRecord objects and a complete ingestion pipeline for ACE packet cards.

## Files Created/Modified

### 1. Type Definitions
**File:** `sveltekit-frontend/src/lib/server/types/glyph.ts`
- **Lines Added:** 171-176
- **Change:** Added `SerializedGlyphRecord` type (GlyphRecord without embedding768)
- **Purpose:** Enables JSONB storage in Postgres while keeping raw 768-dim vectors in Qdrant

### 2. Drizzle Schema
**File:** `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`
- **Lines Added:** 4708-4728
- **Table:** `glyphRecords` (pgTable)
- **Columns:**
  - `id` (uuid, PK)
  - `sourceRef` (text, indexed)
  - `glyphKind` (text, indexed)
  - `section` (text)
  - `recordJson` (jsonb, GIN indexed)
  - `centroidId` (integer, indexed)
  - `grpoRewardScore` (real)
  - `somCluster` (integer)
  - `embeddingModel` (text, default 'embeddinggemma:latest')
  - `batchId` (text, indexed)
  - `createdAt` (timestamptz)
- **Indexes:** 5 total (source_ref, glyph_kind, centroid_id, batch_id, record_json GIN)
- **Type Exports:** `GlyphRecord_DB`, `NewGlyphRecord_DB`
- **Cleanup:** Removed 2 duplicate declarations (original lines 405, 3748)

### 3. Manual SQL Migration
**File:** `sveltekit-frontend/drizzle/manual/20260529_glyph_records.sql`
- **Status:** ✅ Created
- **Purpose:** Provides IF NOT EXISTS migration for `glyph_records` table
- **Indexes:** 5 (source_ref, glyph_kind, centroid_id, batch_id, record_json GIN)

### 4. Ingestion Script
**File:** `scripts/atlas/ingest-ace-cards-to-glyphs.mjs`
- **Lines:** 253 total
- **Purpose:** Reads `.opencode/ace-packet.json` and upserts to `glyph_records`
- **Algorithm:**
  1. Load ACE packet (78 cards)
  2. For each selected card:
     - Infer `section` from card content via domain keywords
     - Fetch Qdrant metadata (som_cluster, centroid_id) via HTTP search
     - Build `GlyphRecord` from card data
     - Upsert to Postgres with ON CONFLICT semantics
  3. Report: N written, N skipped, N errors
- **Dependencies:** pg (node-postgres Pool), node-fetch
- **Error Handling:** Graceful degradation (skips missing Qdrant matches, logs warnings)

### 5. NPM Aliases
**File:** `package.json`
- **Lines:** 30-35
- **Aliases Added:**
  ```json
  "atlas:ingest-glyphs": "node scripts/atlas/ingest-ace-cards-to-glyphs.mjs",
  "atlas:compute-rewards": "node scripts/atlas/compute-glyph-rewards.mjs",
  "atlas:sample-training": "node scripts/atlas/sample-glyphs-for-training.mjs",
  "atlas:build-pairs": "node scripts/atlas/glyphs-to-training-pairs.mjs",
  "atlas:smoke-glyphs": "node scripts/atlas/smoke-glyph-pipeline.mjs",
  "atlas:train": "node scripts/atlas/sample-glyphs-for-training.mjs && python scripts/train_lora_adapter.py --dataset scripts/training-datasets/active-sample-latest.jsonl"
  ```

## Verification Checklist

- [x] TypeScript compiles with 0 errors
- [x] Drizzle schema exports resolve without error
- [x] Node.js syntax check passes on ingestion script
- [x] Manual SQL migration uses IF NOT EXISTS
- [x] npm aliases are correctly formatted
- [x] SerializedGlyphRecord type added to glyph.ts
- [x] All duplicate glyphRecords declarations removed

## Next Steps

1. **Apply Migration:** When Docker is running, execute:
   ```bash
   docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260529_glyph_records.sql
   ```

2. **Test Ingestion:** (requires Docker + Postgres + Qdrant up)
   ```bash
   npm run atlas:ingest-glyphs
   ```

3. **Verify:** Query the table:
   ```sql
   SELECT count(*) FROM glyph_records;
   SELECT glyph_kind, count(*) FROM glyph_records GROUP BY glyph_kind;
   SELECT source_ref FROM glyph_records LIMIT 5;
   ```

4. **Phase 2:** Implement `compute-glyph-rewards.mjs` to populate `grpo_reward_score` field

## Key Design Decisions

1. **No embedding768 in Postgres:** The 768-dim vectors stay in Qdrant, only scalar metadata and JSONB record are stored. This keeps rows lean and maintains Qdrant as source-of-truth for vectors.

2. **SerializedGlyphRecord type:** Explicitly types the JSONB column to exclude embedding768, preventing accidental inclusion of large float arrays.

3. **Qdrant HTTP fetch:** The ingestion script queries Qdrant by `source_ref` via HTTP `/points/search` with a filter, avoiding the need for a Qdrant client dependency.

4. **ON CONFLICT semantics:** Upserts are idempotent — re-running the script with the same ACE packet safely updates existing rows.

5. **Async section inference:** Section is inferred from card content (title, compressed text) using regex patterns, not from explicit metadata — improves robustness.

## Files Summary

| File | Lines | Status | Type |
|------|-------|--------|------|
| `src/lib/server/types/glyph.ts` | +6 | ✅ Added | TypeScript type |
| `src/lib/server/db/schema-postgres.ts` | +21 | ✅ Modified | Drizzle schema |
| `drizzle/manual/20260529_glyph_records.sql` | 21 | ✅ Created | SQL migration |
| `scripts/atlas/ingest-ace-cards-to-glyphs.mjs` | 253 | ✅ Created | Node.js script |
| `package.json` | +6 | ✅ Modified | npm aliases |

**Total changes:** 307 lines added, 48 lines of duplicates removed, 0 breaking changes.
