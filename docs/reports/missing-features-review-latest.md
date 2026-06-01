# Missing Features Review

Generated: 2026-06-01T07:44:13.890Z
Stale threshold: 60 days

## Summary

- Registry rows: **8**
- Mapreduce entries: **3270**
- Parent atlas entries: **9373**
- Missing candidates: **50**
- Stale features: **0**
- Duplicate systems: **28**

## Top Missing Feature Candidates

| File | Prefix | Feature | Import Errors | Reason |
| --- | --- | --- | --- | --- |
| `src/lib/components/ui/index.ts` | src/lib/components/ui | ui | 42 | importErrors:42, not-in-registry |
| `src/lib/components/ui/gaming/n64/index.ts` | src/lib/components/ui | ui | 29 | importErrors:29, not-in-registry |
| `src/lib/components/ui/gaming/index.ts` | src/lib/components/ui | ui | 18 | importErrors:18, not-in-registry |
| `src/lib/icons/yorha/index.ts` | src/lib/icons/yorha | unclassified | 12 | unclassified, importErrors:12, not-in-registry |
| `src/lib/components/ui/alert-dialog/index.js` | src/lib/components/ui | ui | 12 | importErrors:12, not-in-registry |
| `src/lib/components/ui/dialog/index.ts` | src/lib/components/ui | ui | 11 | importErrors:11, not-in-registry |
| `src/lib/index.ts` | src/lib/index.ts | unclassified | 8 | unclassified, importErrors:8, not-in-registry |
| `src/lib/components/ui/svelte5-index.ts` | src/lib/components/ui | ui | 8 | importErrors:8, not-in-registry |
| `src/lib/components/codebase/index.ts` | src/lib/components/codebase | ui | 8 | importErrors:8, not-in-registry |
| `src/lib/server/services/knowledge-search/index.ts` | src/lib/server/services | unclassified | 7 | unclassified, importErrors:7, not-in-registry |
| `src/lib/components/ui/table/index.ts` | src/lib/components/ui | ui | 7 | importErrors:7, not-in-registry |
| `src/lib/utils/dynamic-imports.ts` | src/lib/utils/dynamic-imports.ts | unclassified | 7 | unclassified, importErrors:7, not-in-registry |
| `src/lib/components/API-CONTRACTS.md` | src/lib/components/API-CONTRACTS.md | ui | 6 | importErrors:6, not-in-registry |
| `src/lib/components/ui/Card.js` | src/lib/components/ui | ui | 6 | importErrors:6, not-in-registry |
| `src/lib/components/ui/card/index.ts` | src/lib/components/ui | ui | 6 | importErrors:6, not-in-registry |
| `src/lib/components/ui/tabs/index.ts` | src/lib/components/ui | ui | 5 | importErrors:5, not-in-registry |
| `src/lib/stores/unified/index.svelte.ts` | src/lib/stores/unified | unclassified | 4 | unclassified, importErrors:4, not-in-registry |
| `src/lib/components/ui/tooltip.ts` | src/lib/components/ui | ui | 4 | importErrors:4, not-in-registry |
| `src/lib/components/chat/README.md` | src/lib/components/chat | ui | 3 | importErrors:3, not-in-registry |
| `src/lib/components/dashboard/index.ts` | src/lib/components/dashboard | ui | 3 | importErrors:3, not-in-registry |
| `src/lib/components/shells/index.ts` | src/lib/components/shells | ui | 3 | importErrors:3, not-in-registry |
| `src/lib/components/ui/avatar/index.ts` | src/lib/components/ui | ui | 3 | importErrors:3, not-in-registry |
| `src/lib/components/ui/progress/index.ts` | src/lib/components/ui | ui | 3 | importErrors:3, not-in-registry |
| `src/lib/cache/__tests__/cache.test.ts` | src/lib/cache/__tests__ | cache | 3 | importErrors:3, not-in-registry |
| `src/routes/api/codebase-index/graph/+server.ts` | src/routes/api/codebase-index | graph | 2 | importErrors:2, not-in-registry |

## Stale Feature Candidates

| Feature | Owner File | Prefix | Last Touch (days) | Status |
| --- | --- | --- | --- | --- |

## Duplicate Systems

| Feature Pair | Shared Prefix | Shared Refs | Left Owner | Right Owner |
| --- | --- | --- | --- | --- |
| ace.packet_flow / semantic.cache.policy | src/lib/server/ace | 6 | `src/lib/server/ace/context-assembler.ts` | `src/lib/server/ace/context-cache-registry.ts` |
| memory.address.registry / semantic.cache.policy | src/lib/server/ace | 4 | `src/lib/server/ace/context-cache-registry.ts` | `src/lib/server/ace/feature-context-matrix.ts` |
| ace.packet_flow / cluster.cards |  | 3 | `src/lib/server/ace/context-assembler.ts` | `scripts/atlas/cache-hypergraph-cluster-cards.mjs` |
| cluster.cards / semantic.cache.policy |  | 3 | `scripts/atlas/cache-hypergraph-cluster-cards.mjs` | `src/lib/server/ace/context-cache-registry.ts` |
| ace.packet_flow / karpathy.hot_lane | src/lib/server/ace | 2 | `src/lib/server/ace/karpathy-qdrant-cluster-backfill.ts` | `src/lib/server/ace/context-assembler.ts` |
| ace.packet_flow / memory.address.registry | src/lib/server/ace | 2 | `src/lib/server/ace/context-assembler.ts` | `src/lib/server/ace/feature-context-matrix.ts` |
| cluster.cards / memory.address.registry |  | 2 | `scripts/atlas/cache-hypergraph-cluster-cards.mjs` | `src/lib/server/ace/feature-context-matrix.ts` |
| karpathy.hot_lane / semantic.cache.policy | src/lib/server/ace | 2 | `src/lib/server/ace/karpathy-qdrant-cluster-backfill.ts` | `src/lib/server/ace/context-cache-registry.ts` |
| ace.packet_flow / codebase.semantic_index |  | 1 | `src/lib/server/ace/context-assembler.ts` | `scripts/build-atlas-index.mjs` |
| ace.packet_flow / feature.labeling |  | 1 | `src/lib/server/ace/context-assembler.ts` | `src/lib/server/labels/feature-label-registry.ts` |
| ace.packet_flow / retrieval.spine |  | 1 | `src/lib/server/retrieval/hyperrag-fusion-service.ts` | `src/lib/server/ace/context-assembler.ts` |
| cluster.cards / codebase.semantic_index |  | 1 | `scripts/build-atlas-index.mjs` | `scripts/atlas/cache-hypergraph-cluster-cards.mjs` |
| cluster.cards / feature.labeling |  | 1 | `src/lib/server/labels/feature-label-registry.ts` | `scripts/atlas/cache-hypergraph-cluster-cards.mjs` |
| cluster.cards / karpathy.hot_lane |  | 1 | `src/lib/server/ace/karpathy-qdrant-cluster-backfill.ts` | `scripts/atlas/cache-hypergraph-cluster-cards.mjs` |
| cluster.cards / retrieval.spine |  | 1 | `src/lib/server/retrieval/hyperrag-fusion-service.ts` | `scripts/atlas/cache-hypergraph-cluster-cards.mjs` |
| codebase.semantic_index / feature.labeling |  | 1 | `scripts/build-atlas-index.mjs` | `src/lib/server/labels/feature-label-registry.ts` |
| codebase.semantic_index / karpathy.hot_lane |  | 1 | `src/lib/server/ace/karpathy-qdrant-cluster-backfill.ts` | `scripts/build-atlas-index.mjs` |
| codebase.semantic_index / memory.address.registry |  | 1 | `scripts/build-atlas-index.mjs` | `src/lib/server/ace/feature-context-matrix.ts` |
| codebase.semantic_index / retrieval.spine |  | 1 | `src/lib/server/retrieval/hyperrag-fusion-service.ts` | `scripts/build-atlas-index.mjs` |
| codebase.semantic_index / semantic.cache.policy |  | 1 | `scripts/build-atlas-index.mjs` | `src/lib/server/ace/context-cache-registry.ts` |
| feature.labeling / karpathy.hot_lane |  | 1 | `src/lib/server/ace/karpathy-qdrant-cluster-backfill.ts` | `src/lib/server/labels/feature-label-registry.ts` |
| feature.labeling / memory.address.registry |  | 1 | `src/lib/server/labels/feature-label-registry.ts` | `src/lib/server/ace/feature-context-matrix.ts` |
| feature.labeling / retrieval.spine |  | 1 | `src/lib/server/retrieval/hyperrag-fusion-service.ts` | `src/lib/server/labels/feature-label-registry.ts` |
| feature.labeling / semantic.cache.policy |  | 1 | `src/lib/server/labels/feature-label-registry.ts` | `src/lib/server/ace/context-cache-registry.ts` |
| karpathy.hot_lane / memory.address.registry | src/lib/server/ace | 1 | `src/lib/server/ace/karpathy-qdrant-cluster-backfill.ts` | `src/lib/server/ace/feature-context-matrix.ts` |

## Registry SourceRef Clusters

| Prefix | Count | Feature IDs | Owners |
| --- | --- | --- | --- |
| src/lib/server/ace | 16 | ace.packet_flow, cluster.cards, karpathy.hot_lane, memory.address.registry | scripts/atlas/cache-hypergraph-cluster-cards.mjs, src/lib/server/ace/context-assembler.ts, src/lib/server/ace/context-cache-registry.ts |
| src/lib/server/atlas | 8 | ace.packet_flow, cluster.cards, codebase.semantic_index, feature.labeling | scripts/atlas/cache-hypergraph-cluster-cards.mjs, scripts/build-atlas-index.mjs, src/lib/server/ace/context-assembler.ts |
| src/lib/server/cache | 4 | ace.packet_flow, cluster.cards, memory.address.registry, semantic.cache.policy | scripts/atlas/cache-hypergraph-cluster-cards.mjs, src/lib/server/ace/context-assembler.ts, src/lib/server/ace/context-cache-registry.ts |
| .cache/ace | 3 | memory.address.registry, semantic.cache.policy | src/lib/server/ace/context-cache-registry.ts, src/lib/server/ace/feature-context-matrix.ts |
| src/lib/server/retrieval | 3 | retrieval.spine | src/lib/server/retrieval/hyperrag-fusion-service.ts |
| scripts/atlas | 2 | cluster.cards | scripts/atlas/cache-hypergraph-cluster-cards.mjs |
| src/lib/server/labels | 2 | feature.labeling | src/lib/server/labels/feature-label-registry.ts |
| docs/architecture | 1 | retrieval.spine | src/lib/server/retrieval/hyperrag-fusion-service.ts |
| docs/atlas-index | 1 | codebase.semantic_index | scripts/build-atlas-index.mjs |
| memory/index | 1 | codebase.semantic_index | scripts/build-atlas-index.mjs |
| scripts/build-atlas-index.mjs | 1 | codebase.semantic_index | scripts/build-atlas-index.mjs |
| scripts/karpathy-gpu-enrich.mjs | 1 | karpathy.hot_lane | src/lib/server/ace/karpathy-qdrant-cluster-backfill.ts |
| scripts/karpathy-qdrant-cluster-backfill.ts | 1 | karpathy.hot_lane | src/lib/server/ace/karpathy-qdrant-cluster-backfill.ts |
| scripts/sync-cluster-summaries-to-qdrant.mjs | 1 | cluster.cards | scripts/atlas/cache-hypergraph-cluster-cards.mjs |

## Mapreduce Path Clusters

| Prefix | Count | Files |
| --- | --- | --- |
| src/lib/server/db | 192 | src\lib\server\db\0000_stiff_the_hood.sql, src\lib\server\db\0001_storage_tables.sql, src\lib\server\db\0002_extend_storage_audits.sql |
| src/lib/server/ai | 130 | src\lib\server\ai\LLMS.md, src\lib\server\ai\__tests__\feature-toon-pipeline.test.ts, src\lib\server\ai\__tests__\hypergraph-store.test.ts |
| src/routes/(app)/demos | 130 | src\routes\(app)\demos\+page.ts, src\routes\(app)\demos\LLMS.md, src\routes\(app)\demos\ace-pipeline\+page.ts |
| src/lib/server/features | 82 | src\lib\server\features\LLMS.md, src\lib\server\features\ai\ace\context-assembler.ts, src\lib\server\features\ai\ace\error-fingerprint.ts |
| src/routes/(app)/admin | 78 | src\routes\(app)\admin\LLMS.md, src\routes\(app)\admin\ai-dashboard\+page.server.ts, src\routes\(app)\admin\ai-dashboard\+page.ts |
| src/lib/components/ui | 69 | src\lib\components\ui\Card.js, src\lib\components\ui\LLMS.md, src\lib\components\ui\alert-dialog\LLMS.md |
| src/lib/server/ace | 68 | src\lib\server\ace\LLMS.md, src\lib\server\ace\ace-agent.ts, src\lib\server\ace\ace-error-kag.ts |
| src/lib/server/retrieval | 66 | src\lib\server\retrieval\LLMS.md, src\lib\server\retrieval\ace-retrieval-logger.ts, src\lib\server\retrieval\atlas-cartridge-seeds.ts |
| src/routes/api/admin | 48 | src\routes\api\admin\ace-metrics\+server.ts, src\routes\api\admin\agent\fix\+server.ts, src\routes\api\admin\ai-chat\+server.ts |
| src/routes/api/codebase-index | 48 | src\routes\api\codebase-index\+server.ts, src\routes\api\codebase-index\agents-write\+server.ts, src\routes\api\codebase-index\analyze\+server.ts |
| src/lib/server/services | 37 | src\lib\server\services\LLMS.md, src\lib\server\services\couchdb-client.ts, src\lib\server\services\error-analysis\CacheService.ts |
| src/routes/(app)/cases | 36 | src\routes\(app)\cases\+page.server.ts, src\routes\(app)\cases\+page.ts, src\routes\(app)\cases\LLMS.md |
| src/routes/api/ai | 36 | src\routes\api\ai\agent\+server.ts, src\routes\api\ai\agent\batch\+server.ts, src\routes\api\ai\analyze-evidence\+server.ts |
| src/routes/api/evidence | 34 | src\routes\api\evidence\+server.ts, src\routes\api\evidence\[docId]\status\+server.ts, src\routes\api\evidence\[id]\+server.ts |
| src/routes/api/analytics | 30 | src\routes\api\analytics\codebase-research\+server.ts, src\routes\api\analytics\context-timeline\+server.ts, src\routes\api\analytics\deep-research\+server.ts |
| src/lib/server/agents | 29 | src\lib\server\agents\LLMS.md, src\lib\server\agents\agents-card-store.ts, src\lib\server\agents\agents-context-source.ts |
| src/lib/server/cache | 29 | src\lib\server\cache\LLMS.md, src\lib\server\cache\README.md, src\lib\server\cache\ace-context-cache-metrics.ts |
| src/lib/server/graph | 28 | src\lib\server\graph\AGENTS.md, src\lib\server\graph\LLMS.md, src\lib\server\graph\codebase-cluster-detection.ts |
| src/lib/server/indexer | 28 | src\lib\server\indexer\LLMS.md, src\lib\server\indexer\ast-chunker.ts, src\lib\server\indexer\ast-ingest-logger.ts |
| src/routes/api/cases | 26 | src\routes\api\cases\+server.ts, src\routes\api\cases\[id]\+server.ts, src\routes\api\cases\[id]\analyze\stream\+server.ts |

## Atlas Coverage by Prefix

| Prefix | Count | Sample Refs |
| --- | --- | --- |
| docs/documents-atlas-index.md | 1318 | docs/documents-atlas-index.md |
| docs/CODEBASE_DIRECTORY_MAP.md | 35 | docs/CODEBASE_DIRECTORY_MAP.md |
| docs/CODEBASE_INDEXING_PIPELINE.md | 5 | docs/CODEBASE_INDEXING_PIPELINE.md |
| docs/error-analysis-architecture.md | 4 | docs/error-analysis-architecture.md |
| docs/visualization-stack.md | 3 | docs/visualization-stack.md |
| docs/ARCHITECTURE_GUIDE_V1.md | 2 | docs/ARCHITECTURE_GUIDE_V1.md |
| docs/compiler-landscape.md | 2 | docs/compiler-landscape.md |
| docs/KARPATHY_PIPELINE_ARCHITECTURE.md | 2 | docs/KARPATHY_PIPELINE_ARCHITECTURE.md |
| docs/UNIVERSAL_APP_READINESS_CHECKLIST.md | 2 | docs/UNIVERSAL_APP_READINESS_CHECKLIST.md |
| docs/ARCHITECTURE_GUIDE_V2_ENHANCED_BITS_INTEGRATION.md | 1 | docs/ARCHITECTURE_GUIDE_V2_ENHANCED_BITS_INTEGRATION.md |
| docs/atlas-vendor-wheels.md | 1 | docs/atlas-vendor-wheels.md |
| docs/CI_VENDOR_WHEELS.md | 1 | docs/CI_VENDOR_WHEELS.md |
| docs/DEVELOPER_STRATEGY_GUIDE.md | 1 | docs/DEVELOPER_STRATEGY_GUIDE.md |
| docs/devtools_rg.md | 1 | docs/devtools_rg.md |
| docs/mcp_tool_update_notice.md | 1 | docs/mcp_tool_update_notice.md |
| sveltekit-frontend/src/lib/server/cache | 1 | sveltekit-frontend/src/lib/server/cache/cache-config.ts |

## Next Step

Use this report to decide archive candidates and rerun the parent atlas refresh only after the production-ready feature list is frozen.
