# Error-Fix DAG Report
_Generated: 2026-11-24T05:15:38.909Z_

**Total findings:** 38  |  **Active error states:** 1

## Recommended Fix Order

| Order | State | Severity | Findings | Root Score | Downstream |
|-------|-------|----------|----------|------------|------------|
| 5 | **Schema Mismatch** | medium | 38 | 0.2 | — |

## HMM States

### 5. Schema Mismatch

Drizzle schema column type does not match the live Postgres column type.

**Validation commands:**
- `npm run db:check`
- `npm run audit:contracts`
- `npm run test:network-contracts`

**Findings (38):**
- `contract:drizzle-meta-stale_migration-027-6f4602d2`
- `contract:drizzle-meta-stale_migration-028-68651803`
- `contract:drizzle-meta-stale_migration-029-a99f92ab`
- `contract:drizzle-meta-stale_migration-030-ee4af613`
- `contract:drizzle-meta-stale_migration-031-4ee9f3c7`
- _… 33 more_
