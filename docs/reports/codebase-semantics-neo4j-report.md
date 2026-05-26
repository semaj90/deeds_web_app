# Codebase Semantics and Neo4j Missing Links Report

Generated: 2026-05-26T22:53:26.741Z

Routes: 250  |  Shipped: 195  |  Fail-open: 55  |  Unlabeled: 0  |  Dynamic-heavy: 46

## Top Labels

- api-route: 172
- svelte-realtime: 71
- svelte-inspector: 4
- ui-component: 3

## Dependency Chains

- static: ./$types (211)
- static: $lib/server/db/client (92)
- static: $lib/server/env.server.js (72)
- static: $lib/server/middleware/cache-headers.js (44)
- static: $lib/server/db/schema-postgres.js (30)
- static: $lib/server/ollama.js (30)
- static: $lib/server/redis.js (28)
- static: $lib/server/validation.js (21)
- dynamic: $lib/server/db/client (7)
- dynamic: $lib/server/redis.js (6)
- dynamic: drizzle-orm (6)
- dynamic: $lib/server/vector/qdrant-manager.js (4)
- dynamic: $lib/server/db/schema (4)
- dynamic: $lib/server/queue/dispatch-inline.js (4)
- dynamic: @qdrant/js-client-rest (3)
- dynamic: $lib/server/grpc/embedding-client.js (3)

## Recommendations

### Project orphaned Neo4j nodes back into route/implementation edges
- priority: high
- details: 3914 CodeArtifact nodes have no relationships. This usually means the Neo4j projection is missing import edges or a subset of files was skipped.
- nextAction: Rerun atlas:neo4j:ingest with a workspace limit, then inspect orphan paths before writing more labels.
- sourceRefs: `sveltekit-frontend/docs_readme/deeds_labs_archive/components/CaseOutcomePrediction.svelte`, `sveltekit-frontend/docs_readme/deeds_labs_archive/components/NESGraphRenderer.svelte`, `sveltekit-frontend/docs_readme/deeds_labs_archive/components/RouteInspectorDetectiveBoard.svelte`, `sveltekit-frontend/src/lib/client/ui/POIPhotoModal.svelte`, `sveltekit-frontend/src/lib/client/ui/POIPhotoUploader.svelte`, `sveltekit-frontend/src/lib/components/admin/AdminChatAssistant.svelte`, `sveltekit-frontend/src/lib/components/admin/AdminMonitoringDashboard.svelte`, `sveltekit-frontend/src/lib/components/admin/AiAnalysisPopup.svelte`, `sveltekit-frontend/src/lib/components/admin/BundlePreview.svelte`, `sveltekit-frontend/src/lib/components/admin/ContextualAssistantModal.svelte`
### Review dynamic-import heavy routes for consolidation
- priority: medium
- details: 46 routes use dynamic imports in their route files. These are candidates for loader/util extraction or feature-folder consolidation.
- nextAction: Move repeated dynamic import logic into shared server helpers, then keep route files thin.
- sourceRefs: `/`, `/.well-known/llms-full.txt`, `/.well-known/llms.txt`, `/(analysis)@`, `/admin`, `/admin/all-routes`, `/admin/cache`, `/admin/case-graph`, `/admin/codebase-viewer`, `/admin/dev-tools`
### Consolidate app-file families under label-aware buckets
- priority: medium
- details: 4 label groups have multiple app files that can be treated as one dependency family for feature mapping.
- nextAction: Use the label registry to cluster related app files, then keep dependency chains stable as the graph matures.
- sourceRefs: `/`, `/.well-known/llms-full.txt`, `/(analysis)@`, `/(analysis)@/audio-analysis/[evidenceId]`, `/(analysis)@/document-analysis/[evidenceId]`, `/(analysis)@/video-analysis/[evidenceId]`, `/admin/api-testing/agentic-loop`, `/admin/api-testing/ast-topology`, `/admin/case-graph`, `/admin/codebase-graph`
### Map static and dynamic dependency chains for label upgrades
- priority: medium
- details: 15 shared dependency targets show up across inspector/realtime or Svelte-heavy routes. These are the edges to pin before graph analysis is promoted from audit to enforcement.
- nextAction: Keep shared imports and dynamic loading paths centralized so feature-label upgrades do not fan out across multiple files.
- sourceRefs: `/(analysis)@/audio-analysis/[evidenceId]`, `/(analysis)@/document-analysis/[evidenceId]`, `/(analysis)@/video-analysis/[evidenceId]`, `/active-cases`, `/admin`, `/admin/ai-dashboard`, `/admin/all-routes`, `/admin/cache`, `/admin/case-graph`, `/admin/codebase-graph`, `/admin/dev-tools`, `/admin/dev-tools/component-showcase`, `/admin/face-gallery`, `/admin/library`, `/admin/observability`, `/admin/qlora-training`, `/admin/search-intelligence`, `/analysis-center`, `/analytics`, `/admin/ai-dashboard/lab`, `/admin/ai-dashboard/operator`, `/admin/codebase-graph`, `/admin/error-analysis`, `/admin/error-brain`, `/admin/error-brain/runs`, `/admin/face-gallery`, `/admin/qlora-training`, `/`, `/admin/cache`, `/admin/dev-tools`, `/admin/explorer`, `/admin/phase78/patches`, `/admin/ai-dashboard/lab`, `/admin/ai-dashboard/operator`, `/admin/error-brain`, `/admin/error-brain/runs`, `/admin/ai-dashboard/lab`, `/admin/ai-dashboard/operator`, `/admin/error-brain`, `/admin/error-brain/runs`, `/`, `/(analysis)@`, `/`, `/(analysis)@`, `/`, `/`, `/`