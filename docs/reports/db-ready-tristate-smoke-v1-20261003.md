# PostgreSQL Readiness Tri-State Smoke

## Result

`DB-READY-TRISTATE-01`: `CONTRACT_PROVEN` with `LIVE_HEALTHY_SMOKE`.

The shared classifier reports `STARTING`, `HEALTHY`, or `UNAVAILABLE`. Health routes, Playwright global-setup polling, analysis-job retry handling, and error-log repair admission use the shared classification. `STARTING` cannot create an agentic repair row.

## Evidence

- Five focused Vitest suites passed: readiness classifier, database health route, readiness health route, error-log repair guard, and route contract; **30/30 tests passed**.
- `pg_isready -h 127.0.0.1 -p 5434 -d legal_ai_db`: accepting connections.
- App-configured Drizzle `SELECT 1 AS ok`: succeeded (`ok=true`).
- No database mutation was issued. No Postgres restart was attempted; a live SQLSTATE `57P03` event was therefore not induced.

## Validation

- Focused tests:
  `npx vitest run src/lib/server/db/readiness.spec.ts src/lib/server/db/health-database-route.spec.ts src/lib/server/db/health-ready-route.spec.ts src/lib/server/error-logging.readiness.spec.ts src/routes/api/health/database/server.route.spec.ts`
- Live smoke: `pg_isready` followed by app-configured read-only `SELECT 1`.
- `likely_cause`: Crash-recovery SQLSTATE `57P03` was previously liable to be treated like a terminal outage and open agentic repair work.
- `evidence`: shared `readiness.ts`, health-route and error-logging wiring, 30 passing tests, local PostgreSQL readiness and query result.
- `patch_targets`: `sveltekit-frontend/src/lib/server/db/readiness.ts`; `sveltekit-frontend/src/routes/api/health/database/+server.ts`; `sveltekit-frontend/src/routes/api/health/ready/+server.ts`; `sveltekit-frontend/src/lib/server/error-logging.ts`.
- `safe_next_command`: `npx vitest run src/lib/server/db/readiness.spec.ts src/lib/server/db/health-database-route.spec.ts src/lib/server/db/health-ready-route.spec.ts src/lib/server/error-logging.readiness.spec.ts src/routes/api/health/database/server.route.spec.ts`
- `smoke_command`: `pg_isready -h 127.0.0.1 -p 5434 -d legal_ai_db` then a read-only `SELECT 1` through the application DB client.
- `report_path`: `docs/reports/db-ready-tristate-smoke-v1-20261003.md`
