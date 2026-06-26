# Deep Import Graph - Phase A
Generated: 2026-06-25T22:51:13.375Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 68251 |
| Total edges | 158000 |
| Resolved edges | 22509 |
| Unresolved (local) | 10535 |
| External refs | 123423 |
| Neighborhoods computed | 87 |
| Test-covered files | 1017 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 55003 |
| test | 6621 |
| script | 5317 |
| types | 1186 |
| config | 124 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 109959 |
| test_covers_file | 19922 |
| redis_dependency | 7158 |
| imports_dynamic | 6580 |
| qdrant_dependency | 4631 |
| exports_from | 2715 |
| neo4j_dependency | 2208 |
| mcp_tool_calls | 1840 |
| env_dependency | 1777 |
| db_dependency | 1204 |
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
