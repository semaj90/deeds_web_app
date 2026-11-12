# Error-Fix DAG Report
_Generated: 2026-11-09T23:17:35.130Z_

**Total findings:** 40  |  **Active error states:** 2

## Recommended Fix Order

| Order | State | Severity | Findings | Root Score | Downstream |
|-------|-------|----------|----------|------------|------------|
| 5 | **Schema Mismatch** | medium | 38 | 0.25 | route_contract_mismatch |
| 7 | **Route Contract Mismatch** | low | 2 | 0.2 | — |

## HMM States

### 5. Schema Mismatch

Drizzle schema column type does not match the live Postgres column type.

**Validation commands:**
- `npm run db:check`
- `npm run audit:contracts`
- `npm run test:network-contracts`

**Findings (38):**
- `contract:drizzle-meta-stale_migration-029-6f4602d2`
- `contract:drizzle-meta-stale_migration-030-68651803`
- `contract:drizzle-meta-stale_migration-031-a99f92ab`
- `contract:drizzle-meta-stale_migration-032-ee4af613`
- `contract:drizzle-meta-stale_migration-033-4ee9f3c7`
- _… 33 more_

### 7. Route Contract Mismatch

SvelteKit route or Superforms v2 contract is incomplete or incorrectly wired.

**Validation commands:**
- `npm run audit:forms`
- `npm run test:network-contracts`

**Findings (2):**
- `contract:sveltekit-route-route_contract_mismatch-001-86cb947b`
- `contract:sveltekit-route-route_contract_mismatch-002-86cb947b`

