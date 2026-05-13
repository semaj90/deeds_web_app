# Deep Import Graph - Phase A
Generated: 2026-05-13T00:18:18.977Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 4034 |
| Total edges | 13214 |
| Resolved edges | 7789 |
| Unresolved (local) | 820 |
| External refs | 4419 |
| Neighborhoods computed | 100 |
| Test-covered files | 757 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| route | 1137 |
| test | 989 |
| client | 966 |
| server | 813 |
| types | 129 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 6009 |
| test_covers_file | 2809 |
| server_route_depends_on | 1093 |
| db_dependency | 987 |
| env_dependency | 676 |
| imports_dynamic | 523 |
| redis_dependency | 428 |
| exports_from | 291 |
| qdrant_dependency | 180 |
| mcp_tool_calls | 133 |
| neo4j_dependency | 84 |
| svelte_route_uses_loader | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/server/db/client.ts` | server | 534 | 7 |
| 2 | `src/lib/server/env.server.ts` | server | 475 | 0 |
| 3 | `src/lib/server/redis.ts` | server | 277 | 1 |
| 4 | `src/lib/components/ui/Icon.svelte` | client | 257 | 14 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 215 | 2 |
| 6 | `src/lib/server/ollama.ts` | server | 185 | 12 |
| 7 | `src/lib/server/middleware/cache-headers.ts` | server | 111 | 1 |
| 8 | `src/lib/server/db/schema.ts` | server | 103 | 10 |
| 9 | `src/lib/server/grpc/embedding-client.ts` | server | 98 | 7 |
| 10 | `src/lib/server/validation.ts` | server | 95 | 0 |
| 11 | `src/lib/components/ui/Button.svelte` | client | 89 | 0 |
| 12 | `src/lib/server/vector/qdrant-manager.ts` | server | 82 | 10 |
| 13 | `src/lib/server/gpu/libtorch-bridge.ts` | server | 51 | 2 |
| 14 | `src/lib/server/observability/langfuse.ts` | server | 47 | 2 |
| 15 | `src/lib/server/analytics/search-analytics.ts` | server | 41 | 7 |
| 16 | `src/lib/server/gpu/simdjson-bridge.ts` | server | 37 | 0 |
| 17 | `src/lib/server/ace/context-assembler.ts` | server | 33 | 36 |
| 18 | `src/lib/server/neo4j-driver.ts` | server | 33 | 1 |
| 19 | `src/lib/ai/model-ids.ts` | client | 30 | 1 |
| 20 | `src/lib/server/ai/code-intel-service.ts` | server | 29 | 12 |
