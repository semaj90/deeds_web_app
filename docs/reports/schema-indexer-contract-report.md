# Schema Indexer Contract

Generated: 2026-05-26T23:38:58.041Z

## Summary
- cards: 1
- schema files: 84
- tables: 310
- domains: 7

## Coverage
- atlas overlay present: true
- live atlas contract: true
- schema contract present: true

## Contract
- cardId: schema-indexer:contract
- redisKey: knowledge:schema-indexer:contract
- qdrantPointId: 8de4aba4cd25
- sourceRefs: scripts/codebase-semantic-indexer.mjs, src/lib/server/db/schema/ace-web-crawl.ts, src/lib/server/db/schema/admin-ai-skills.ts, src/lib/server/db/schema/admin-chat.ts, src/lib/server/db/schema/admin-model-weights.ts, src/lib/server/db/schema/admin-raptor-summaries.ts, src/lib/server/db/schema/AGENTS.md.bak, src/lib/server/db/schema/ai_chat.ts, src/lib/server/db/schema/analytics.ts, src/lib/server/db/schema/atlas-cards.ts, src/lib/server/db/schema/atlas-chunks.ts, src/lib/server/db/schema/case-library-links.ts, src/lib/server/db/schema/citations.ts, src/lib/server/db/schema/codebase-intelligence.ts, src/lib/server/db/schema/context-timeline.ts, src/lib/server/db/schema/directory-clusters.ts, src/lib/server/db/schema/documents-atlas.ts, src/lib/server/db/schema/embedded-summaries.ts, src/lib/server/db/schema/errorBrainDiffs.ts, src/lib/server/db/schema/error_brain_analysis.ts, src/lib/server/db/schema/error_clusters.ts, src/lib/server/db/schema/error_events.ts, src/lib/server/db/schema/error_feedback.ts, src/lib/server/db/schema/error_suggestions.ts, src/lib/server/db/schema/error_timeline.ts, src/lib/server/db/schema/evidence-multi-modal.ts, src/lib/server/db/schema/evidence.ts, src/lib/server/db/schema/feature-registry.ts, src/lib/server/db/schema/features.ts, src/lib/server/db/schema/files.ts, src/lib/server/db/schema/graph-mappings.ts, src/lib/server/db/schema/graph-pathway-cards.ts, src/lib/server/db/schema/index.ts, src/lib/server/db/schema/ingestion-jobs.ts, src/lib/server/db/schema/jurisdictions.ts, src/lib/server/db/schema/kag-dag.ts, src/lib/server/db/schema/legal-cases.ts, src/lib/server/db/schema/legal-chunks.ts, src/lib/server/db/schema/legal-citations.ts, src/lib/server/db/schema/legal-definitions.ts, src/lib/server/db/schema/legal-nodes.ts, src/lib/server/db/schema/legal-relations.ts, src/lib/server/db/schema/library-document-versions.ts, src/lib/server/db/schema/library-documents.ts, src/lib/server/db/schema/LLMS.md, src/lib/server/db/schema/memory-registry.ts, src/lib/server/db/schema/metadata-spine.ts, src/lib/server/db/schema/models.ts, src/lib/server/db/schema/normalize-labels.ts, src/lib/server/db/schema/page-artifacts.ts, src/lib/server/db/schema/persons.ts, src/lib/server/db/schema/reports.ts, src/lib/server/db/schema/route_error_patches.ts, src/lib/server/db/schema/route_health.ts, src/lib/server/db/schema/route_metadata.ts, src/lib/server/db/schema/schema-graph.ts, src/lib/server/db/schema/schema-semantic-cache.ts, src/lib/server/db/schema/search-analytics.ts, src/lib/server/db/schema/state-constitution-sources.ts, src/lib/server/db/schema/summary-cards.ts, src/lib/server/db/schema/synthesis-logs.ts, src/lib/server/db/schema/token-map.ts, src/lib/server/db/schema/topology.ts, src/lib/server/db/cases.ts, src/lib/server/db/schema-ace.ts, src/lib/server/db/schema-canvas-autosaves.ts, src/lib/server/db/schema-canvas.ts, src/lib/server/db/schema-charges.ts, src/lib/server/db/schema-chat.ts, src/lib/server/db/schema-enhanced.ts, src/lib/server/db/schema-evidence-crud.ts, src/lib/server/db/schema-gpu-cache.ts, src/lib/server/db/schema-gpu-metrics.ts, src/lib/server/db/schema-ingestion.ts, src/lib/server/db/schema-pgvector-512.ts, src/lib/server/db/schema-phase78.ts, src/lib/server/db/schema-phase89-preserved.ts, src/lib/server/db/schema-postgres.ts, src/lib/server/db/schema-prosecutor.ts, src/lib/server/db/schema-search.ts, src/lib/server/db/schema-sqlite.ts, src/lib/server/db/schema-test-rag.ts, src/lib/server/db/schema-timeline.ts, src/lib/server/db/schema-web.ts, src/lib/server/db/warden-schema.ts, docs/atlas/feature-registry.json, docs/reports/feature-gap-registry-live-latest.json, docs/reports/index-gap-memory-report.json
- searchHints: rg -n -uu "codebase-semantic-indexer|pgTable\(" sveltekit-frontend/src/lib/server/db scripts | node scripts/codebase-semantic-indexer.mjs --limit=10 | node scripts/codebase-semantic-indexer.mjs --write | rg -n -uu "metadata_envelopes|codebase_embeddings|codebase_files" sveltekit-frontend/src/lib/server/db scripts

## Next Actions
- Use the standalone schema-indexer contract as the MCP search anchor for schema-only work.
- Keep workspace-gap cards and schema contract cards in separate search lanes.
- Rebuild the contract after schema file or semantic indexer changes.
