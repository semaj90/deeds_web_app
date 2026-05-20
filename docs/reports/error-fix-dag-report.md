# Error-Fix DAG Report
_Generated: 2026-05-20T00:19:12.189Z_

**Total findings:** 5  |  **Active error states:** 1

## Recommended Fix Order

| Order | State | Severity | Findings | Root Score | Downstream |
|-------|-------|----------|----------|------------|------------|
| 5 | **Schema Mismatch** | low | 5 | 0.2 | — |

## HMM States

### 5. Schema Mismatch

Drizzle schema column type does not match the live Postgres column type.

**Validation commands:**
- `npm run db:check`
- `npm run audit:contracts`
- `npm run test:network-contracts`

**Findings (5):**
- `contract:drizzle-meta-stale_migration-001-d6a201cf`
- `contract:drizzle-meta-stale_migration-002-033419d2`
- `contract:drizzle-meta-stale_migration-003-3f91ba5e`
- `contract:drizzle-meta-stale_migration-004-1486163b`
- `contract:drizzle-meta-stale_migration-005-187064cc`

