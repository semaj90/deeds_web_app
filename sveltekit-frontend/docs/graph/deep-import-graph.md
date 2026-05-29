# Deep Import Graph Report
Generated: 2026-05-29T15:35:41.357Z

## Stats
| Metric | Value |
|--------|-------|
| Files | 55303 |
| Resolved edges | 7414 |
| Circular chains | 15 |
| Files in cycles | 52 |
| Orphan files | 32295 |
| Missing file refs | 50 |

## Top 30 Coupling Hotspots
> Sorted by transitive fan-in (how many files depend on this file, directly or transitively)

| Rank | File | Direct FanIn | Transitive FanIn |
|------|------|-------------|-----------------|
| 1 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | 35 | 312 |
| 2 | `claude-mem/src/shared/paths.ts` | 56 | 310 |
| 3 | `claude-mem/src/utils/logger.ts` | 178 | 310 |
| 4 | `sveltekit-frontend/src/lib/server/redis.ts` | 32 | 160 |
| 5 | `claude-mem/src/shared/spawn.ts` | 5 | 130 |
| 6 | `claude-mem/src/supervisor/env-sanitizer.ts` | 8 | 130 |
| 7 | `claude-mem/src/supervisor/process-registry.ts` | 11 | 127 |
| 8 | `sveltekit-frontend/src/lib/server/db/schema-chat.ts` | 4 | 127 |
| 9 | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | 26 | 127 |
| 10 | `claude-mem/src/shared/hook-constants.ts` | 15 | 125 |
| 11 | `claude-mem/src/supervisor/health-checker.ts` | 2 | 123 |
| 12 | `claude-mem/src/supervisor/shutdown.ts` | 2 | 123 |
| 13 | `claude-mem/src/supervisor/index.ts` | 8 | 121 |
| 14 | `sveltekit-frontend/src/lib/server/db/schema/legal-cases.ts` | 6 | 115 |
| 15 | `sveltekit-frontend/src/lib/server/db/schema/citations.ts` | 2 | 110 |
| 16 | `sveltekit-frontend/src/lib/server/db/schema/codebase-intelligence.ts` | 2 | 110 |
| 17 | `sveltekit-frontend/src/lib/server/db/schema/evidence-multi-modal.ts` | 2 | 110 |
| 18 | `sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts` | 2 | 110 |
| 19 | `sveltekit-frontend/src/lib/db/schema/ace-web.ts` | 1 | 109 |
| 20 | `sveltekit-frontend/src/lib/server/db/schema/analytics.ts` | 1 | 109 |
| 21 | `sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts` | 2 | 109 |
| 22 | `sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts` | 1 | 109 |
| 23 | `sveltekit-frontend/src/lib/server/db/warden-schema.ts` | 2 | 109 |
| 24 | `sveltekit-frontend/src/lib/server/db/schema.ts` | 9 | 108 |
| 25 | `sveltekit-frontend/src/lib/server/db/schema-canvas.ts` | 1 | 106 |
| 26 | `sveltekit-frontend/src/lib/server/db/drizzle-cache.ts` | 1 | 105 |
| 27 | `sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts` | 1 | 105 |
| 28 | `sveltekit-frontend/tests/helpers/env-ports.ts` | 77 | 105 |
| 29 | `sveltekit-frontend/src/lib/server/db/client.ts` | 70 | 104 |
| 30 | `claude-mem/src/services/worker/RestartGuard.ts` | 3 | 102 |

## Circular Dependency Chains (15)
### Cycle 1 (2 files)
- `claude-mem/src/utils/logger.ts`
- `claude-mem/src/shared/paths.ts`

### Cycle 2 (2 files)
- `claude-mem/src/server/runtime/ServerBetaService.ts`
- `claude-mem/src/server/runtime/create-server-beta-service.ts`

### Cycle 3 (4 files)
- `claude-mem/src/services/worker/session/SessionCompletionHandler.ts`
- `claude-mem/src/services/worker/session/GeneratorExitHandler.ts`
- `claude-mem/src/services/worker-service.ts`
- `claude-mem/src/services/worker/events/SessionEventBroadcaster.ts`

### Cycle 4 (2 files)
- `deeds_labs/frontend/sveltekit-frontend-archive/dirs/src_fixed/vector-search-index.ts`
- `deeds_labs/frontend/sveltekit-frontend-archive/dirs/src_fixed/minio-service.ts`

### Cycle 5 (2 files)
- `deeds_labs/services/python-middleware/backend/watchers/code_ingest_watcher.ts`
- `deeds_labs/services/python-middleware/backend/pipeline/code_ingestion_pipeline.ts`

### Cycle 6 (2 files)
- `deeds_labs/services/python-middleware/python_codebase/utilities/scripts/backups/phase34b/lib/services/webasm-inference-rag.ts`
- `deeds_labs/services/python-middleware/python_codebase/utilities/scripts/backups/phase34b/lib/messaging/rabbitmq-xstate-integration.ts`

### Cycle 7 (2 files)
- `deeds_labs/services/python-middleware/python_codebase/utilities/scripts/backups/phase34b/lib/services/vector-search-index.ts`
- `deeds_labs/services/python-middleware/python_codebase/utilities/scripts/backups/phase34b/lib/services/minio-service.ts`

### Cycle 8 (6 files)
- `deeds_labs/snapshots/2026-03-10/root-stale/archives/typescript/typescript-backup/typescript-backup/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processDirective.ts`
- `deeds_labs/snapshots/2026-03-10/root-stale/archives/typescript/typescript-backup/typescript-backup/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processClsx.ts`
- `deeds_labs/snapshots/2026-03-10/root-stale/archives/typescript/typescript-backup/typescript-backup/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/sortClassesIntoCategories.ts`
- `deeds_labs/snapshots/2026-03-10/root-stale/archives/typescript/typescript-backup/typescript-backup/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processExpressions.ts`
- `deeds_labs/snapshots/2026-03-10/root-stale/archives/typescript/typescript-backup/typescript-backup/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processClassBody.ts`
- `deeds_labs/snapshots/2026-03-10/root-stale/archives/typescript/typescript-backup/typescript-backup/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processClasses.ts`

### Cycle 9 (2 files)
- `deeds_labs/snapshots/2026-03-10/root-stale/archives/typescript/typescript-backup/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processClsx.ts`
- `deeds_labs/snapshots/2026-03-10/root-stale/archives/typescript/typescript-backup/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processClasses.ts`

### Cycle 10 (6 files)
- `deeds_labs/snapshots/2026-03-10/root-stale/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processDirective.ts`
- `deeds_labs/snapshots/2026-03-10/root-stale/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processClsx.ts`
- `deeds_labs/snapshots/2026-03-10/root-stale/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/sortClassesIntoCategories.ts`
- `deeds_labs/snapshots/2026-03-10/root-stale/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processExpressions.ts`
- `deeds_labs/snapshots/2026-03-10/root-stale/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processClassBody.ts`
- `deeds_labs/snapshots/2026-03-10/root-stale/unocss-main/unocss-main/packages-integrations/svelte-scoped/src/_preprocess/transformClasses/processClasses.ts`

### Cycle 11 (2 files)
- `sveltekit-frontend/src/lib/server/db/schema-chat.ts`
- `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`

### Cycle 12 (2 files)
- `sveltekit-frontend/src/lib/server/queue/queue-worker.ts`
- `sveltekit-frontend/src/lib/server/queue/dispatch-inline.ts`

### Cycle 13 (14 files)
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/system-audit.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/ui-diagnostics.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/gpu-acceleration.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/repair.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/batch.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/memory.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/simulation.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/legal-case.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/vector-cluster.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/evidence.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/graph.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/codebase.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/research.ts`
- `sveltekit-frontend/src/lib/server/ai/hermes/skills/registry.ts`

### Cycle 14 (2 files)
- `sveltekit-frontend/src/lib/server/embedding/ingestion-queue.ts`
- `sveltekit-frontend/src/lib/server/embedding/embedding-repository.ts`

### Cycle 15 (2 files)
- `sveltekit-frontend/src/lib/server/search/retrieval-explainer.ts`
- `sveltekit-frontend/src/lib/server/search/hybrid-search.ts`

## Orphan Files (32295 files with 0 importers, not entrypoints)
> These may be dead code, dynamically imported, or need wiring

- `$lib/utils/file-reader.ts` (15 lines)
- `.cache/cards/09e185c179fb0407eded430b49c8a6a341caa29b.meta.json` (10 lines)
- `.cache/cards/fa794335a4b272bb90de7c96f6931bc3be88a08c.meta.json` (10 lines)
- `.cache/sveltecheck.candidate.json` (9 lines)
- `.cache/sveltecheck.candidate_clean.json` (9 lines)
- `.cache/sveltecheck.chunk.0.json` (100 lines)
- `.cache/sveltecheck.clean.json` (1 lines)
- `.cache/sveltecheck.clean.trimmed.json` (9 lines)
- `.cache/sveltecheck.diagnostics.json` (1 lines)
- `.cache/sveltecheck.trimmed.json` (103 lines)
- `.claude/hooks/posttooluse-audit.mjs` (54 lines)
- `.claude/hooks/pretooluse-deny.mjs` (110 lines)
- `.claude/mcp.json` (70 lines)
- `.claude/settings.json` (90 lines)
- `.claude/settings.local.json` (437 lines)
- `.github/hooks/rg.json` (10 lines)
- `.mcp.json` (32 lines)
- `.opencode/ace-context.json` (1 lines)
- `.opencode/ace-packet.json` (1416 lines)
- `.opencode/ace-packets/packet-89e34ac6-a15a-4d8f-84ec-1a118dab4c00.json` (52 lines)
- `.opencode/ace-packets_stale/packet-0b57dd4c-f695-4910-b3ba-c84b6b822e32.json` (383 lines)
- `.opencode/ace-packets_stale/packet-122d0988-998e-4835-bed2-5632d05b8165.json` (378 lines)
- `.opencode/ace-packets_stale/packet-149456da-ae1c-4d4e-b120-220cce7b7d74.json` (19835 lines)
- `.opencode/ace-packets_stale/packet-3bcafaf8-da68-43b0-b33b-30fe9830e61e.json` (213 lines)
- `.opencode/ace-packets_stale/packet-3c7d7ca2-e42d-45f3-82c2-590060813b4d.json` (100 lines)
- `.opencode/ace-packets_stale/packet-4e47e747-d909-4141-a86a-3d1e2268cb20.json` (11097 lines)
- `.opencode/ace-packets_stale/packet-6ca0e48c-5a47-42e9-be6a-8769d06d0bad.json` (11097 lines)
- `.opencode/ace-packets_stale/packet-7e78d6d5-9ab3-4e36-94bf-e5c18b521b36.json` (31884 lines)
- `.opencode/ace-packets_stale/packet-a614d225-687d-43ef-b4b4-62f67ec7ce33.json` (100 lines)
- `.opencode/ace-packets_stale/packet-c5f73dd6-f235-4f76-ae84-8a2d88d42cbf.json` (383 lines)
- `.opencode/ace-packets_stale/packet-ce568b27-ec87-40d0-9ea5-b2b791890c61.json` (19835 lines)
- `.opencode/ace-packets_stale/packet-f70e36b5-d047-4f9e-9b76-2c70050043d7.json` (213 lines)
- `.opencode/ace-packets_stale/packet-f7a458ec-db10-491f-80c9-e10608ad31c1.json` (378 lines)
- `.opencode/ace-patch-card.json` (64 lines)
- `.opencode/ace-seed-8ef3f5e3115160c1.json` (55 lines)
- `.opencode/cache/0024f386d46d7f23.json` (14 lines)
- `.opencode/cache/002eef270abc533c.json` (13 lines)
- `.opencode/cache/00376eb299856fbe.json` (13 lines)
- `.opencode/cache/005d877f65beacff.json` (14 lines)
- `.opencode/cache/0099365f2954a7c8.json` (13 lines)
- `.opencode/cache/01195c4fd7875b60.json` (14 lines)
- `.opencode/cache/0167f3ca94dc2620.json` (12 lines)
- `.opencode/cache/01aebc03901a5aaf.json` (13 lines)
- `.opencode/cache/01f0af8d35f3583f.json` (13 lines)
- `.opencode/cache/01f58df7c9edcea9.json` (13 lines)
- `.opencode/cache/02318915bf53fc79.json` (14 lines)
- `.opencode/cache/027d9c66454518f1.json` (15 lines)
- `.opencode/cache/027f978ee9724521.json` (14 lines)
- `.opencode/cache/02cb8a2cae16bdae.json` (13 lines)
- `.opencode/cache/02d6d5dac6b75c56.json` (17 lines)

_...and 32245 more (see deep-import-graph.json)_

## Possibly Missing Files (imported but not in graph)
| Path | Referenced by |
|------|--------------|
| `$lib/types` | 1945 files |
| `./$types.js` | 1288 files |
| `./$types` | 1269 files |
| `$lib/types/enhanced-svelte5-types` | 971 files |
| `$lib/server/db/client` | 534 files |
| `$lib/server/env.server.js` | 511 files |
| `$lib/components/ui/Button.svelte` | 328 files |
| `$lib/server/db` | 311 files |
| `$lib/server/redis.js` | 303 files |
| `$lib/components/ui/Icon.svelte` | 281 files |
| `$lib/server/db/schema-postgres` | 238 files |
| `$lib/server/ollama.js` | 178 files |
| `$lib/server/db/schema` | 164 files |
| `$lib/server/db/schema-postgres.js` | 161 files |
| `$lib/middleware/redis-orchestrator-middleware` | 135 files |
| `$lib/server/redis` | 125 files |
| `$lib/stores/unified` | 119 files |
| `./types.js` | 111 files |
| `$lib/server/middleware/cache-headers.js` | 110 files |
| `$lib/server/redis-client` | 107 files |
