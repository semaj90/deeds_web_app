# 🔍 Database Migration Dry Run Script

**Purpose**: Validate YoRHa schema migration WITHOUT applying changes
**Safe**: Read-only operations, no database modifications

---

## Dry Run Checklist

### 1. Verify PostgreSQL Connection
```bash
psql -h localhost -U postgres -d deeds_db -c "SELECT version();"
```
**Expected**: PostgreSQL 17.x version string

### 2. Check Current Table Count
```bash
psql -h localhost -U postgres -d deeds_db -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
```
**Record this number**: _________

### 3. Verify YoRHa Tables Don't Exist
```bash
psql -h localhost -U postgres -d deeds_db -c "SELECT tablename FROM pg_tables WHERE tablename LIKE 'yorha_%';"
```
**Expected**: 0 rows (tables don't exist yet)

### 4. Validate Migration File Syntax
```bash
# Check for syntax errors without executing
psql -h localhost -U postgres -d deeds_db --single-transaction --set ON_ERROR_STOP=on -f sveltekit-frontend/drizzle/migrations/0001_yorha_schema.sql --dry-run 2>&1 | head -20
```
**Note**: PostgreSQL doesn't have a native --dry-run, so we'll use a transaction rollback

### 5. Safe Syntax Check (Transaction Rollback)
```bash
psql -h localhost -U postgres -d deeds_db << 'EOF'
BEGIN;
-- Include the migration file content
\i sveltekit-frontend/drizzle/migrations/0001_yorha_schema.sql
-- Check tables were created in transaction
SELECT tablename FROM pg_tables WHERE tablename LIKE 'yorha_%';
-- Rollback (don't commit)
ROLLBACK;
-- Verify tables don't exist after rollback
SELECT tablename FROM pg_tables WHERE tablename LIKE 'yorha_%';
EOF
```
**Expected**:
- First SELECT: 6 rows (in transaction)
- Second SELECT: 0 rows (after rollback)

### 6. Verify Users Table Exists
```bash
psql -h localhost -U postgres -d deeds_db -c "SELECT count(*) FROM users LIMIT 1;"
```
**Expected**: Number >= 0 (users table exists and is accessible)

### 7. Check Disk Space
```bash
df -h | grep -E '(Filesystem|/)$'
```
**Expected**: At least 1GB free space

### 8. Verify Backup Directory
```bash
mkdir -p backups
ls -lh backups/
```
**Expected**: Directory exists and is writable

---

## Dry Run Execution Report

**Date**: _______________
**PostgreSQL Version**: _______________
**Current Table Count**: _______________
**Disk Space Available**: _______________
**Users Table Records**: _______________

**Dry Run Status**:
- [ ] PostgreSQL connection working
- [ ] Database accessible
- [ ] YoRHa tables don't exist yet
- [ ] Migration syntax valid
- [ ] Transaction rollback successful
- [ ] Users table accessible
- [ ] Sufficient disk space
- [ ] Backup directory ready

**Proceed with migration?**: [ ] YES  [ ] NO

---

## If Any Check Fails

### PostgreSQL not accessible
```bash
# Check Docker
docker-compose ps | grep postgres

# Restart if needed
docker-compose restart postgres
```

### Insufficient disk space
```bash
# Clean old logs
docker system prune -f
```

### Migration file not found
```bash
# Verify path
ls -l sveltekit-frontend/drizzle/migrations/0001_yorha_schema.sql
```

---

**Next Step**: If all checks pass, proceed to Step 1 (Backup Database)
