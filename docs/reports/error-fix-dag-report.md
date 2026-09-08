# Error-Fix DAG Report
_Generated: 2026-09-08T16:35:12.670Z_

**Total findings:** 63  |  **Active error states:** 1

## Recommended Fix Order

| Order | State | Severity | Findings | Root Score | Downstream |
|-------|-------|----------|----------|------------|------------|
| 5 | **Schema Mismatch** | medium | 63 | 0.2 | — |

## HMM States

### 5. Schema Mismatch

Drizzle schema column type does not match the live Postgres column type.

**Validation commands:**
- `npm run db:check`
- `npm run audit:contracts`
- `npm run test:network-contracts`

**Findings (63):**
- `contract:drizzle-meta-stale_migration-002-6f4602d2`
- `contract:drizzle-meta-stale_migration-003-a4252fa5`
- `contract:drizzle-meta-stale_migration-004-68651803`
- `contract:drizzle-meta-stale_migration-005-a99f92ab`
- `contract:drizzle-meta-stale_migration-006-ee4af613`
- _… 58 more_
