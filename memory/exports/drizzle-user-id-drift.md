# Drizzle `user_id` Drift Audit

Generated 2026-05-31T23:35:27.552Z

## Summary

- Schema files scanned: 155
- Schema declarations of `user_id` / `uploaded_by`: 73
- Live DB columns with same names: 48
- **Drifts (declared ≠ DB)**: 3 (high: 3, low: 0)
- DB-only (not in any schema file): 2
- Declaration-only (in schema, not in DB): 15

## High-severity drifts (uuid ↔ integer mismatch)

| File | Table | Column | Declared | Actual |
|---|---|---|---|---|
| `sveltekit-frontend\src\lib\server\db\archived-schemas\additional-tables.ts` | `rag_sessions` | `user_id` | `uuid` | `integer` |
| `sveltekit-frontend\src\lib\server\db\archived-schemas\lucia-schema.ts` | `sessions` | `user_id` | `uuid` | `integer` |
| `sveltekit-frontend\src\lib\server\db\archived-schemas\additional-tables.ts` | `user_ai_queries` | `user_id` | `uuid` | `integer` |

## DB-only tables (no Drizzle declaration)

- `admin_telemetry.user_id` (integer)
- `agent_actions.user_id` (integer)
