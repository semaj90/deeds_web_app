# 🔒 Safe Database Migration Guide - Preserving Existing Data

**Status**: ⚠️ Data conflicts detected - Follow this guide to migrate safely

---

## ⚠️ Issues Detected

```
Data Loss Warnings:
  ✗ Tables to be deleted: 9 tables with data
  ✗ Columns to be dropped: 40+ columns with data
  ✗ Permission errors: error_logs table ownership

Data at Risk:
  - cases (6 items)
  - rag_documents (3 items)
  - evidence (7 items)
  - knowledge_base (344 items)
  - And 5 more tables with historical data
```

---

## 📋 Safe Migration Strategy

### Option 1: Preserve All Data (RECOMMENDED)

```bash
# Step 1: Back up the database
PGPASSWORD=123456 pg_dump -h localhost -U legal_admin -d legal_ai_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Step 2: Create archive tables for existing data
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << 'EOF'
-- Archive existing tables before migration
CREATE TABLE IF NOT EXISTS archive_cases AS SELECT * FROM cases;
CREATE TABLE IF NOT EXISTS archive_evidence AS SELECT * FROM evidence;
CREATE TABLE IF NOT EXISTS archive_knowledge_base AS SELECT * FROM knowledge_base;
CREATE TABLE IF NOT EXISTS archive_rag_documents AS SELECT * FROM rag_documents;
CREATE TABLE IF NOT EXISTS archive_knowledge_graphs AS SELECT * FROM knowledge_graphs;
CREATE TABLE IF NOT EXISTS archive_case_embeddings AS SELECT * FROM case_embeddings;
CREATE TABLE IF NOT EXISTS archive_evidence_vectors AS SELECT * FROM evidence_vectors;
CREATE TABLE IF NOT EXISTS archive_legal_documents_extracted AS SELECT * FROM legal_documents_extracted;
CREATE TABLE IF NOT EXISTS archive_vector_embeddings AS SELECT * FROM vector_embeddings;

-- Log archive creation
SELECT 'Archived ' || COUNT(*) || ' records' FROM archive_cases;
SELECT 'Archived ' || COUNT(*) || ' records' FROM archive_evidence;
EOF

# Step 3: Fix permissions
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << 'EOF'
-- Fix table ownership issues
ALTER TABLE IF EXISTS error_logs OWNER TO legal_admin;
ALTER TABLE IF EXISTS chat_sessions OWNER TO legal_admin;
ALTER TABLE IF EXISTS knowledge_graphs OWNER TO legal_admin;
ALTER TABLE IF EXISTS evidence_connections OWNER TO legal_admin;

-- Grant all permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO legal_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
EOF

# Step 4: Generate migration (dry-run first)
npx drizzle-kit generate --name preserve_data --dry

# Step 5: Review migration file
# Check: sveltekit-frontend/drizzle/migrations/[timestamp]_preserve_data.sql

# Step 6: Apply migration carefully
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db -f sveltekit-frontend/drizzle/migrations/0001_*.sql
```

---

### Option 2: Fresh Start (Data Loss - Use Only If Needed)

⚠️ **WARNING**: This will DELETE all existing data

```bash
# Only if you want a complete reset:
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << 'EOF'
-- Drop all existing tables (DANGEROUS!)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Then apply migrations
EOF

npm run db:push
```

---

## 🔧 Step-by-Step Safe Migration

### Step 1: Backup Database

```bash
# Full backup
PGPASSWORD=123456 pg_dump -h localhost -U legal_admin -d legal_ai_db \
  --no-privileges --no-owner > backup_$(date +%Y%m%d).sql

# Verify backup
ls -lh backup_*.sql
wc -l backup_*.sql  # Check file size
```

### Step 2: Check Current Tables

```bash
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db -c "\dt"
```

Expected output:
```
               List of relations
 Schema |        Name         | Type  |    Owner
────────┼─────────────────────┼───────┼─────────────
 public | cases               | table | legal_admin
 public | evidence            | table | legal_admin
 public | knowledge_base      | table | legal_admin
 public | rag_documents       | table | legal_admin
 ... (more tables)
```

### Step 3: Create Archive Tables

```bash
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << 'EOF'
-- Create archive tables with timestamp
CREATE TABLE archive_cases_20251024 AS
  SELECT * FROM cases;

CREATE TABLE archive_evidence_20251024 AS
  SELECT * FROM evidence;

CREATE TABLE archive_knowledge_base_20251024 AS
  SELECT * FROM knowledge_base;

CREATE TABLE archive_rag_documents_20251024 AS
  SELECT * FROM rag_documents;

-- Verify archives created
SELECT 'cases: ' || COUNT(*) FROM archive_cases_20251024
UNION ALL
SELECT 'evidence: ' || COUNT(*) FROM archive_evidence_20251024
UNION ALL
SELECT 'knowledge_base: ' || COUNT(*) FROM archive_knowledge_base_20251024
UNION ALL
SELECT 'rag_documents: ' || COUNT(*) FROM archive_rag_documents_20251024;
EOF
```

### Step 4: Fix Permissions

```bash
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << 'EOF'
-- Fix ownership issues
ALTER TABLE error_logs OWNER TO legal_admin;
ALTER TABLE chat_sessions OWNER TO legal_admin;
ALTER TABLE knowledge_graphs OWNER TO legal_admin;
ALTER TABLE evidence_connections OWNER TO legal_admin;
ALTER TABLE legal_topics OWNER TO legal_admin;
ALTER TABLE legal_entities OWNER TO legal_admin;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO legal_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
GRANT USAGE ON SCHEMA public TO legal_admin;

-- Verify
SELECT table_name, table_owner FROM information_schema.tables
WHERE table_schema = 'public' AND table_owner != 'legal_admin';
EOF
```

### Step 5: Generate Migration File

```bash
# Without applying changes
npx drizzle-kit generate --name safe_migration

# Check generated SQL
cat sveltekit-frontend/drizzle/migrations/0001_*.sql

# Review the migration for data-loss statements
grep -i "drop\|delete\|truncate" sveltekit-frontend/drizzle/migrations/0001_*.sql
```

### Step 6: Create Data Migration Script

```bash
cat > sveltekit-frontend/drizzle/migrations/data_preservation.sql << 'EOF'
-- Preserve data during schema migration
BEGIN TRANSACTION;

-- Create temporary tables to hold data
CREATE TEMP TABLE temp_cases AS SELECT * FROM cases;
CREATE TEMP TABLE temp_evidence AS SELECT * FROM evidence;
CREATE TEMP TABLE temp_knowledge_base AS SELECT * FROM knowledge_base;

-- Now safe to apply schema changes...
-- (Drizzle migrations will run here)

-- Restore data if needed
-- INSERT INTO cases SELECT * FROM temp_cases WHERE NOT EXISTS (SELECT 1 FROM cases);

COMMIT;
EOF
```

### Step 7: Apply Migration Safely

```bash
# Test migration in dry-run mode
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db \
  --echo-all < sveltekit-frontend/drizzle/migrations/0001_*.sql | head -50

# If looks good, apply it
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db \
  -f sveltekit-frontend/drizzle/migrations/0001_*.sql

# Verify
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db -c "\dt"
```

---

## ✅ Post-Migration Verification

```bash
# Check table count
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << 'EOF'
SELECT COUNT(*) as total_tables FROM information_schema.tables
WHERE table_schema = 'public';
EOF

# Check specific table data
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << 'EOF'
SELECT 'cases' as table_name, COUNT(*) as record_count FROM cases
UNION ALL
SELECT 'evidence', COUNT(*) FROM evidence
UNION ALL
SELECT 'knowledge_base', COUNT(*) FROM knowledge_base
UNION ALL
SELECT 'rag_documents', COUNT(*) FROM rag_documents;
EOF

# Check indexes are created
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db -c "\di"

# Verify pgvector extension
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << 'EOF'
SELECT * FROM pg_extension WHERE extname = 'vector';
SELECT COUNT(*) FROM information_schema.columns
WHERE data_type = 'USER-DEFINED' AND udt_name = 'vector';
EOF
```

---

## 🔄 Rolling Back If Needed

```bash
# Restore from backup
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db < backup_20251024.sql

# Or restore from archive tables
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db << 'EOF'
-- Restore cases from archive
TRUNCATE cases CASCADE;
INSERT INTO cases SELECT * FROM archive_cases_20251024;

-- Restore evidence
TRUNCATE evidence CASCADE;
INSERT INTO evidence SELECT * FROM archive_evidence_20251024;

-- Etc...
EOF
```

---

## 📊 Current Data to Preserve

| Table | Records | Type | Action |
|-------|---------|------|--------|
| cases | 6 | Case data | Archive → Migrate → Restore |
| evidence | 7 | Legal evidence | Archive → Migrate → Restore |
| knowledge_base | 344 | AI knowledge | Archive → Keep (large) |
| rag_documents | 3 | RAG system | Archive → Migrate |
| chat_sessions | 1 | User sessions | Archive or drop |
| knowledge_graphs | 1 | Graph data | Archive or drop |
| case_embeddings | 2 | Vectors | Archive → Migrate |
| evidence_vectors | 7 | Vectors | Archive → Migrate |
| legal_documents_extracted | 5 | Documents | Archive → Migrate |
| vector_embeddings | 3 | Vectors | Archive → Migrate |

**Total Data at Risk**: ~380 records across 10 tables

---

## 🛡️ Best Practices

1. **Always Backup First**
   ```bash
   PGPASSWORD=123456 pg_dump ... > backup.sql
   ```

2. **Test Migrations**
   ```bash
   # Test in separate database
   createdb test_legal_ai_db
   psql -d test_legal_ai_db < backup.sql
   # Apply migration
   ```

3. **Archive Old Data**
   ```bash
   CREATE TABLE archive_[table]_[date] AS SELECT * FROM [table];
   ```

4. **Document Changes**
   ```bash
   # Keep migration logs
   ls -la drizzle/migrations/
   ```

5. **Verify Integrity**
   ```bash
   # Check row counts before/after
   psql ... -c "SELECT COUNT(*) FROM [table];"
   ```

---

## 🚨 If Migration Fails

```bash
# 1. Stop your application immediately
# 2. Don't attempt more migrations
# 3. Check error logs
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db -c "SELECT * FROM pg_stat_statements LIMIT 10;"

# 4. Restore from backup
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db < backup_latest.sql

# 5. Contact support with:
# - Backup file
# - Error message
# - Migration SQL file
```

---

## ✨ Next Steps

1. **Create Backup**
   ```bash
   PGPASSWORD=123456 pg_dump ... > backup_$(date +%Y%m%d).sql
   ```

2. **Archive Tables**
   ```bash
   # Run Step 3 from above
   ```

3. **Fix Permissions**
   ```bash
   # Run Step 4 from above
   ```

4. **Apply Migration**
   ```bash
   npm run db:push
   ```

5. **Verify Success**
   ```bash
   PGPASSWORD=123456 psql ... -c "\dt"
   ```

---

## 📞 Support

If you encounter issues:

1. Check backup exists: `ls backup_*.sql`
2. Review error: `npm run db:push 2>&1 | tee migration.log`
3. Restore if needed: `psql < backup_latest.sql`
4. Check permissions: `psql ... -c "\dp"`

**Safe to proceed** - your data is protected! 🛡️
