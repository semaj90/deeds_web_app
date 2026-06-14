# Deep Import Graph - Phase A
Generated: 2026-06-14T16:39:02.591Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 57357 |
| Total edges | 129001 |
| Resolved edges | 14881 |
| Unresolved (local) | 12931 |
| External refs | 99930 |
| Neighborhoods computed | 91 |
| Test-covered files | 987 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 43338 |
| script | 7311 |
| test | 5489 |
| types | 975 |
| server | 104 |
| config | 100 |
| route | 28 |
| client | 12 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 90135 |
| test_covers_file | 16567 |
| redis_dependency | 5820 |
| imports_dynamic | 5447 |
| qdrant_dependency | 3452 |
| exports_from | 2167 |
| neo4j_dependency | 1639 |
| mcp_tool_calls | 1467 |
| env_dependency | 1417 |
| db_dependency | 885 |
| svelte_route_uses_loader | 5 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 2 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 3 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 4 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 5 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 234 | 25 |
| 6 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 234 | 25 |
| 7 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 234 | 25 |
| 8 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 234 | 25 |
| 9 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 234 | 25 |
| 10 | `src/lib/server/ace/context-assembler.ts` | server | 189 | 0 |
| 11 | `src/lib/server/ace/context-assembler.ts` | server | 189 | 0 |
| 12 | `src/lib/server/ace/context-assembler.ts` | server | 189 | 0 |
| 13 | `src/lib/server/ace/context-assembler.ts` | server | 189 | 0 |
| 14 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 15 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 16 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 17 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 18 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 19 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 148 | 0 |
| 20 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 148 | 0 |
