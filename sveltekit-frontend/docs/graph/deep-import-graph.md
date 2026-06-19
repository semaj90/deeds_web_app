# Deep Import Graph Report
Generated: 2026-06-19T22:45:24.448Z

## Stats
| Metric | Value |
|--------|-------|
| Files | 58673 |
| Resolved edges | 4438 |
| Circular chains | 9 |
| Files in cycles | 20 |
| Orphan files | 15202 |
| Missing file refs | 50 |

## Top 30 Coupling Hotspots
> Sorted by transitive fan-in (how many files depend on this file, directly or transitively)

| Rank | File | Direct FanIn | Transitive FanIn |
|------|------|-------------|-----------------|
| 1 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | 35 | 312 |
| 2 | `claude-mem/src/shared/paths.ts` | 56 | 310 |
| 3 | `claude-mem/src/utils/logger.ts` | 178 | 310 |
| 4 | `claude-mem/src/shared/spawn.ts` | 5 | 130 |
| 5 | `claude-mem/src/supervisor/env-sanitizer.ts` | 8 | 130 |
| 6 | `claude-mem/src/supervisor/process-registry.ts` | 11 | 127 |
| 7 | `claude-mem/src/shared/hook-constants.ts` | 15 | 125 |
| 8 | `claude-mem/src/supervisor/health-checker.ts` | 2 | 123 |
| 9 | `claude-mem/src/supervisor/shutdown.ts` | 2 | 123 |
| 10 | `claude-mem/src/supervisor/index.ts` | 8 | 121 |
| 11 | `claude-mem/src/services/worker/RestartGuard.ts` | 3 | 102 |
| 12 | `claude-mem/src/shared/platform-source.ts` | 12 | 102 |
| 13 | `claude-mem/src/services/worker-types.ts` | 22 | 101 |
| 14 | `claude-mem/src/utils/worktree.ts` | 1 | 100 |
| 15 | `claude-mem/src/services/sqlite/PendingMessageStore.ts` | 7 | 99 |
| 16 | `claude-mem/src/types/database.ts` | 7 | 99 |
| 17 | `claude-mem/src/utils/project-name.ts` | 12 | 99 |
| 18 | `claude-mem/src/services/domain/types.ts` | 5 | 97 |
| 19 | `claude-mem/src/services/domain/ModeManager.ts` | 17 | 94 |
| 20 | `claude-mem/src/services/sqlite/observations/types.ts` | 10 | 93 |
| 21 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | 18 | 92 |
| 22 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | 62 | 90 |
| 23 | `sveltekit-frontend/tests/helpers/env-ports.ts` | 62 | 90 |
| 24 | `claude-mem/src/services/sqlite/observations/files.ts` | 4 | 88 |
| 25 | `claude-mem/src/services/sqlite/observations/store.ts` | 4 | 88 |
| 26 | `claude-mem/src/services/sqlite/types.ts` | 9 | 84 |
| 27 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/schema-chat.ts` | 3 | 81 |
| 28 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | 22 | 81 |
| 29 | `claude-mem/src/services/server/ErrorHandler.ts` | 6 | 79 |
| 30 | `claude-mem/src/services/sqlite/SessionStore.ts` | 21 | 72 |

## Circular Dependency Chains (9)
### Cycle 1 (2 files)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/schema-chat.ts`
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/schema-postgres.ts`

### Cycle 2 (2 files)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/queue/queue-worker.ts`
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/queue/dispatch-inline.ts`

### Cycle 3 (2 files)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/embedding/ingestion-queue.ts`
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/embedding/embedding-repository.ts`

### Cycle 4 (2 files)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/search/retrieval-explainer.ts`
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/search/hybrid-search.ts`

### Cycle 5 (2 files)
- `claude-mem/src/utils/logger.ts`
- `claude-mem/src/shared/paths.ts`

### Cycle 6 (2 files)
- `claude-mem/src/server/runtime/ServerBetaService.ts`
- `claude-mem/src/server/runtime/create-server-beta-service.ts`

### Cycle 7 (4 files)
- `claude-mem/src/services/worker/session/SessionCompletionHandler.ts`
- `claude-mem/src/services/worker/session/GeneratorExitHandler.ts`
- `claude-mem/src/services/worker-service.ts`
- `claude-mem/src/services/worker/events/SessionEventBroadcaster.ts`

### Cycle 8 (2 files)
- `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/dialog/index.ts`
- `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/dialog/dialog-content.svelte`

### Cycle 9 (2 files)
- `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/scroll-area/scroll-area.svelte`
- `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/scroll-area/index.ts`

## Orphan Files (15202 files with 0 importers, not entrypoints)
> These may be dead code, dynamically imported, or need wiring

- `$lib/utils/file-reader.ts` (15 lines)
- `.claude/hooks/posttooluse-audit.mjs` (54 lines)
- `.claude/hooks/pretooluse-deny.mjs` (110 lines)
- `.claude/mcp.json` (70 lines)
- `.claude/settings.json` (90 lines)
- `.claude/settings.local.json` (478 lines)
- `.claude/worktrees/agent-a7203461/.claude/hooks/posttooluse-audit.mjs` (54 lines)
- `.claude/worktrees/agent-a7203461/.claude/hooks/pretooluse-deny.mjs` (110 lines)
- `.claude/worktrees/agent-a7203461/.claude/mcp.json` (70 lines)
- `.claude/worktrees/agent-a7203461/.claude/settings.json` (90 lines)
- `.claude/worktrees/agent-a38668f2/.github/hooks/rg.json` (10 lines)
- `.claude/worktrees/agent-a38668f2/.mcp.json` (32 lines)
- `.claude/worktrees/agent-a38668f2/.vscode/extensions.json` (5 lines)
- `.claude/worktrees/agent-a38668f2/.vscode/launch.json` (2 lines)
- `.vscode/tasks.json` (11375 lines)
- `.claude/worktrees/agent-a7203461/atlas.config.json` (65 lines)
- `.claude/worktrees/agent-a7203461/audit/public-route-allowlist.json` (13 lines)
- `.claude/worktrees/agent-a38668f2/CMakePresets.json` (47 lines)
- `.claude/worktrees/agent-a7203461/crates/atlas_packet_parser/index.d.ts` (7 lines)
- `.claude/worktrees/agent-a7203461/crates/atlas_packet_parser/package.json` (25 lines)
- `.claude/worktrees/agent-a38668f2/crates/atlas_packet_parser/target/.rustc_info.json` (1 lines)
- `.claude/worktrees/agent-a7203461/crates/turbovec-napi/index.d.ts` (44 lines)
- `.claude/worktrees/agent-a7203461/crates/turbovec-napi/package.json` (27 lines)
- `.claude/worktrees/agent-a38668f2/crates/turbovec-napi/target/.rustc_info.json` (1 lines)
- `.claude/worktrees/agent-a7203461/crates/turbovec-napi/wrapper.d.ts` (85 lines)
- `.claude/worktrees/agent-a7203461/crates/turbovec-napi/wrapper.js` (21 lines)
- `.claude/worktrees/agent-a7203461/data/couchdb-ingest-registry.json` (7 lines)
- `.claude/worktrees/agent-a38668f2/docker/bifrost/config.json` (81 lines)
- `.claude/worktrees/agent-a7203461/docker/seaweedfs/s3.json` (41 lines)
- `.claude/worktrees/agent-a38668f2/docs/ai-os/atlas-retry-index.json` (4 lines)
- `.claude/worktrees/agent-a38668f2/docs/atlas/cluster-cards.json` (8726 lines)
- `.claude/worktrees/agent-a38668f2/docs/atlas/feature-registry.json` (46718 lines)
- `.claude/worktrees/agent-a38668f2/docs/atlas/parent-atlas.json` (53 lines)
- `.claude/worktrees/agent-a38668f2/docs/atlas/retry-queries.json` (70 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/atlas-write-manifest.json` (28 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/atlas-write-scale-report.json` (184 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/batch-gpu-analysis-report.json` (10 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/codebase-feature-map.json` (84 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/codebase-graph.json` (235686 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/codebase-semantics-neo4j-report.json` (6426 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/contract-error-map.json` (6 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/directory-role-map.json` (946 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/error-fix-proposals.json` (272 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/kanban-board.json` (95670 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/karpathy-synthesis-scale-report.json` (28 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/missing-features-path-map.json` (55 lines)
- `.claude/worktrees/agent-a38668f2/docs/graph/programming-doc-feature-gap-report.json` (142 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/programming-doc-sources.json` (100 lines)
- `.claude/worktrees/agent-a7203461/docs/graph/programming-docs-ingestion-report.json` (31 lines)
- `.claude/worktrees/agent-a38668f2/docs/graph/qdrant-cluster-tag-audit.json` (2010 lines)

_...and 15152 more (see deep-import-graph.json)_

## Possibly Missing Files (imported but not in graph)
| Path | Referenced by |
|------|--------------|
| `./$types` | 1082 files |
| `$lib/server/db/client` | 570 files |
| `$lib/server/env.server.js` | 554 files |
| `./$types.js` | 552 files |
| `$lib/server/redis.js` | 343 files |
| `$lib/types` | 341 files |
| `$lib/components/ui/Icon.svelte` | 267 files |
| `$lib/server/db/schema-postgres.js` | 190 files |
| `$lib/server/ollama.js` | 187 files |
| `$lib/server/validation.js` | 132 files |
| `$lib/server/db` | 129 files |
| `$lib/server/middleware/cache-headers.js` | 127 files |
| `$lib/server/db/schema-postgres` | 126 files |
| `$lib/server/db/schema` | 99 files |
| `$lib/server/grpc/embedding-client.js` | 96 files |
| `$lib/components/ui/Button.svelte` | 92 files |
| `$lib/server/vector/qdrant-manager.js` | 92 files |
| `$lib/enums` | 83 files |
| `$lib/components/ui/utils.js` | 73 files |
| `$lib/server/db/client.js` | 65 files |
