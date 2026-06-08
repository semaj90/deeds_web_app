# Deep Import Graph - Phase A
Generated: 2026-06-07T23:33:02.275Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 55459 |
| Total edges | 85004 |
| Resolved edges | 9435 |
| Unresolved (local) | 8521 |
| External refs | 65345 |
| Neighborhoods computed | 100 |
| Test-covered files | 995 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 47851 |
| script | 4914 |
| test | 1475 |
| types | 1040 |
| config | 140 |
| server | 29 |
| route | 7 |
| client | 3 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 67622 |
| test_covers_file | 4951 |
| redis_dependency | 3411 |
| imports_dynamic | 2388 |
| exports_from | 1984 |
| env_dependency | 1746 |
| qdrant_dependency | 1472 |
| neo4j_dependency | 576 |
| mcp_tool_calls | 496 |
| db_dependency | 355 |
| svelte_route_uses_loader | 3 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 2 | `scripts/atlas/_atlas-utils.mjs` | script | 82 | 0 |
| 3 | `scripts/atlas/_atlas-utils.mjs` | script | 82 | 0 |
| 4 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 78 | 0 |
| 5 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 77 | 5 |
| 6 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 7 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 8 | `claude-mem/src/shared/paths.ts` | shared | 57 | 2 |
| 9 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 44 | 2 |
| 10 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 11 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 12 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 13 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 14 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 15 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 16 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 17 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 41 | 0 |
| 18 | `deeds_labs/dead-scripts/syntax-repair/pattern-matcher.ts` | shared | 38 | 0 |
| 19 | `src/lib/server/ace/context-assembler.ts` | server | 38 | 0 |
| 20 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | shared | 37 | 0 |
