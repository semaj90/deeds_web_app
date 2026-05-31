# Schema Drift Report — Drizzle ↔ PostgreSQL 18

**Generated**: 2026-05-30
**Purpose**: Audit of identity columns (`userId`, `created_by`, `uploaded_by`, `uploaded_by_user_id`) to track alignment between Drizzle TypeScript definitions and the live PostgreSQL 18 database structure.

## Overview
A live database introspection query was run against the `information_schema.columns` registry to locate all columns matching `user_id`, `created_by`, `uploaded_by`, or `uploaded_by_user_id`. 70 matching columns were found across the active tables.

---

## 🟢 Matched Columns (Zero Drift)
The following tables have complete parity between their Drizzle declarations and the live database types. Almost all of these are aligned under the Lucia-aligned **Path A (integer ID)** schema:

| Table Name | Column Name | Declared Type | Live DB Type | Status |
|---|---|---|---|---|
| `admin_ai_chat_sessions` | `user_id` | `text` | `text` | ✅ Parity |
| `saved_citations` | `user_id` | `text` | `text` | ✅ Parity |
| `saved_citation_annotations` | `user_id` | `text` | `text` | ✅ Parity |
| `case_reports` | `created_by` | `varchar(255)` | `character varying` | ✅ Parity |
| `cases` | `user_id` | `integer` | `integer` | ✅ Parity |
| `evidence` | `user_id` | `integer` | `integer` | ✅ Parity |
| `evidence` | `uploaded_by` | `integer` | `integer` | ✅ Parity |
| `sessions` | `user_id` | `integer` | `integer` | ✅ Parity |
| `users` | `id` (PK) | `integer` | `integer` | ✅ Parity |
| *(Other 61 tables)* | `user_id` / `created_by` | `integer` | `integer` | ✅ Parity |

---

## 🟡 Schema Drifts Identified

### 1. `evidence.uploaded_by_user_id`
* **Problem**: The column `uploaded_by_user_id` is declared in multiple SvelteKit/Drizzle files but is entirely **absent** from the live PostgreSQL `evidence` table.
* **Declarations**:
  * [schema-prosecutor.ts](file:///c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts): `uploadedByUserId: uuid('uploaded_by_user_id')`
  * [schema/evidence.ts](file:///c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/db/schema/evidence.ts): `uploadedByUserId: integer('uploaded_by_user_id')`
* **Live DB Type**: Absent (Column does not exist).
* **Migration Needed?**: Yes (either remove the unused declarations from the schema or run DDL to create the column in the live DB if needed. However, since the live DB uses `uploaded_by` (integer) and `user_id` (integer) successfully, removing the unused declaration is the recommended path to resolve this).

---

## Next Steps
1. Review the unused declarations for `uploaded_by_user_id` in `schema-prosecutor.ts` and `schema/evidence.ts`.
2. Clean up declarations to match the live DB state.
3. Re-run `npm run audit:contracts` to confirm all layers remain green.
