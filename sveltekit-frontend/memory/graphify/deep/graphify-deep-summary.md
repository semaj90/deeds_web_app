# Deep Import Graph - Phase A
Generated: 2026-06-01T06:25:34.235Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 56788 |
| Total edges | 83242 |
| Resolved edges | 9264 |
| Unresolved (local) | 8576 |
| External refs | 63699 |
| Neighborhoods computed | 100 |
| Test-covered files | 992 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 49400 |
| script | 4700 |
| test | 1468 |
| types | 1041 |
| config | 140 |
| server | 29 |
| route | 7 |
| client | 3 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 66240 |
| test_covers_file | 4937 |
| redis_dependency | 3292 |
| imports_dynamic | 2364 |
| exports_from | 1981 |
| env_dependency | 1745 |
| qdrant_dependency | 1321 |
| neo4j_dependency | 518 |
| mcp_tool_calls | 489 |
| db_dependency | 352 |
| svelte_route_uses_loader | 3 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 2 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 78 | 0 |
| 3 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 75 | 5 |
| 4 | `scripts/atlas/_atlas-utils.mjs` | script | 72 | 0 |
| 5 | `scripts/atlas/_atlas-utils.mjs` | script | 72 | 0 |
| 6 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 7 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 8 | `claude-mem/src/shared/paths.ts` | shared | 57 | 2 |
| 9 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 10 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 11 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 12 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 13 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 14 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 15 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 16 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 41 | 2 |
| 17 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 40 | 0 |
| 18 | `deeds_labs/dead-scripts/syntax-repair/pattern-matcher.ts` | shared | 38 | 0 |
| 19 | `src/lib/server/ace/context-assembler.ts` | server | 38 | 0 |
| 20 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | shared | 37 | 0 |
