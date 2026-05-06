# Deep Import Graph Report
Generated: 2026-05-06T22:39:18.426Z

## Stats
| Metric | Value |
|--------|-------|
| Files | 3590 |
| Resolved edges | 6855 |
| Circular chains | 10 |
| Files in cycles | 27 |
| Orphan files | 399 |
| Missing file refs | 42 |

## Top 30 Coupling Hotspots
> Sorted by transitive fan-in (how many files depend on this file, directly or transitively)

| Rank | File | Direct FanIn | Transitive FanIn |
|------|------|-------------|-----------------|
| 1 | `src/lib/server/env.server.ts` | 329 | 1657 |
| 2 | `src/lib/server/redis.ts` | 218 | 1508 |
| 3 | `src/lib/server/db/schema/citations.ts` | 2 | 1401 |
| 4 | `src/lib/db/schema/ace-web.ts` | 2 | 1396 |
| 5 | `src/lib/server/db/schema/analytics.ts` | 1 | 1396 |
| 6 | `src/lib/server/db/schema-canvas-autosaves.ts` | 2 | 1396 |
| 7 | `src/lib/server/db/schema-canvas.ts` | 2 | 1396 |
| 8 | `src/lib/server/db/schema-chat.ts` | 3 | 1396 |
| 9 | `src/lib/server/db/schema-evidence-crud.ts` | 2 | 1396 |
| 10 | `src/lib/server/db/schema-phase89-preserved.ts` | 1 | 1396 |
| 11 | `src/lib/server/db/schema-postgres.ts` | 181 | 1396 |
| 12 | `src/lib/server/db/schema.ts` | 82 | 1396 |
| 13 | `src/lib/server/db/warden-schema.ts` | 2 | 1396 |
| 14 | `src/lib/server/observability/langfuse.ts` | 44 | 1308 |
| 15 | `src/lib/server/db/drizzle-cache.ts` | 1 | 1265 |
| 16 | `src/lib/server/db/client.ts` | 419 | 1264 |
| 17 | `src/lib/server/gpu/simdjson-bridge.ts` | 31 | 854 |
| 18 | `src/lib/ai/model-ids.ts` | 26 | 803 |
| 19 | `src/lib/server/neo4j-driver.ts` | 32 | 789 |
| 20 | `src/lib/server/cache-keys.ts` | 13 | 775 |
| 21 | `src/lib/server/cache/redis-exact-match.ts` | 12 | 761 |
| 22 | `src/lib/server/circuit-breaker.ts` | 7 | 755 |
| 23 | `src/lib/server/ai/token-tracker.ts` | 8 | 750 |
| 24 | `src/lib/server/utils/retry.ts` | 3 | 749 |
| 25 | `src/lib/server/ai/hypergraph-store.ts` | 4 | 748 |
| 26 | `src/lib/server/ai/llm-cache-trace.ts` | 2 | 748 |
| 27 | `src/lib/server/observability/inference-log.ts` | 11 | 748 |
| 28 | `src/lib/server/ollama.ts` | 163 | 748 |
| 29 | `src/lib/services/couchdb-client.ts` | 20 | 748 |
| 30 | `src/lib/types/enhanced-svelte5-types.ts` | 27 | 517 |

## Circular Dependency Chains (10)
### Cycle 1 (6 files)
- `src/lib/server/db/schema-canvas.ts`
- `src/lib/server/db/schema-canvas-autosaves.ts`
- `src/lib/server/db/schema-chat.ts`
- `src/lib/server/db/schema-evidence-crud.ts`
- `src/lib/server/db/schema.ts`
- `src/lib/server/db/schema-postgres.ts`

### Cycle 2 (4 files)
- `src/lib/server/ai/hypergraph-store.ts`
- `src/lib/services/couchdb-client.ts`
- `src/lib/server/observability/inference-log.ts`
- `src/lib/server/ollama.ts`

### Cycle 3 (2 files)
- `src/lib/server/queue/dispatch-inline.ts`
- `src/lib/server/queue/queue-worker.ts`

### Cycle 4 (2 files)
- `src/lib/server/grpc/graph-ml-client.ts`
- `src/lib/server/cartridge/glyph-tile-engine.ts`

### Cycle 5 (2 files)
- `src/lib/server/services/langextract-service.ts`
- `src/lib/server/langextract/native.ts`

### Cycle 6 (2 files)
- `src/lib/server/inference/turbo-prefix-cache.ts`
- `src/lib/server/analytics/web-research-crawler.ts`

### Cycle 7 (2 files)
- `src/lib/server/analytics/research-refiner.ts`
- `src/lib/server/analytics/deep-research.ts`

### Cycle 8 (2 files)
- `src/lib/server/embedding/ingestion-queue.ts`
- `src/lib/server/embedding/embedding-repository.ts`

### Cycle 9 (3 files)
- `src/lib/server/obsidian/markdown-wiki-note.ts`
- `src/lib/server/obsidian/wiki-vault-watcher.ts`
- `src/lib/server/indexer/karpathy-wiki.ts`

### Cycle 10 (2 files)
- `src/lib/server/search/retrieval-explainer.ts`
- `src/lib/server/search/hybrid-search.ts`

## Orphan Files (399 files with 0 importers, not entrypoints)
> These may be dead code, dynamically imported, or need wiring

- `src/ambient-legacy.d.ts` (16 lines)
- `src/app.d.ts` (95 lines)
- `src/auth-store.svelte.ts` (244 lines)
- `src/custom-modules.d.ts` (29 lines)
- `src/env.d.ts` (14 lines)
- `src/global.d.ts` (124 lines)
- `src/lib/ai/base64-fp32-quantizer.ts` (340 lines)
- `src/lib/ai/hypergraph.ts` (88 lines)
- `src/lib/ambient-events.d.ts` (22 lines)
- `src/lib/cache/offline-fetch.ts` (75 lines)
- `src/lib/client/db/loki-client.ts` (91 lines)
- `src/lib/client/ui/POIPhotoModal.svelte` (57 lines)
- `src/lib/client-logging.ts` (29 lines)
- `src/lib/components/ai/CaseScoringDashboard/CaseScoringDashboard.svelte` (51 lines)
- `src/lib/components/ai/EnhancedInlineEditor.svelte` (343 lines)
- `src/lib/components/audio/AudioAnalysisView.svelte` (631 lines)
- `src/lib/components/canvas/hybrid/types.ts` (50 lines)
- `src/lib/components/chat/AudioUploadWidget.svelte` (268 lines)
- `src/lib/components/chat/ChatPromptBar.svelte` (149 lines)
- `src/lib/components/codebase/TagDeleteDialog.svelte` (380 lines)
- `src/lib/components/components-shims.d.ts` (7 lines)
- `src/lib/components/document/DocumentAnalysisView.svelte` (401 lines)
- `src/lib/components/evidence/CaseEvidenceOrganizer.svelte` (639 lines)
- `src/lib/components/evidence/EvidenceUploadButton.svelte` (64 lines)
- `src/lib/components/glyph/GlyphAtlasPanel.svelte` (784 lines)
- `src/lib/components/monitoring/CacheWarmUpControl.svelte` (323 lines)
- `src/lib/components/ui/bits/compound.ts` (16 lines)
- `src/lib/components/ui/CacheMonitoringWidget.svelte` (397 lines)
- `src/lib/components/ui/Card.js` (15 lines)
- `src/lib/components/ui/CardContent.svelte` (10 lines)
- `src/lib/components/ui/CardDescription.svelte` (17 lines)
- `src/lib/components/ui/CardFooter.svelte` (18 lines)
- `src/lib/components/ui/CardHeader.svelte` (10 lines)
- `src/lib/components/ui/CardTitle.svelte` (10 lines)
- `src/lib/components/ui/ChatMessage.svelte` (42 lines)
- `src/lib/components/ui/context-menu.js` (4 lines)
- `src/lib/components/ui/ContextMenuSeparator.svelte` (31 lines)
- `src/lib/components/ui/core/Label.svelte` (24 lines)
- `src/lib/components/ui/core/Textarea.svelte` (45 lines)
- `src/lib/components/ui/enhanced/button-variants.ts` (37 lines)
- `src/lib/components/ui/enhanced-bits.svelte` (55 lines)
- `src/lib/components/ui/Field.svelte` (46 lines)
- `src/lib/components/ui/Form.svelte` (201 lines)
- `src/lib/components/ui/gaming/constants/gaming-constants-minimal.ts` (137 lines)
- `src/lib/components/ui/gaming/core/GamingEvolutionManager.ts` (79 lines)
- `src/lib/components/ui/gaming/n64/N643DContainer.svelte` (17 lines)
- `src/lib/components/ui/gaming/n64/N643DDialog.svelte` (16 lines)
- `src/lib/components/ui/gaming/n64/N643DInput.svelte` (12 lines)
- `src/lib/components/ui/gaming/n64/N643DPanel.svelte` (17 lines)
- `src/lib/components/ui/gaming/n64/N64EvolutionLoader.svelte` (86 lines)

_...and 349 more (see deep-import-graph.json)_

## Possibly Missing Files (imported but not in graph)
| Path | Referenced by |
|------|--------------|
| `./$types` | 648 files |
| `./$types.js` | 62 files |
| `$lib/types/upload` | 1 files |
| `$lib/features/ai/services/ai-service` | 1 files |
| `$lib/stores/unified/evidence-store` | 1 files |
| `./ContextMenu.svelte` | 1 files |
| `$lib/services/unified-service-registry` | 1 files |
| `./Card/Card.svelte` | 1 files |
| `./Card/CardHeader.svelte` | 1 files |
| `./Card/CardContent.svelte` | 1 files |
| `./Card/CardFooter.svelte` | 1 files |
| `./Card/CardTitle.svelte` | 1 files |
| `./Card/CardDescription.svelte` | 1 files |
| `./context-menu/index.js` | 1 files |
| `./8bit/NES8BitDialog.svelte` | 1 files |
| `./8bit/NES8BitProgress.svelte` | 1 files |
| `./8bit/NES8BitInput.svelte` | 1 files |
| `./8bit/NES8BitBadge.svelte` | 1 files |
| `./16bit/SNES16BitContainer.svelte` | 1 files |
| `./16bit/SNES16BitDialog.svelte` | 1 files |
