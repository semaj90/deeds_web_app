# Deep Import Graph - Phase A
Generated: 2026-05-25T07:08:00.330Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 33800 |
| Total edges | 77722 |
| Resolved edges | 7634 |
| Unresolved (local) | 8484 |
| External refs | 59901 |
| Neighborhoods computed | 100 |
| Test-covered files | 853 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 27278 |
| script | 4023 |
| test | 1309 |
| types | 1019 |
| config | 140 |
| server | 27 |
| client | 3 |
| route | 1 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 62305 |
| test_covers_file | 4223 |
| redis_dependency | 3082 |
| imports_dynamic | 2253 |
| exports_from | 1760 |
| env_dependency | 1736 |
| qdrant_dependency | 1164 |
| mcp_tool_calls | 439 |
| neo4j_dependency | 433 |
| db_dependency | 323 |
| svelte_route_uses_loader | 3 |
| server_route_depends_on | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 78 | 0 |
| 2 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 70 | 5 |
| 3 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 4 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 5 | `scripts/atlas/_atlas-utils.mjs` | script | 52 | 0 |
| 6 | `scripts/atlas/_atlas-utils.mjs` | script | 52 | 0 |
| 7 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 8 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 9 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 10 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 11 | `sveltekit-frontend/src/lib/server/redis.ts` | shared | 42 | 0 |
| 12 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 13 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 14 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 15 | `deeds_labs/dead-scripts/syntax-repair/pattern-matcher.ts` | shared | 38 | 0 |
| 16 | `src/lib/server/ace/context-assembler.ts` | server | 38 | 0 |
| 17 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 31 | 0 |
| 18 | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | shared | 28 | 1 |
| 19 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/components/ui/gaming/types/gaming-types.ts` | types | 27 | 0 |
| 20 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/components/ui/gaming/types/gaming-types.ts` | types | 27 | 0 |
