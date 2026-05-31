# 2026-05-30 — user_id type reconciliation plan

Status: draft — in-progress (audit produced at `memory/exports/drizzle_userid_audit.json`)

Goal
--
Provide a safe, operator-reviewed plan to reconcile mismatches between `drizzle` schema declarations that use `uuid('user_id')` and the live Postgres column types (many currently `integer` / `int4` or `text`). Avoid destructive changes without approval.

Context
--
- Read-only introspection and audit were completed. See `memory/exports/drizzle_userid_audit.json` for table-by-table results.
- Many tables declared `userId: uuid('user_id')` in Drizzle, while the live DB stores `user_id` as `integer` in most tables, with a few `text` cases.

Recommendation (short)
--
Preferred safe path: Align Drizzle declarations to the live DB (`uuid` → `integer`) and ship schema updates, not DB-changing migrations, unless the operator explicitly requests converting DB columns to `uuid`.

Why this is safer
--
- The live DB already contains integer FK relationships and application code relies on integer joins in many places; converting to `uuid` is invasive and can break runtime code and foreign keys.
- Updating Drizzle schema keeps the codebase consistent with production shape with minimal DB risk. Future migrations to `uuid` can be planned, tested, and executed in a separate operator-approved window.

Options (detailed)
--

Option A — Align Drizzle schema to DB (Recommended)

1. Update Drizzle schema definitions: change `uuid('user_id')` → `integer('user_id')` (or `text()` where DB shows text).
2. Run `npx drizzle-kit generate --name=align_userid_schema` in a dev branch to see generated SQL. Do NOT apply automatically — inspect the SQL for DROP/CREATE statements.
3. Manually edit the generated SQL to remove any DROP TABLE/CREATE that would delete data. Prefer `ALTER TABLE ...` statements or no-op the migration if Drizzle attempts destructive ops.
4. Commit schema changes and open a PR labelled `ops/drizzle-align-userid` with the audit file attached and reviewer checklist.

Validation checklist (before merge)
- Confirm `memory/exports/drizzle_userid_audit.json` attached to PR.
- Run `npx tsgo --noEmit` / `npm run typecheck` and `npm run test:run` in CI.
- Run the app in a staging container against a restored pg17/pg18 snapshot and run smoke Playwright tests (routes that reference `user_id`).
- Confirm no runtime `invalid input syntax for type uuid` errors appear in logs.

Rollback
- Revert the schema commit in the PR.
- If any DB change accidentally applied, restore DB from the pre-change `pg_dump` (see safe steps below).

Commands (dry-run guidance)
```bash
# Inspect audit (already generated)
cat memory/exports/drizzle_userid_audit.json

# Generate migration SQL (inspect only)
cd sveltekit-frontend
npx drizzle-kit generate --name=align_userid_schema

# Run type checks + tests
npm ci
npm run typecheck:native || npm run check
npm run test:run
```

Option B — Migrate DB to `uuid` (requires operator approval)

This is riskier and only recommended if the product leadership decides `users.id` must be uuid across the stack.

High-level steps
1. Add `user_uuid uuid` to `users` table and populate from current identity mapping (if any) or generate new uuids and map them in an idempotent mapping table.
2. For each FK `user_id` integer column: add new `user_id_uuid uuid` column, fill by joining to users table mapping, add FK, update app code to read new column, switch over, drop old column.
3. Perform this per-table in small batches, verifying at each step. Use transactions + downtime windows as appropriate.

Template conversion (example)
```sql
-- add new column
ALTER TABLE evidence ADD COLUMN user_id_uuid uuid;

-- populate from mapping table (example mapping table: user_id_map(old_id int, new_uuid uuid))
UPDATE evidence e SET user_id_uuid = m.new_uuid FROM user_id_map m WHERE e.user_id = m.old_id;

-- add FK once validated
ALTER TABLE evidence ADD CONSTRAINT evidence_user_id_uuid_fkey FOREIGN KEY (user_id_uuid) REFERENCES users(id);

-- after app swap, drop old column
ALTER TABLE evidence DROP COLUMN user_id;
ALTER TABLE evidence RENAME COLUMN user_id_uuid TO user_id;
```

Option C — Compatibility layer (application-level casts)

- Where immediate schema change is undesirable, add adapters in server-side DB access helpers to cast `locals.user.id` appropriately (e.g., `Number(locals.user.id)` for integer columns) and widen query types where needed. This is temporary and bloats code; prefer Option A for long-term clarity.

Safe operational steps (required before any migration)
--
1. Full DB backup: `pg_dump --format=custom --file=backup_pre_userid_migration.dump --dbname=$DATABASE_URL`
2. Test restore to a disposable pg instance and run the entire test suite and smoke Playwright tests against it.
3. Ensure CI has a reproducible migration test that runs the generated SQL against a fresh DB snapshot.

Deliverables I will produce if you approve Option A now
--
- A PR branch with the updated `drizzle` schema changes (only `.ts` files) and no auto-applied SQL.
- A `README.md` in the PR describing the checks performed and the attached `memory/exports/drizzle_userid_audit.json` for reviewers.
- A small checklist of manual edits to the generated SQL for safe application.

Next action (please confirm)
--
- Reply with which option you want me to prepare (A = align Drizzle to DB [recommended], B = migrate DB to uuid, C = compatibility layer). I will then:
  - For A: prepare the PR branch and commit the schema changes (no DB changes), run CI checks locally, and open a PR draft for you.
  - For B: prepare a detailed migration plan with per-table SQL and a staging runbook.
  - For C: implement compatibility wrappers and short-term patches.

If you want me to proceed with Option A now, I will create the PR branch and commit the schema edits for review.
