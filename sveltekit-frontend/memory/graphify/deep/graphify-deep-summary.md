# Deep Import Graph - Phase A
Generated: 2026-05-13T18:22:02.961Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 4961 |
| Total edges | 15904 |
| Resolved edges | 8262 |
| Unresolved (local) | 1040 |
| External refs | 6369 |
| Neighborhoods computed | 100 |
| Test-covered files | 771 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| route | 1141 |
| test | 1003 |
| client | 966 |
| script | 903 |
| server | 819 |
| types | 129 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 8069 |
| test_covers_file | 2833 |
| server_route_depends_on | 1096 |
| db_dependency | 1056 |
| env_dependency | 737 |
| imports_dynamic | 637 |
| redis_dependency | 595 |
| exports_from | 290 |
| qdrant_dependency | 271 |
| mcp_tool_calls | 183 |
| neo4j_dependency | 136 |
| svelte_route_uses_loader | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/server/db/client.ts` | server | 555 | 7 |
| 2 | `src/lib/server/env.server.ts` | server | 483 | 0 |
| 3 | `src/lib/server/redis.ts` | server | 297 | 1 |
| 4 | `src/lib/components/ui/Icon.svelte` | client | 257 | 14 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 224 | 1 |
| 6 | `src/lib/server/ollama.ts` | server | 188 | 12 |
| 7 | `src/lib/types.ts` | types | 180 | 0 |
| 8 | `src/lib/server/middleware/cache-headers.ts` | server | 110 | 0 |
| 9 | `src/lib/server/db/schema.ts` | server | 104 | 10 |
| 10 | `src/lib/server/grpc/embedding-client.ts` | server | 100 | 7 |
| 11 | `src/lib/server/validation.ts` | server | 95 | 0 |
| 12 | `src/lib/server/vector/qdrant-manager.ts` | server | 92 | 10 |
| 13 | `src/lib/components/ui/Button.svelte` | client | 88 | 0 |
| 14 | `src/lib/server/gpu/libtorch-bridge.ts` | server | 51 | 2 |
| 15 | `src/lib/server/observability/langfuse.ts` | server | 48 | 1 |
| 16 | `src/lib/server/analytics/search-analytics.ts` | server | 41 | 7 |
| 17 | `src/lib/server/gpu/simdjson-bridge.ts` | server | 38 | 0 |
| 18 | `src/lib/server/neo4j-driver.ts` | server | 38 | 1 |
| 19 | `src/lib/server/ace/context-assembler.ts` | server | 33 | 36 |
| 20 | `src/lib/ai/model-ids.ts` | client | 31 | 1 |
