# Phase 90: Safe Migration Protocol

**Last Updated:** 2025-12-06
**Status:** ✅ ACTIVE
**Philosophy:** No destructive operations, no silent data deletion, audit everything

---

## Core Principles

### The Phase 90 Answer

When Drizzle asks:

> "Do you want to TRUNCATE the table if adding constraint fails?"

**Always answer:** `No`

**Why:**
- ✅ Preserves all existing data
- ✅ Forces you to fix duplicates manually (you see what's being changed)
- ✅ Migration fails loudly if there's a problem (better than silent corruption)
- ✅ Audit trail: you know exactly what changed and why

### What Phase 90 Prevents

❌ **Never allow:**
- Automatic table truncation
- Silent deletion of duplicate rows
- Renaming columns without explicit confirmation
- Dropping columns without backup

✅ **Always do:**
- Add new columns (safe, non-destructive)
- Add constraints only after verifying data integrity
- Take before/after snapshots
- Check for duplicates before adding UNIQUE constraints

---

## Tools

### 1. SQL Safety Check Script

**Location:** `sveltekit-frontend/scripts/phase90-migration-check.sql`

**What it does:**
- Row count snapshot (verify no data loss)
- Duplicate email detection
- Column inventory (track new additions)
- Constraint audit
- NULL value checks
- Migration history

**Usage:**
```bash
# Direct SQL execution
psql -U legal_admin -d legal_ai_db -p 5434 -f scripts/phase90-migration-check.sql
```

### 2. PowerShell Wrapper

**Location:** `sveltekit-frontend/scripts/phase90-migration-safety.ps1`

**Commands:**

```powershell
# Check for duplicate emails (run BEFORE adding UNIQUE constraint)
.\scripts\phase90-migration-safety.ps1 -Action check-duplicates

# Take BEFORE snapshot
.\scripts\phase90-migration-safety.ps1 -Action before

# Run migration
npm run db:migrate

# Take AFTER snapshot
.\scripts\phase90-migration-safety.ps1 -Action after

# Compare snapshots
.\scripts\phase90-migration-safety.ps1 -Action compare
```

---

## Standard Migration Workflow

### Step 1: Pre-Migration Checks

```powershell
# 1. Check for duplicates
.\scripts\phase90-migration-safety.ps1 -Action check-duplicates

# 2. Take before snapshot
.\scripts\phase90-migration-safety.ps1 -Action before
```

**Expected output:**
```
✓ No duplicate emails found - safe to add UNIQUE constraint
```

If duplicates found:
```sql
-- Fix manually in psql
DELETE FROM users
WHERE id IN (
  SELECT id FROM users
  WHERE email = 'duplicate@example.com'
  ORDER BY created_at DESC
  OFFSET 1
);
```

### Step 2: Generate Migration

```bash
npm run db:generate
```

**Drizzle will ask questions:**

| Question | Phase 90 Answer | Why |
|----------|----------------|-----|
| "Rename column X to Y?" | **No** (unless you explicitly want to rename) | Prevents accidental data loss |
| "Truncate table if constraint fails?" | **No** | Preserves data, fails loudly |
| "Create new column?" | **Yes** | Safe, non-destructive |
| "Add constraint?" | **Yes** (after duplicate check) | Safe if data is clean |

### Step 3: Run Migration

```bash
npm run db:migrate
```

**If migration fails:**
- ✅ Good! It means there's a data integrity issue
- Fix the underlying data problem
- Rerun migration

**If migration succeeds:**
- ✅ Take after snapshot
- ✅ Compare before/after
- ✅ Verify row counts match

### Step 4: Post-Migration Verification

```powershell
# 1. Take after snapshot
.\scripts\phase90-migration-safety.ps1 -Action after

# 2. Compare snapshots
.\scripts\phase90-migration-safety.ps1 -Action compare
```

**Expected output:**
```
✓ All row counts IDENTICAL - no data loss
+ New columns appear in diff (expected)
+ New constraints appear in diff (expected)
```

---

## Common Scenarios

### Scenario 1: Adding UNIQUE(email) Constraint

**Problem:** Users table might have duplicate emails

**Phase 90 Solution:**
```powershell
# 1. Check for duplicates
.\scripts\phase90-migration-safety.ps1 -Action check-duplicates

# 2. If duplicates found, fix manually:
psql -U legal_admin -d legal_ai_db -p 5434

# In psql:
SELECT email, COUNT(*)
FROM users
GROUP BY email
HAVING COUNT(*) > 1;

# Delete duplicates (keep oldest user)
DELETE FROM users
WHERE id NOT IN (
  SELECT MIN(id)
  FROM users
  GROUP BY email
);

# 3. Verify clean
SELECT email, COUNT(*)
FROM users
GROUP BY email
HAVING COUNT(*) > 1;
-- Should return 0 rows

# 4. Now run migration
npm run db:migrate
```

### Scenario 2: Adding New Column

**Problem:** Need to add `phone_number` to users table

**Phase 90 Solution:**
```typescript
// In schema file
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  phoneNumber: text('phone_number'), // New column, nullable by default
  // ...
});
```

```bash
# Generate migration
npm run db:generate
# Drizzle asks: "Create new column phone_number?"
# Answer: Yes

# Run migration (safe, no data loss)
npm run db:migrate
```

### Scenario 3: Column Name Conflict

**Problem:** Drizzle detects column might be renamed

**Phase 90 Solution:**
```bash
npm run db:generate
# Drizzle asks: "Rename column old_name to new_name?"
# Answer: No (unless you REALLY want to rename)
# Result: Drizzle creates new_name as NEW column, keeps old_name
```

**Then manually:**
```sql
-- Copy data if needed
UPDATE users SET new_name = old_name WHERE new_name IS NULL;

-- Drop old column only after verification
ALTER TABLE users DROP COLUMN old_name;
```

---

## Integration with Phase 14 Environment

Phase 90 uses these Phase 14 env vars:

```env
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_db
DB_HOST=localhost
DB_PORT=5434
DB_USER=legal_admin
DB_PASSWORD=123456
DB_NAME=legal_ai_db
```

**PowerShell script reads:**
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME` from hardcoded Phase 14 values
- `PGPASSWORD` set in script (for psql authentication)

---

## Audit Trail

Every migration should produce:

1. **Before snapshot:** `logs/phase90/before-migration.txt`
2. **After snapshot:** `logs/phase90/after-migration.txt`
3. **Comparison report:** Output of `compare` action
4. **Migration SQL:** `drizzle/migrations/XXXX_migration_name.sql`

**Commit all of these** (except snapshots, which are gitignored) so you have a complete history.

---

## Troubleshooting

### Problem: "Duplicate key value violates unique constraint"

**Cause:** Trying to add UNIQUE constraint when duplicates exist

**Fix:**
```powershell
# 1. Find duplicates
.\scripts\phase90-migration-safety.ps1 -Action check-duplicates

# 2. Fix manually (see Scenario 1)

# 3. Rerun migration
npm run db:migrate
```

### Problem: "Column already exists"

**Cause:** Migration was partially applied

**Fix:**
```sql
-- Check current schema
\d users

-- If column exists, skip migration or manually adjust
-- Option 1: Drop the column and rerun
ALTER TABLE users DROP COLUMN phone_number;

-- Option 2: Mark migration as applied
INSERT INTO __drizzle_migrations (hash, created_at)
VALUES ('migration_hash', NOW());
```

### Problem: Row counts differ before/after

**Cause:** Data was deleted (should NEVER happen in Phase 90)

**Fix:**
```powershell
# 1. Restore from backup
pg_restore -U legal_admin -d legal_ai_db backup.dump

# 2. Investigate what went wrong
# 3. Report as Phase 90 violation
```

---

## Success Criteria

A migration is **Phase 90 compliant** if:

- ✅ No data was deleted (row counts identical before/after)
- ✅ All new columns appear in schema
- ✅ All constraints are valid (no orphaned data)
- ✅ Duplicate check passed before adding UNIQUE constraints
- ✅ Before/after snapshots exist in `logs/phase90/`
- ✅ Migration can be rolled back if needed

---

## NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "db:check-duplicates": "pwsh -File scripts/phase90-migration-safety.ps1 -Action check-duplicates",
    "db:snapshot-before": "pwsh -File scripts/phase90-migration-safety.ps1 -Action before",
    "db:snapshot-after": "pwsh -File scripts/phase90-migration-safety.ps1 -Action after",
    "db:compare-snapshots": "pwsh -File scripts/phase90-migration-safety.ps1 -Action compare",
    "db:migrate-safe": "npm run db:check-duplicates && npm run db:snapshot-before && npm run db:migrate && npm run db:snapshot-after && npm run db:compare-snapshots"
  }
}
```

**Usage:**
```bash
# Full safe migration workflow
npm run db:migrate-safe
```

---

## Phase 90 Checklist

Before every migration:

- [ ] Run duplicate check
- [ ] Take before snapshot
- [ ] Review migration SQL
- [ ] Answer Drizzle prompts with Phase 90 principles
- [ ] Run migration
- [ ] Take after snapshot
- [ ] Compare snapshots
- [ ] Verify row counts match
- [ ] Commit migration files + comparison report

---

## Related Phases

- **Phase 14:** Master environment configuration (provides DB connection params)
- **Phase 6:** Core route validation (ensures app works with new schema)
- **Phase 72:** Error clustering (may surface schema-related type errors)

---

## Summary

**Phase 90 = Safe, auditable, non-destructive database migrations**

- Never truncate
- Never silently delete
- Always check for duplicates before UNIQUE constraints
- Always take before/after snapshots
- Always compare and verify

**If in doubt, choose the safer option. Data loss is unacceptable.**
