# Drizzle ORM: Safe Migration & Seeding Guide
**Date:** 2025-12-07
**Status:** ✅ Successfully Migrated & Seeded Evidence Schema

---

## 🚀 Execution Summary (What We Just Did)

### 1. Database State
- **Tables Created:** `evidence`, `evidence_relationships`, `timeline_events`, `graph_nodes`, `graph_edges`
- **Enums Patched:** `evidence_type` updated with `video`, `document`, etc.
- **Data Seeded:** Demo case "YoRHa vs Machines" (UUID: `3f9e...`) seeded with complete evidence graph.

### 2. Frontend Integration
The following routes are now wired to the seeded backend data:
- `http://localhost:5173/evidence` (Evidence Board)
- `http://localhost:5173/timeline` (Timeline View)
- `http://localhost:5173/graph` (Relationship Graph)

---

## 🛡️ Guide: Safe, Non-Destructive Migrations

For future updates (where `DROP TABLE` is not an option), follow this pattern to safely evolve the schema and seed data idempotently.

### A. Adding Tables Safely (SQL)

Use `IF NOT EXISTS` for all create statements.

```sql
-- 1. Create Enums safely (Postgres doesn't support IF NOT EXISTS for types directly)
DO $$ BEGIN
    CREATE TYPE evidence_type AS ENUM ('video', 'document');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Table safely
CREATE TABLE IF NOT EXISTS evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL
);

-- 3. Add Columns to Existing Table safely
DO $$ BEGIN
    ALTER TABLE evidence ADD COLUMN IF NOT EXISTS notes TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;
```

### B. Seeding Data Safely (TypeScript)

Use `.onConflictDoNothing()` or `.onConflictDoUpdate()` to prevent errors when running seed scripts multiple times.

**Pattern:**
```typescript
import { evidence } from '$lib/db/schema/evidence';

// 1. Define static IDs for idempotency
const DEMO_CASE_ID = '3f9e8756-4c22-4d56-b092-233918076634';
const EVIDENCE_ID_1 = 'd5ebe81f-a1a4-474e-a0cf-999d91461f3f';

// 2. Insert with conflict handling
await db.insert(evidence)
  .values({
    id: EVIDENCE_ID_1,
    caseId: DEMO_CASE_ID,
    evidenceNumber: 'EV-001',
    title: 'Security Footage',
    type: 'video'
  })
  .onConflictDoUpdate({
    target: evidence.id,
    set: {
      // Only update fields that might change
      title: 'Security Footage',
      updatedAt: new Date()
    }
  });
  // OR just .onConflictDoNothing() to skip if exists
```

### C. Drizzle Config for Safe Push

In `drizzle.config.ts`, standard push can be dangerous. Always inspect:

```bash
# Check what will happen before applying
npx drizzle-kit push --verbose --check
```

### D. Phase 90 Protocol (Production Safe)

1.  **Snapshot:** `npm run db:snapshot-before`
2.  **Verify:** Check `drizzle` folder for manual SQL safety.
3.  **Migrate:** Run migration.
4.  **Verify:** `npm run db:compare-snapshots`

---

## ⚠️ Lessons from Today

To resolve the legacy schema conflict (where `evidence` table existed with incompatible columns), we used the **Cleaner approach**:
```sql
DROP TABLE IF EXISTS evidence CASCADE;
```
This was acceptable for **Phase 14 (Dev)** but **NEVER** use this in Production (Phase 98/99). Always use the `ALTER TABLE` pattern described in Section A above.
