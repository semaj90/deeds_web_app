# Phase 90 Quick Reference Card

## ⚡ Quick Commands

```bash
# Check for duplicate emails before adding UNIQUE constraint
npm run db:check-duplicates

# Full safe migration workflow (automated)
npm run db:migrate-safe

# Manual workflow
npm run db:snapshot-before
npm run db:migrate
npm run db:snapshot-after
npm run db:compare-snapshots
```

---

## 🎯 The Phase 90 Answer

**When Drizzle asks:**
> "Truncate table if constraint fails?"

**Always answer:** `No`

**When Drizzle asks:**
> "Rename column X to Y?"

**Answer:** `No` (unless you explicitly want to rename)

**When Drizzle asks:**
> "Create new column?"

**Answer:** `Yes` (safe, non-destructive)

---

## ✅ Safe Migration Checklist

Before every migration:

- [ ] `npm run db:check-duplicates` → Must return 0 duplicates
- [ ] `npm run db:snapshot-before` → Baseline snapshot created
- [ ] Review migration SQL in `drizzle/migrations/`
- [ ] `npm run db:generate` → Answer prompts with Phase 90 principles
- [ ] `npm run db:migrate` → Apply migration
- [ ] `npm run db:snapshot-after` → Post-migration snapshot
- [ ] `npm run db:compare-snapshots` → Verify no data loss

---

## 🚨 If Duplicates Found

```sql
-- Connect to database
psql -U legal_admin -d legal_ai_db -p 5434

-- Find duplicates
SELECT email, COUNT(*) AS count, ARRAY_AGG(id ORDER BY created_at) AS user_ids
FROM users
GROUP BY email
HAVING COUNT(*) > 1;

-- Delete duplicates (keep oldest user)
DELETE FROM users
WHERE id NOT IN (
  SELECT MIN(id)
  FROM users
  GROUP BY email
);

-- Verify clean
SELECT email, COUNT(*)
FROM users
GROUP BY email
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

---

## 📊 Expected Output

### ✅ Success (no duplicates)
```
============================================================================
 DUPLICATE EMAIL CHECK
============================================================================

✓ No duplicate emails found - safe to add UNIQUE constraint
```

### ✅ Success (migration complete)
```
✓ All row counts IDENTICAL - no data loss
+ New columns appear in diff (expected)
+ New constraints appear in diff (expected)
```

### ❌ Failure (duplicates exist)
```
✗ DUPLICATE EMAILS FOUND:
user@example.com|3|{id1,id2,id3}

You must fix these duplicates before adding UNIQUE(email) constraint!
```

---

## 🔧 Troubleshooting

### PostgreSQL not running
```bash
# Start PostgreSQL (if using Docker)
docker-compose up -d postgres

# Or start local PostgreSQL
npm run postgres:start
```

### Migration fails with "duplicate key"
```bash
# 1. Check for duplicates
npm run db:check-duplicates

# 2. Fix duplicates (see SQL above)

# 3. Rerun migration
npm run db:migrate
```

### Row counts differ before/after
```bash
# ⚠️ This should NEVER happen in Phase 90
# If it does, restore from backup and investigate

# Check snapshots
cat logs/phase90/before-migration.txt
cat logs/phase90/after-migration.txt
```

---

## 📁 Files

| File | Purpose |
|------|---------|
| `scripts/phase90-migration-check.sql` | SQL safety checks |
| `scripts/phase90-migration-safety.ps1` | PowerShell wrapper |
| `logs/phase90/before-migration.txt` | Pre-migration snapshot |
| `logs/phase90/after-migration.txt` | Post-migration snapshot |
| `docs/PHASE_90_SAFE_MIGRATIONS.md` | Full documentation |

---

## 🎓 Philosophy

**Phase 90 = No destructive operations**

- ✅ Add columns (safe)
- ✅ Add constraints (after data validation)
- ✅ Audit everything (before/after snapshots)
- ❌ Never truncate tables
- ❌ Never silently delete data
- ❌ Never rename without explicit confirmation

**If in doubt, choose the safer option.**

---

## 🔗 Integration

Phase 90 uses **Phase 14 environment**:

```env
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_db
DB_HOST=localhost
DB_PORT=5434
DB_USER=legal_admin
DB_NAME=legal_ai_db
```

---

## 📞 Quick Help

```bash
# Check database connection
npm run postgres:test

# View migration history
psql -U legal_admin -d legal_ai_db -p 5434 -c "SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5;"

# Manual SQL check
psql -U legal_admin -d legal_ai_db -p 5434 -f scripts/phase90-migration-check.sql

# Full documentation
cat docs/PHASE_90_SAFE_MIGRATIONS.md
```

---

**Remember:** Data loss is unacceptable. Always audit, always verify. 🛡️
