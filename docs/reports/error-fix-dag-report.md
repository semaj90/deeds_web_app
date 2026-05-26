# Error-Fix DAG Report
_Generated: 2026-05-26T03:02:47.736Z_

**Total findings:** 5  |  **Active error states:** 2

## Recommended Fix Order

| Order | State | Severity | Findings | Root Score | Downstream |
|-------|-------|----------|----------|------------|------------|
| 5 | **Schema Mismatch** | medium | 1 | 0.25 | api_validation_gap |
| 8 | **API Validation Gap** | high | 4 | 0.8 | — |

## HMM States

### 5. Schema Mismatch

Drizzle schema column type does not match the live Postgres column type.

**Validation commands:**
- `npm run db:check`
- `npm run audit:contracts`
- `npm run test:network-contracts`

**Findings (1):**
- `contract:drizzle-meta-stale_migration-006-9d10ac6b`


### 8. API Validation Gap

API route processes untrusted input without Zod validation.

**Validation commands:**
- `npm run audit:forms`
- `npm run lint:drizzle`

**Findings (4):**
- `forms:api-route-json-without-zod:sveltekit-frontend\src\routes\api\ace\ask\+server.ts`
- `forms:api-route-json-without-zod:sveltekit-frontend\src\routes\api\memory\claude-mem\import\+server.ts`
- `forms:api-route-json-without-zod:sveltekit-frontend\src\routes\api\memory\agent-observation\+server.ts`
- `forms:api-route-json-without-zod:sveltekit-frontend\src\routes\api\internal\index-memory\+server.ts`

