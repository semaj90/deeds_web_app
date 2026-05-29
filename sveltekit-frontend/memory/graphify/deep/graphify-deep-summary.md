# Deep Import Graph - Phase A
Generated: 2026-05-29T21:42:43.062Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 55400 |
| Total edges | 81662 |
| Resolved edges | 9166 |
| Unresolved (local) | 8522 |
| External refs | 62271 |
| Neighborhoods computed | 100 |
| Test-covered files | 992 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 47852 |
| script | 4862 |
| test | 1467 |
| types | 1040 |
| config | 140 |
| server | 29 |
| route | 7 |
| client | 3 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 65012 |
| test_covers_file | 4930 |
| redis_dependency | 3217 |
| imports_dynamic | 2351 |
| exports_from | 1868 |
| env_dependency | 1745 |
| qdrant_dependency | 1257 |
| mcp_tool_calls | 472 |
| neo4j_dependency | 464 |
| db_dependency | 343 |
| svelte_route_uses_loader | 3 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 2 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 78 | 0 |
| 3 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 71 | 5 |
| 4 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 5 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 6 | `claude-mem/src/shared/paths.ts` | shared | 57 | 2 |
| 7 | `scripts/atlas/_atlas-utils.mjs` | script | 54 | 0 |
| 8 | `scripts/atlas/_atlas-utils.mjs` | script | 54 | 0 |
| 9 | `sveltekit-frontend/src/lib/server/redis.ts` | shared | 44 | 0 |
| 10 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 11 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 12 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 13 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 14 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 15 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 16 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 17 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 40 | 0 |
| 18 | `deeds_labs/dead-scripts/syntax-repair/pattern-matcher.ts` | shared | 38 | 0 |
| 19 | `src/lib/server/ace/context-assembler.ts` | server | 38 | 0 |
| 20 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | shared | 37 | 0 |
