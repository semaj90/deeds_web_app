# Deep Import Graph - Phase A
Generated: 2026-05-23T05:52:18.778Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 33538 |
| Total edges | 77266 |
| Resolved edges | 7550 |
| Unresolved (local) | 8480 |
| External refs | 59533 |
| Neighborhoods computed | 100 |
| Test-covered files | 846 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 27101 |
| script | 3959 |
| test | 1301 |
| types | 1017 |
| config | 140 |
| server | 19 |
| client | 1 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 61957 |
| test_covers_file | 4209 |
| redis_dependency | 3031 |
| imports_dynamic | 2244 |
| exports_from | 1760 |
| env_dependency | 1724 |
| qdrant_dependency | 1157 |
| mcp_tool_calls | 440 |
| neo4j_dependency | 433 |
| db_dependency | 308 |
| svelte_route_uses_loader | 3 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 78 | 0 |
| 2 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 3 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 4 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 63 | 5 |
| 5 | `scripts/atlas/_atlas-utils.mjs` | script | 52 | 0 |
| 6 | `scripts/atlas/_atlas-utils.mjs` | script | 52 | 0 |
| 7 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 8 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 9 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 10 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 11 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 12 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 13 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 14 | `deeds_labs/dead-scripts/syntax-repair/pattern-matcher.ts` | shared | 38 | 0 |
| 15 | `src/lib/server/ace/context-assembler.ts` | server | 38 | 0 |
| 16 | `sveltekit-frontend/src/lib/server/redis.ts` | shared | 34 | 0 |
| 17 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/components/ui/gaming/types/gaming-types.ts` | types | 27 | 0 |
| 18 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/components/ui/gaming/types/gaming-types.ts` | types | 27 | 0 |
| 19 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/components/ui/gaming/types/gaming-types.ts` | types | 27 | 0 |
| 20 | `sveltekit-frontend/tests/e2e/route-forensic/_helpers.ts` | shared | 27 | 1 |
