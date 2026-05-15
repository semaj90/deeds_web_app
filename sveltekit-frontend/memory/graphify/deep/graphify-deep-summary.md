# Deep Import Graph - Phase A
Generated: 2026-05-15T03:36:03.840Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 32044 |
| Total edges | 75332 |
| Resolved edges | 25347 |
| Unresolved (local) | 8538 |
| External refs | 39745 |
| Neighborhoods computed | 100 |
| Test-covered files | 884 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 21160 |
| script | 4631 |
| client | 1725 |
| test | 1288 |
| route | 1157 |
| server | 976 |
| types | 967 |
| config | 140 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 56203 |
| test_covers_file | 4036 |
| db_dependency | 3430 |
| redis_dependency | 2844 |
| env_dependency | 2304 |
| imports_dynamic | 1827 |
| exports_from | 1756 |
| server_route_depends_on | 1108 |
| qdrant_dependency | 1053 |
| mcp_tool_calls | 389 |
| neo4j_dependency | 379 |
| svelte_route_uses_loader | 3 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/types.ts` | types | 4202 | 0 |
| 2 | `src/lib/types/enhanced-svelte5-types.ts` | types | 1924 | 1 |
| 3 | `src/lib/server/db/index.ts` | server | 808 | 3 |
| 4 | `src/lib/server/db/client.ts` | server | 698 | 7 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 636 | 1 |
| 6 | `src/lib/server/env.server.ts` | server | 522 | 0 |
| 7 | `src/lib/server/redis.ts` | server | 513 | 1 |
| 8 | `src/lib/components/ui/Button.svelte` | client | 443 | 0 |
| 9 | `src/lib/server/db/schema.ts` | server | 336 | 10 |
| 10 | `src/lib/components/ui/Icon.svelte` | client | 282 | 14 |
| 11 | `src/lib/components/ui/enhanced-bits.svelte` | client | 239 | 1 |
| 12 | `src/lib/server/ollama.ts` | server | 235 | 13 |
| 13 | `src/lib/server/db/drizzle.ts` | server | 130 | 5 |
| 14 | `src/lib/test-utils/setup.ts` | client | 119 | 0 |
| 15 | `src/lib/server/middleware/cache-headers.ts` | server | 110 | 0 |
| 16 | `src/lib/server/z-schemas.ts` | server | 109 | 0 |
| 17 | `src/lib/server/z-schemas.ts` | server | 109 | 0 |
| 18 | `src/lib/server/z-schemas.ts` | server | 109 | 0 |
| 19 | `src/lib/server/grpc/embedding-client.ts` | server | 107 | 7 |
| 20 | `src/lib/server/vector/qdrant-manager.ts` | server | 107 | 10 |
