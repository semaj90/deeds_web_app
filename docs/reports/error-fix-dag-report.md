# Error-Fix DAG Report
_Generated: 2026-06-19T05:26:46.776Z_

**Total findings:** 1  |  **Active error states:** 1

## Recommended Fix Order

| Order | State | Severity | Findings | Root Score | Downstream |
|-------|-------|----------|----------|------------|------------|
| 5 | **Schema Mismatch** | medium | 1 | 0.2 | — |

## HMM States

### 5. Schema Mismatch

Drizzle schema column type does not match the live Postgres column type.

**Validation commands:**
- `npm run db:check`
- `npm run audit:contracts`
- `npm run test:network-contracts`

**Findings (1):**
- `contract:drizzle-meta-stale_migration-001-cd7c3536`

