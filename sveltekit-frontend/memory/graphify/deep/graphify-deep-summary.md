# Deep Import Graph - Phase A
Generated: 2026-06-16T00:54:12.760Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 58550 |
| Total edges | 131652 |
| Resolved edges | 15217 |
| Unresolved (local) | 12972 |
| External refs | 102168 |
| Neighborhoods computed | 91 |
| Test-covered files | 992 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 44298 |
| script | 7512 |
| test | 5506 |
| types | 986 |
| config | 104 |
| server | 104 |
| route | 28 |
| client | 12 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 92049 |
| test_covers_file | 16609 |
| redis_dependency | 5916 |
| imports_dynamic | 5472 |
| qdrant_dependency | 3688 |
| exports_from | 2289 |
| neo4j_dependency | 1706 |
| mcp_tool_calls | 1569 |
| env_dependency | 1453 |
| db_dependency | 896 |
| svelte_route_uses_loader | 5 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 2 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 3 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 4 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 5 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 235 | 25 |
| 6 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 235 | 25 |
| 7 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 235 | 25 |
| 8 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 235 | 25 |
| 9 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 235 | 25 |
| 10 | `src/lib/server/ace/context-assembler.ts` | server | 189 | 0 |
| 11 | `src/lib/server/ace/context-assembler.ts` | server | 189 | 0 |
| 12 | `src/lib/server/ace/context-assembler.ts` | server | 189 | 0 |
| 13 | `src/lib/server/ace/context-assembler.ts` | server | 189 | 0 |
| 14 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 15 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 16 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 17 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 18 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 19 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 149 | 10 |
| 20 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 149 | 10 |
