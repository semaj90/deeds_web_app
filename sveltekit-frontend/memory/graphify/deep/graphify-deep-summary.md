# Deep Import Graph - Phase A
Generated: 2026-06-27T23:07:06.296Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 68369 |
| Total edges | 158418 |
| Resolved edges | 22360 |
| Unresolved (local) | 10761 |
| External refs | 123764 |
| Neighborhoods computed | 87 |
| Test-covered files | 1045 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 55082 |
| test | 6628 |
| script | 5347 |
| types | 1188 |
| config | 124 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 110422 |
| test_covers_file | 19939 |
| redis_dependency | 7186 |
| imports_dynamic | 6629 |
| qdrant_dependency | 4648 |
| exports_from | 2748 |
| neo4j_dependency | 2222 |
| mcp_tool_calls | 1853 |
| env_dependency | 1563 |
| db_dependency | 1202 |
| svelte_route_uses_loader | 6 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 405 | 0 |
| 2 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 405 | 0 |
| 3 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 405 | 0 |
| 4 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 405 | 0 |
| 5 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 405 | 0 |
| 6 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 334 | 30 |
| 7 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 334 | 30 |
| 8 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 334 | 30 |
| 9 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 334 | 30 |
| 10 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 334 | 30 |
| 11 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 334 | 30 |
| 12 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 245 | 0 |
| 13 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 245 | 0 |
| 14 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 245 | 0 |
| 15 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 245 | 0 |
| 16 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 245 | 0 |
| 17 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 216 | 12 |
| 18 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 216 | 12 |
| 19 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 216 | 12 |
| 20 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 216 | 12 |
