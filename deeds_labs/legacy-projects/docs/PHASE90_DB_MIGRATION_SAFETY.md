# Phase 90 - Safe Database Migration Strategy

**Date**: 2025-12-03
**Goal**: Add YoRHa v2 schema WITHOUT destroying existing data
**Risk Level**: 🟢 LOW (if following this guide)

---

## 🎯 Migration Philosophy: Additive Only

**Rule #1**: Never drop production tables
**Rule #2**: New tables = new namespace (`yorha_*`)
**Rule #3**: Keep legacy data until it's migrated and verified

---

## ✅ Safe Migration: YoRHa v2 Schema

### What We're Adding (ALL SAFE):

**New Tables** (5 total):
- `yorha_cases` - Case management
- `yorha_evidence_nodes` - Evidence board nodes
- `yorha_evidence_connections` - Evidence relationships
- `yorha_chat_sessions` - Case chat sessions
- `yorha_chat_messages` - Chat message history
- `yorha_system_metrics` - Performance monitoring

**Why This Is Safe**:
- ✅ All tables use `IF NOT EXISTS`
- ✅ No DROP statements
- ✅ No ALTER existing tables
- ✅ No truncate existing data
- ✅ Foreign keys reference existing `users` table (non-destructive)

### File to Run:
```bash
# THIS IS SAFE - It only creates new tables
psql -f sveltekit-frontend/drizzle/migrations/0001_yorha_schema.sql
```

---

## ❌ Dangerous Migrations (DO NOT RUN)

### Files to AVOID or EDIT First:

1. **`0008_clammy_frightful_four.sql`** - Contains:
   ```sql
   DROP TABLE "code_embeddings" CASCADE;
   DROP TABLE "knowledge_base" CASCADE;
   DROP TABLE "legal_analysis_cache" CASCADE;
   DROP TABLE "rag_documents" CASCADE;
   DROP TABLE "vector_similarity_queries" CASCADE;
   ```
   **Risk**: Destroys knowledge graph and vector data

2. **`20250910183346_fearless_mercury.sql`** - Contains:
   ```sql
   DROP TABLE "evidence" CASCADE;
   DROP TABLE "users" CASCADE;
   DROP TABLE "legal_documents" CASCADE;
   DROP TABLE "citations" CASCADE;
   ```
   **Risk**: Destroys ALL core legal data

3. **`20251025072351_rare_jane_foster.sql`** - Contains:
   ```sql
   DROP TABLE "error_logs" CASCADE;
   DROP TABLE "ai_engine_status" CASCADE;
   ```
   **Risk**: Loses system monitoring history

---

## 🛡️ How to Make Dangerous Migrations Safe

### Option 1: Comment Out Dangerous Parts

Edit the SQL file and wrap dangerous statements in comments:

```sql
-- DANGEROUS - Commented out for safety
-- DROP TABLE "knowledge_base" CASCADE;
-- DROP TABLE "code_embeddings" CASCADE;
-- DROP TABLE "rag_documents" CASCADE;

-- KEEP THIS - Safe new table creation
CREATE TABLE IF NOT EXISTS new_feature (
  id UUID PRIMARY KEY,
  ...
);
```

### Option 2: Extract Safe Parts to New File

1. Copy the `CREATE TABLE` statements to a new file:
   ```bash
   cp dangerous_migration.sql safe_migration_v2.sql
   ```

2. Remove all:
   - `DROP TABLE ... CASCADE`
   - `ALTER TABLE ... DROP COLUMN`
   - `TRUNCATE TABLE`

3. Run the sanitized version

### Option 3: Backup First (MANDATORY)

```bash
# Always backup before ANY migration
pg_dump -h localhost -U postgres deeds_db > backup_$(date +%Y%m%d_%H%M%S).sq

l

# If things go wrong:
psql -h localhost -U postgres deeds_db < backup_20251203_111852.sql
```

---

## 📊 Current Database State

### Existing Tables (DO NOT DROP):
- `users` - User accounts **[CRITICAL]**
- `evidence` - Legal evidence **[CRITICAL]**
- `legal_documents` - Document repository **[CRITICAL]**
- `citations` - Legal citations **[CRITICAL]**
- `knowledge_base` - Knowledge graph **[KEEP]**
- `code_embeddings` - Vector embeddings **[KEEP]**
- `rag_documents` - RAG system **[KEEP]**

### New YoRHa Tables (SAFE TO ADD):
- `yorha_cases` ✅
- `yorha_evidence_nodes` ✅
- `yorha_evidence_connections` ✅
- `yorha_chat_sessions` ✅
- `yorha_chat_messages` ✅
- `yorha_system_metrics` ✅

### Data Flow:
```
Old System:                    New YoRHa System:
evidence                  →    yorha_evidence_nodes
  ↓                              ↓
legal_documents           →    yorha_cases
  ↓                              ↓
citations                 →    yorha_evidence_connections

BOTH CAN COEXIST!
```

---

## 🚀 Step-by-Step Safe Migration

### Step 1: Backup
```bash
cd c:/Users/james/Videos/deeds-web-app
pg_dump -h localhost -U postgres -d deeds_db > backups/pre_yorha_migration_$(date +%Y%m%d).sql
```

### Step 2: Apply YoRHa Schema (Safe)
```bash
cd sveltekit-frontend
psql -h localhost -U postgres -d deeds_db -f drizzle/migrations/0001_yorha_schema.sql
```

### Step 3: Verify New Tables
```bash
psql -h localhost -U postgres -d deeds_db -c "\dt yorha_*"
```

Expected output:
```
                   List of relations
 Schema |             Name              | Type  |  Owner
--------+-------------------------------+-------+----------
 public | yorha_cases                   | table | postgres
 public | yorha_chat_messages           | table | postgres
 public | yorha_chat_sessions           | table | postgres
 public | yorha_evidence_connections    | table | postgres
 public | yorha_evidence_nodes          | table | postgres
 public | yorha_system_metrics          | table | postgres
```

### Step 4: Test With Sample Data
```sql
-- Insert test case
INSERT INTO yorha_cases (case_number, title, created_by)
VALUES ('TEST-001', 'Migration Test Case', (SELECT id FROM users LIMIT 1));

-- Verify
SELECT * FROM yorha_cases WHERE case_number = 'TEST-001';
```

### Step 5: Update Drizzle Schema
```bash
npm run db:push  # Apply schema to code
npm run db:studio  # Verify in Drizzle Studio
```

---

## 🔄 Data Migration Plan (Optional)

IF you want to migrate old evidence to YoRHa:

```sql
-- Migrate existing evidence to yorha_evidence_nodes
INSERT INTO yorha_evidence_nodes (
  case_id,
  title,
  description,
  evidence_type,
  source,
  created_by,
  created_at
)
SELECT
  c.id,
  e.title,
  e.description,
  e.type,
  e.source,
  e.created_by,
  e.created_at
FROM evidence e
JOIN yorha_cases c ON c.case_number = e.case_reference
WHERE NOT EXISTS (
  SELECT 1 FROM yorha_evidence_nodes yen
  WHERE yen.title = e.title AND yen.case_id = c.id
);
```

**Do this AFTER YoRHa is working!**

---

## 📝 Drizzle Schema Coordination

### Update Your `schema.ts`:

```typescript
// src/lib/db/schema/yorha.ts (NEW FILE)
export const yorhaCases = pgTable('yorha_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseNumber: varchar('case_number', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// ... other yorha tables
```

---

## ⚠️ What NOT To Do

### ❌ DO NOT Run These Commands:
```sql
-- DANGER: Destroys all evidence
DROP TABLE evidence CASCADE;

-- DANGER: Destroys user accounts
DROP TABLE users CASCADE;

-- DANGER: Destroys knowledge graph
DROP TABLE knowledge_base CASCADE;

-- DANGER: Destroys vector embeddings
DROP TABLE code_embeddings CASCADE;
```

### ❌ DO NOT Edit These Files Without Backup:
- `0008_clammy_frightful_four.sql`
- `20250910183346_fearless_mercury.sql`
- `20251025072351_rare_jane_foster.sql`

---

## 🎯 Success Criteria

After migration, you should have:
- ✅ All 6 new `yorha_*` tables
- ✅ All existing tables intact
- ✅ No data loss
- ✅ Foreign keys working
- ✅ Indexes created
- ✅ Drizzle schema updated

---

## 🆘 Rollback Plan

If anything goes wrong:

```bash
# 1. Stop the app
docker-compose down

# 2. Restore from backup
psql -h localhost -U postgres -d deeds_db < backups/pre_yorha_migration_20251203.sql

# 3. Verify data
psql -h localhost -U postgres -d deeds_db -c "SELECT count(*) FROM users;"
psql -h localhost -U postgres -d deeds_db -c "SELECT count(*) FROM evidence;"

# 4. Restart app
docker-compose up -d
```

---

## 📚 Related Documentation

- `drizzle/migrations/0001_yorha_schema.sql` - Safe YoRHa migration ✅
- `docs/DATABASE_SCHEMA.md` - Full schema documentation
- `docs/PHASE72_GPU_PIPELINE.md` - Error fixing workflow
- `docs/PRODUCTION_CONSOLIDATION_PLAN.md` - Route consolidation

---

**Status**: ✅ YoRHa schema is SAFE to apply
**Risk**: 🟢 LOW (additive only, no drops)
**Next**: Run `0001_yorha_schema.sql` and test
