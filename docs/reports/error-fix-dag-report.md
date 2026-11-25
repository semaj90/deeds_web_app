# Error-Fix DAG Report
_Generated: 2026-11-25T02:27:43.714Z_

**Total findings:** 35  |  **Active error states:** 1

## Recommended Fix Order

| Order | State | Severity | Findings | Root Score | Downstream |
|-------|-------|----------|----------|------------|------------|
| 5 | **Schema Mismatch** | medium | 35 | 0.2 | — |

## HMM States

### 5. Schema Mismatch

Drizzle schema column type does not match the live Postgres column type.

**Validation commands:**
- `npm run db:check`
- `npm run audit:contracts`
- `npm run test:network-contracts`

**Findings (35):**
- `contract:drizzle-meta-stale_migration-030-6f4602d2`
- `contract:drizzle-meta-stale_migration-031-68651803`
- `contract:drizzle-meta-stale_migration-032-a99f92ab`
- `contract:drizzle-meta-stale_migration-033-ee4af613`
- `contract:drizzle-meta-stale_migration-034-4ee9f3c7`
- _… 30 more_
