# Deep Import Graph - Phase A
Generated: 2026-05-12T17:13:21.434Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 3966 |
| Total edges | 13048 |
| Resolved edges | 7707 |
| Unresolved (local) | 816 |
| External refs | 4339 |
| Neighborhoods computed | 100 |
| Test-covered files | 710 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| route | 1161 |
| test | 945 |
| client | 932 |
| server | 801 |
| types | 127 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 5964 |
| test_covers_file | 2705 |
| server_route_depends_on | 1089 |
| db_dependency | 982 |
| env_dependency | 676 |
| imports_dynamic | 521 |
| redis_dependency | 425 |
| exports_from | 291 |
| qdrant_dependency | 179 |
| mcp_tool_calls | 131 |
| neo4j_dependency | 84 |
| svelte_route_uses_loader | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/server/db/client.ts` | server | 531 | 7 |
| 2 | `src/lib/server/env.server.ts` | server | 475 | 0 |
| 3 | `src/lib/server/redis.ts` | server | 274 | 1 |
| 4 | `src/lib/components/ui/Icon.svelte` | client | 257 | 14 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 215 | 2 |
| 6 | `src/lib/server/ollama.ts` | server | 185 | 12 |
| 7 | `src/lib/server/middleware/cache-headers.ts` | server | 111 | 1 |
| 8 | `src/lib/server/db/schema.ts` | server | 103 | 10 |
| 9 | `src/lib/server/grpc/embedding-client.ts` | server | 98 | 7 |
| 10 | `src/lib/server/validation.ts` | server | 95 | 0 |
| 11 | `src/lib/components/ui/Button.svelte` | client | 89 | 0 |
| 12 | `src/lib/server/vector/qdrant-manager.ts` | server | 81 | 10 |
| 13 | `src/lib/server/gpu/libtorch-bridge.ts` | server | 51 | 2 |
| 14 | `src/lib/server/observability/langfuse.ts` | server | 46 | 2 |
| 15 | `src/lib/server/analytics/search-analytics.ts` | server | 41 | 7 |
| 16 | `src/lib/server/gpu/simdjson-bridge.ts` | server | 37 | 0 |
| 17 | `src/lib/server/neo4j-driver.ts` | server | 33 | 1 |
| 18 | `src/lib/server/ace/context-assembler.ts` | server | 32 | 36 |
| 19 | `src/lib/ai/model-ids.ts` | client | 30 | 1 |
| 20 | `src/lib/server/ai/code-intel-service.ts` | server | 29 | 12 |
