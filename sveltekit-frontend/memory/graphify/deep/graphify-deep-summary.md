# Deep Import Graph - Phase A
Generated: 2026-05-11T23:27:31.502Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 3935 |
| Total edges | 12928 |
| Resolved edges | 7621 |
| Unresolved (local) | 814 |
| External refs | 4307 |
| Neighborhoods computed | 100 |
| Test-covered files | 710 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| route | 1130 |
| client | 963 |
| test | 941 |
| server | 774 |
| types | 127 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 5884 |
| test_covers_file | 2705 |
| server_route_depends_on | 1081 |
| db_dependency | 970 |
| env_dependency | 671 |
| imports_dynamic | 511 |
| redis_dependency | 426 |
| exports_from | 291 |
| qdrant_dependency | 176 |
| mcp_tool_calls | 131 |
| neo4j_dependency | 81 |
| svelte_route_uses_loader | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/server/db/client.ts` | server | 525 | 7 |
| 2 | `src/lib/server/env.server.ts` | server | 470 | 0 |
| 3 | `src/lib/server/redis.ts` | server | 275 | 1 |
| 4 | `src/lib/components/ui/Icon.svelte` | client | 257 | 14 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 215 | 2 |
| 6 | `src/lib/server/ollama.ts` | server | 183 | 11 |
| 7 | `src/lib/server/middleware/cache-headers.ts` | server | 111 | 1 |
| 8 | `src/lib/server/db/schema.ts` | server | 98 | 10 |
| 9 | `src/lib/server/grpc/embedding-client.ts` | server | 96 | 7 |
| 10 | `src/lib/server/validation.ts` | server | 95 | 0 |
| 11 | `src/lib/components/ui/Button.svelte` | client | 89 | 0 |
| 12 | `src/lib/server/vector/qdrant-manager.ts` | server | 79 | 9 |
| 13 | `src/lib/server/gpu/libtorch-bridge.ts` | server | 50 | 1 |
| 14 | `src/lib/server/observability/langfuse.ts` | server | 46 | 2 |
| 15 | `src/lib/server/analytics/search-analytics.ts` | server | 41 | 7 |
| 16 | `src/lib/server/gpu/simdjson-bridge.ts` | server | 37 | 0 |
| 17 | `src/lib/server/neo4j-driver.ts` | server | 33 | 1 |
| 18 | `src/lib/server/ace/context-assembler.ts` | server | 32 | 36 |
| 19 | `src/lib/ai/model-ids.ts` | client | 30 | 0 |
| 20 | `src/lib/server/ai/code-intel-service.ts` | server | 29 | 12 |
