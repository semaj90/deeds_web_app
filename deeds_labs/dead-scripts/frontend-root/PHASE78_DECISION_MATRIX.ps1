#!/usr/bin/env powershell
# ============================================================================
# PHASE 78 SCHEMA DECISION MATRIX
# ============================================================================
# Quick reference for "should I run this database change?"
# ============================================================================

Write-Host @"

╔════════════════════════════════════════════════════════════════════════════╗
║                 PHASE 78 SCHEMA DECISION MATRIX                           ║
╚════════════════════════════════════════════════════════════════════════════╝

SCENARIO 1: Drizzle Shows "Found data-loss statements"
───────────────────────────────────────────────────────
  ❌ DO NOT APPLY

  Example warning:
  ┌─────────────────────────────────────────────────────┐
  │ You're about to delete knowledge_graphs table       │
  │ You're about to delete legal_entities table with 44 │
  │ You're about to delete username column in users ... │
  │ THIS ACTION WILL CAUSE DATA LOSS                    │
  │                                                     │
  │ Do you still want to push changes?                  │
  │ ❌ No, abort  ← PICK THIS                          │
  │    Yes, I want to...                               │
  └─────────────────────────────────────────────────────┘

  Why: This is a hard-reset proposal. We're in "keep & enhance" mode.


SCENARIO 2: Migration Only Has CREATE TABLE / ADD COLUMN / CREATE INDEX
─────────────────────────────────────────────────────────────────────────
  ✅ SAFE TO APPLY

  Example migration (good):
  ┌─────────────────────────────────────────────────────┐
  │ CREATE TABLE IF NOT EXISTS "my_new_table" (...)    │
  │ ADD COLUMN IF NOT EXISTS "new_field" uuid;         │
  │ CREATE INDEX IF NOT EXISTS "idx_..." ON ...        │
  │ ALTER TABLE ADD CONSTRAINT (idempotent wrap)       │
  └─────────────────────────────────────────────────────┘

  Apply via:
  npx drizzle-kit migrate

  Or manually:
  psql -U postgres legal_ai_db -f migration.sql


SCENARIO 3: You're Adding a New Feature to Schema
──────────────────────────────────────────────────
  ✅ DO THIS:

  1. Add to src/lib/server/db/schema/index.ts:
     export const myNewTable = pgTable('my_new_table', { ... });

  2. Generate migration:
     npx drizzle-kit generate --name my_new_feature

  3. Check drizzle/migrations/*my_new_feature*.sql
     Should ONLY contain CREATE/ADD/CREATE INDEX
     If it has DROP or TRUNCATE → abort and ask for help

  4. Apply:
     npx drizzle-kit migrate


SCENARIO 4: You Removed a Model from schema.ts
──────────────────────────────────────────────
  ⚠️ CAREFUL

  Drizzle will now want to DROP that table.

  If you truly want to delete it: apply the migration.

  If you want to keep the data:
    • Either re-add the model to schema.ts
    • Or keep it as a "legacy_*" placeholder
    • Say "No" to any drizzle-kit push


SCENARIO 5: You Want a Hard-Reset (Nuclear Option)
──────────────────────────────────────────────────
  ⚠️ ONLY IN LOCAL DEV OR BACKUP

  DO NOT do this on production data.

  Steps:
  1. Backup current DB:
     pg_dump -U postgres legal_ai_db > backup_before_nuke.sql

  2. Test on backup:
     createdb legal_ai_db_test
     psql -U postgres legal_ai_db_test < backup_before_nuke.sql

  3. On test DB, say YES to drizzle-kit push

  4. If it looks good, then on prod:
     Say YES to the hard-reset migration


══════════════════════════════════════════════════════════════════════════════

CURRENT STATUS: Keep & Enhance Mode ✅

✓ All Phase 78 tables exist and are locked in
✓ Additive migrations applied successfully
✓ Baseline snapshot taken (legal_ai_db_phase78_baseline.dump)
✓ All existing data preserved

NEXT MIGRATION: Only apply if scenario 1 or 2 above.
"@

