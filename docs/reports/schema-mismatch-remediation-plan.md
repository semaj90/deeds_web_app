# Implementation Plan: Phase 6E Schema Mismatch Remediation (UUID vs Integer)

## Overview
The contract audit identified a high-severity mismatch where `users.id` is defined as a `serial` (integer) in the canonical `schema-postgres.ts`, but at least 23 tables define their `user_id` or `created_by` columns as `uuid`. This prevents formal foreign key constraints and leads to data integrity risks.

## Strategy: Universal UUID Migration
Given the app uses UUIDs for almost all other primary keys, the most consistent path is to convert `users.id` to a `uuid`.

### Step 1: Schema Update (Drizzle)
Modify `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`:
- Change `users.id` from `serial('id')` to `uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull()`.
- Update all co-located FKs in `schema-postgres.ts` to ensure they use `integer` ONLY if they reference a specific legacy table, otherwise default to `uuid`.
- Ensure all 23 tables with `uuid` user_ids are correctly referenced.

### Step 2: Migration Generation
Run `drizzle-kit generate` to produce the migration. 
> [!CAUTION]
> This will be a destructive migration if data exists in the `users` table. We must handle casting or use a temporary column.

### Step 3: Temporary Fix (Integer Fallback)
If switching to UUID is too invasive for the current production state, we can fallback to changing the 23 table columns to `integer`.
- **Pros**: Easy to cast existing data. Matches current `users` primary key.
- **Cons**: Inconsistent with the rest of the "modern" UUID-based schema.

## Impacted Tables (Audit Sample)
- `ace_context_cache`
- `ai_usage_log`
- `analytics_events`
- `api_audit_log`
- `audit_log`
- `criminals`
- `case_scores`
- ... (16 more)

## Proposed First Action
Standardize `users` to match the `lucia-schema.ts` definition (UUID) and reconcile `schema-postgres.ts`.

---
**Status**: Pending Operator Review
**RunID**: `phase-6e-remediation-001`
