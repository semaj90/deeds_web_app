# Deep Import Graph - Phase A
Generated: 2026-05-18T08:27:52.934Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 32886 |
| Total edges | 76350 |
| Resolved edges | 7351 |
| Unresolved (local) | 8461 |
| External refs | 58835 |
| Neighborhoods computed | 100 |
| Test-covered files | 819 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 26560 |
| script | 3904 |
| test | 1265 |
| types | 1017 |
| config | 140 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 61352 |
| test_covers_file | 4109 |
| redis_dependency | 2940 |
| imports_dynamic | 2227 |
| exports_from | 1756 |
| env_dependency | 1723 |
| qdrant_dependency | 1117 |
| neo4j_dependency | 423 |
| mcp_tool_calls | 414 |
| db_dependency | 286 |
| svelte_route_uses_loader | 3 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 77 | 0 |
| 2 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 3 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 63 | 0 |
| 4 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 58 | 5 |
| 5 | `scripts/atlas/_atlas-utils.mjs` | script | 50 | 0 |
| 6 | `scripts/atlas/_atlas-utils.mjs` | script | 50 | 0 |
| 7 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 8 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 9 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 10 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 11 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 12 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 13 | `deeds_labs/dead_code/contradictionEngine/types.ts` | types | 41 | 0 |
| 14 | `deeds_labs/dead-scripts/syntax-repair/pattern-matcher.ts` | shared | 38 | 0 |
| 15 | `sveltekit-frontend/src/lib/server/redis.ts` | shared | 31 | 0 |
| 16 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/components/ui/gaming/types/gaming-types.ts` | types | 27 | 0 |
| 17 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/components/ui/gaming/types/gaming-types.ts` | types | 27 | 0 |
| 18 | `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/components/ui/gaming/types/gaming-types.ts` | types | 27 | 0 |
| 19 | `sveltekit-frontend/tests/e2e/route-forensic/_helpers.ts` | shared | 27 | 1 |
| 20 | `deeds_labs/dead-scripts/phase-scripts/phase90-enhanced-ast-fixer.mjs` | shared | 24 | 0 |
