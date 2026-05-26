# Deep Import Graph - Phase A
Generated: 2026-05-26T21:09:37.682Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 34549 |
| Total edges | 80370 |
| Resolved edges | 9128 |
| Unresolved (local) | 8489 |
| External refs | 61050 |
| Neighborhoods computed | 100 |
| Test-covered files | 992 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 27813 |
| script | 4057 |
| test | 1467 |
| types | 1040 |
| config | 140 |
| server | 27 |
| client | 3 |
| route | 2 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 63942 |
| test_covers_file | 4930 |
| redis_dependency | 3149 |
| imports_dynamic | 2333 |
| exports_from | 1868 |
| env_dependency | 1738 |
| qdrant_dependency | 1169 |
| mcp_tool_calls | 458 |
| neo4j_dependency | 433 |
| db_dependency | 346 |
| svelte_route_uses_loader | 3 |
| server_route_depends_on | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 2 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 78 | 0 |
| 3 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 71 | 5 |
| 4 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 5 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 6 | `claude-mem/src/shared/paths.ts` | shared | 57 | 2 |
| 7 | `scripts/atlas/_atlas-utils.mjs` | script | 52 | 0 |
| 8 | `scripts/atlas/_atlas-utils.mjs` | script | 52 | 0 |
| 9 | `sveltekit-frontend/src/lib/server/redis.ts` | shared | 46 | 0 |
| 10 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 11 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 12 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 13 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 14 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 15 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 16 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 17 | `deeds_labs/dead-scripts/syntax-repair/pattern-matcher.ts` | shared | 38 | 0 |
| 18 | `src/lib/server/ace/context-assembler.ts` | server | 38 | 0 |
| 19 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | shared | 37 | 0 |
| 20 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 33 | 0 |
