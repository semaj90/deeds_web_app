# Deep Import Graph - Phase A
Generated: 2026-06-13T22:39:40.495Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 48891 |
| Total edges | 106062 |
| Resolved edges | 12480 |
| Unresolved (local) | 10453 |
| External refs | 82106 |
| Neighborhoods computed | 95 |
| Test-covered files | 987 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 36707 |
| script | 6786 |
| test | 4425 |
| types | 785 |
| config | 80 |
| server | 78 |
| route | 21 |
| client | 9 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 74537 |
| test_covers_file | 13411 |
| redis_dependency | 4779 |
| imports_dynamic | 4395 |
| qdrant_dependency | 2782 |
| exports_from | 1752 |
| neo4j_dependency | 1337 |
| mcp_tool_calls | 1191 |
| env_dependency | 1152 |
| db_dependency | 722 |
| svelte_route_uses_loader | 4 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 195 | 20 |
| 2 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 195 | 20 |
| 3 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 195 | 20 |
| 4 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 195 | 20 |
| 5 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 189 | 0 |
| 6 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 189 | 0 |
| 7 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 189 | 0 |
| 8 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 9 | `src/lib/server/ace/context-assembler.ts` | server | 151 | 0 |
| 10 | `src/lib/server/ace/context-assembler.ts` | server | 151 | 0 |
| 11 | `src/lib/server/ace/context-assembler.ts` | server | 151 | 0 |
| 12 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 126 | 0 |
| 13 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 126 | 0 |
| 14 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 126 | 0 |
| 15 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 123 | 0 |
| 16 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 121 | 0 |
| 17 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 121 | 8 |
| 18 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 121 | 0 |
| 19 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 121 | 8 |
| 20 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 121 | 0 |
