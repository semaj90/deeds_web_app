# ☑️ Day 1 Execution Checklist - Database Foundation

**Date**: 2025-12-03
**Goal**: Safely add YoRHa v2 tables to production database
**Time Estimate**: 2-3 hours

---

## Pre-Flight Checks

### ✅ Environment Verification
```bash
# 1. Check Docker services are running
docker-compose -f docker-compose.full.yml ps

# Expected: postgres, redis, minio, qdrant, ollama all "Up"

# 2. Test database connection
psql -h localhost -U postgres -d deeds_db -c "SELECT version();"

# Expected: PostgreSQL 17.x

# 3. Check existing tables
psql -h localhost -U postgres -d deeds_db -c "\dt" | wc -l

# Expected: ~50-100 tables (note the count)
```

---

## Step 1: Backup Database (CRITICAL)

### Command
```bash
# Create backup directory
mkdir -p backups/

# Backup database
pg_dump -h localhost -U postgres -d deeds_db -F c -f backups/pre_yorha_$(date +%Y%m%d_%H%M%S).backup

# Verify backup
ls -lh backups/
```

### Success Criteria
- [ ] Backup file created
- [ ] File size > 1MB (should contain data)
- [ ] No errors in output

### Rollback Plan
If anything goes wrong later:
```bash
# Stop app
docker-compose down

# Restore
pg_restore -h localhost -U postgres -d deeds_db -c backups/pre_yorha_20251203_*.backup

# Restart
docker-compose up -d
```

---

## Step 2: Review YoRHa Schema

### View the migration file
```bash
cat sveltekit-frontend/drizzle/migrations/0001_yorha_schema.sql
```

### Verify it's safe
Check for:
- [x] Only `CREATE TABLE IF NOT EXISTS` statements
- [x] No `DROP TABLE` statements
- [x] No `TRUNCATE` statements
- [x] No `ALTER TABLE ... DROP COLUMN` statements

**Result**: ✅ File is SAFE (confirmed earlier)

---

## Step 3: Apply YoRHa Schema

### Command
```bash
cd sveltekit-frontend

# Apply migration
psql -h localhost -U postgres -d deeds_db -f drizzle/migrations/0001_yorha_schema.sql

# Check for errors
# Expected: 6 CREATE TABLE statements, 13 CREATE INDEX statements
```

### Expected Output
```
CREATE TABLE
CREATE INDEX
CREATE INDEX
...
(19 CREATE statements total)
```

### Success Criteria
- [ ] No ERROR messages
- [ ] All CREATE statements succeeded
- [ ] No warnings about existing tables (IF NOT EXISTS protects us)

---

## Step 4: Verify New Tables

### List YoRHa tables
```bash
psql -h localhost -U postgres -d deeds_db -c "\dt yorha_*"
```

### Expected Output
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
(6 rows)
```

### Success Criteria
- [ ] 6 tables created
- [ ] All named `yorha_*`
- [ ] Owner is `postgres`

---

## Step 5: Verify Indexes

### List indexes
```bash
psql -h localhost -U postgres -d deeds_db -c "\di yorha_*"
```

### Expected Count
- 13 indexes total across the 6 tables

### Success Criteria
- [ ] All indexes created
- [ ] No index creation errors

---

## Step 6: Test Basic CRUD

### Insert test case
```bash
psql -h localhost -U postgres -d deeds_db << 'EOF'
-- Get a user ID for testing
DO $$
DECLARE
  test_user_id UUID;
BEGIN
  -- Use existing user or create temp one
  SELECT id INTO test_user_id FROM users LIMIT 1;

  IF test_user_id IS NULL THEN
    -- Create temp test user if none exist
    INSERT INTO users (email, username, password_hash)
    VALUES ('test@yorha.local', 'yorha_test', 'temp')
    RETURNING id INTO test_user_id;
  END IF;

  -- Insert test case
  INSERT INTO yorha_cases (
    case_number,
    title,
    description,
    created_by
  ) VALUES (
    'TEST-YORHA-001',
    'YoRHa Migration Test Case',
    'Test case created to verify YoRHa schema migration',
    test_user_id
  );

  RAISE NOTICE 'Test case created successfully';
END $$;
EOF
```

### Verify test data
```bash
psql -h localhost -U postgres -d deeds_db -c "SELECT case_number, title, status FROM yorha_cases WHERE case_number = 'TEST-YORHA-001';"
```

### Expected Output
```
   case_number    |            title             | status
------------------+------------------------------+--------
 TEST-YORHA-001   | YoRHa Migration Test Case    | active
(1 row)
```

### Success Criteria
- [ ] Test case inserted
- [ ] Default status = 'active'
- [ ] Timestamps auto-generated
- [ ] Foreign key to users works

---

## Step 7: Update Drizzle ORM Schema

### Create YoRHa schema file
```bash
# Location
touch sveltekit-frontend/src/lib/db/schema/yorha.ts
```

### Add schema definitions
```typescript
// src/lib/db/schema/yorha.ts
import { pgTable, uuid, varchar, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const yorhaCases = pgTable('yorha_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseNumber: varchar('case_number', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),
  caseType: varchar('case_type', { length: 100 }),
  jurisdiction: varchar('jurisdiction', { length: 200 }),
  filedDate: timestamp('filed_date', { withTimezone: true }),
  closedDate: timestamp('closed_date', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  assignedTo: uuid('assigned_to').references(() => users.id),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const yorhaEvidenceNodes = pgTable('yorha_evidence_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => yorhaCases.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  evidenceType: varchar('evidence_type', { length: 100 }).notNull(),
  positionX: integer('position_x').default(0),
  positionY: integer('position_y').default(0),
  color: varchar('color', { length: 20 }).default('blue'),
  icon: varchar('icon', { length: 100 }),
  source: varchar('source', { length: 500 }),
  dateCollected: timestamp('date_collected', { withTimezone: true }),
  relevanceScore: integer('relevance_score').default(0),
  filePath: varchar('file_path', { length: 1000 }),
  fileType: varchar('file_type', { length: 100 }),
  fileSize: integer('file_size'),
  aiSummary: text('ai_summary'),
  aiTags: jsonb('ai_tags'),
  keyEntities: jsonb('key_entities'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// ... other tables (evidence_connections, chat_sessions, chat_messages, system_metrics)
```

### Export from main schema
```typescript
// src/lib/db/schema/index.ts
export * from './yorha';
```

### Success Criteria
- [ ] TypeScript compiles
- [ ] Drizzle can import schema
- [ ] No type errors

---

## Step 8: Test with Drizzle

### Create test query file
```typescript
// test/yorha-test.ts
import { db } from '$lib/db';
import { yorhaCases } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

const testCase = await db
  .select()
  .from(yorhaCases)
  .where(eq(yorhaCases.caseNumber, 'TEST-YORHA-001'))
  .limit(1);

console.log('Test case:', testCase);
```

### Run test
```bash
npx tsx test/yorha-test.ts
```

### Success Criteria
- [ ] Query executes
- [ ] Test case returned
- [ ] Type safety working

---

## Step 9: Verify Existing Tables Intact

### Check key tables
```bash
psql -h localhost -U postgres -d deeds_db << 'EOF'
-- Count records in critical tables
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'evidence', COUNT(*) FROM evidence
UNION ALL
SELECT 'legal_documents', COUNT(*) FROM legal_documents
UNION ALL
SELECT 'citations', COUNT(*) FROM citations;
EOF
```

### Success Criteria
- [ ] All counts match pre-migration values
- [ ] No data lost
- [ ] No tables dropped

---

## Step 10: Update Documentation

### Update schema docs
```bash
# Generate schema diagram
npx drizzle-kit introspect:pg

# Update README
echo "## YoRHa v2 Tables Added - $(date +%Y-%m-%d)" >> docs/CHANGELOG.md
```

### Success Criteria
- [ ] Changelog updated
- [ ] Schema diagram generated
- [ ] Documentation reflects new tables

---

## Final Verification Checklist

### Database
- [ ] Backup created and saved
- [ ] 6 new `yorha_*` tables exist
- [ ] 13 indexes created
- [ ] Foreign keys working
- [ ] Test data inserted successfully
- [ ] Existing tables intact (no data loss)

### Code
- [ ] Drizzle schema updated
- [ ] TypeScript compiles
- [ ] Test queries work
- [ ] No type errors

### Documentation
- [ ] Changelog updated
- [ ] Phase 90 docs linked
- [ ] Next steps documented

---

## Post-Migration Steps

### Cleanup test data
```bash
psql -h localhost -U postgres -d deeds_db -c "DELETE FROM yorha_cases WHERE case_number = 'TEST-YORHA-001';"
```

### Update NES Command Center
```bash
# Add YoRHa tables to health check API
# Location: src/routes/api/infrastructure/health/+server.ts
```

### Communicate success
```bash
# Post to team channel
echo "✅ YoRHa v2 schema migration completed successfully"
echo "- 6 tables added"
echo "- 0 tables dropped"
echo "- 0 data lost"
```

---

## Troubleshooting

### Error: "relation yorha_cases already exists"
**Solution**: Tables already created, skip to Step 4 (verify)

### Error: "permission denied"
**Solution**: Use correct PostgreSQL user:
```bash
psql -U postgres -h localhost -d deeds_db
```

### Error: "database deeds_db does not exist"
**Solution**: Update database name in connection:
```bash
psql -U postgres -h localhost -l  # list databases
# Use correct DB name
```

### Error: Foreign key violation
**Solution**: Ensure users table has at least one user:
```sql
SELECT COUNT(*) FROM users;
```

---

## Rollback Procedure

If anything fails:

1. **Stop application**
   ```bash
   docker-compose down
   ```

2. **Restore backup**
   ```bash
   pg_restore -h localhost -U postgres -d deeds_db -c backups/pre_yorha_*.backup
   ```

3. **Restart**
   ```bash
   docker-compose up -d
   ```

4. **Verify restoration**
   ```bash
   psql -h localhost -U postgres -d deeds_db -c "\dt" | wc -l
   # Should match pre-migration count
   ```

---

## Success Metrics

At end of Day 1:
- ✅ Database backed up
- ✅ 6 YoRHa tables created
- ✅ 0 existing tables affected
- ✅ Drizzle schema updated
- ✅ Test CRUD working
- ✅ Documentation updated

---

**Estimated Time**: 2-3 hours
**Risk Level**: 🟢 LOW (additive migration only)
**Next**: Day 2 - Route Consolidation Sprint
