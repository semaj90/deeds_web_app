# Drizzle Schema Reference

Generated from next_steps/active/SCHEMA_MANIFEST.json on 2026-04-25T01:27:32.612Z.

> This file is generated. Current schema code is the authority; prose summaries are stale if they diverge from the manifest.

## Current Totals

| Metric | Count |
| --- | --- |
| table declarations | 302 |
| enum declarations | 49 |
| unique table names | 252 |
| unique enum names | 37 |
| active unique table names | 182 |
| active unique enum names | 25 |
| root schema files | 31 |

## Feature Buckets

| Bucket | Tables | Enums |
| --- | --- | --- |
| legal corpus | 34 | 5 |
| courtroom / simulation | 23 | 3 |
| audio | 2 | 0 |
| research / synthesis | 7 | 1 |
| AST intelligence | 20 | 1 |
| context engine | 23 | 0 |
| chat | 17 | 1 |
| analytics | 28 | 5 |
| infra/runtime | 99 | 21 |

## Active Schema Files

| File | Owner | Tables | Enums |
| --- | --- | --- | --- |
| sveltekit-frontend/src/lib/db/schema/ace-web.ts | context engine | 5 | 0 |
| sveltekit-frontend/src/lib/server/db/client.ts | core runtime db | 0 | 0 |
| sveltekit-frontend/src/lib/server/db/index.ts | core runtime db | 0 | 0 |
| sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts | courtroom / simulation | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema-canvas.ts | AST intelligence | 2 | 0 |
| sveltekit-frontend/src/lib/server/db/schema-charges.ts | courtroom / simulation | 2 | 0 |
| sveltekit-frontend/src/lib/server/db/schema-chat.ts | chat | 2 | 1 |
| sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts | analytics | 4 | 3 |
| sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | legacy compatibility layer | 30 | 0 |
| sveltekit-frontend/src/lib/server/db/schema-postgres.ts | canonical postgres schema | 139 | 33 |
| sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts | courtroom / simulation | 5 | 0 |
| sveltekit-frontend/src/lib/server/db/schema-unified.ts | core runtime db | 0 | 0 |
| sveltekit-frontend/src/lib/server/db/schema-web.ts | core runtime db | 2 | 0 |
| sveltekit-frontend/src/lib/server/db/schema.ts | schema compatibility barrel | 0 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/ace-web-crawl.ts | context engine | 3 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/ai_chat.ts | chat | 3 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/analytics.ts | analytics | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/case-library-links.ts | core runtime db | 1 | 1 |
| sveltekit-frontend/src/lib/server/db/schema/citations.ts | legal corpus | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/codebase-intelligence.ts | AST intelligence | 2 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/error_brain_analysis.ts | analytics | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/error_clusters.ts | AST intelligence | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/error_events.ts | analytics | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/error_feedback.ts | analytics | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/error_suggestions.ts | analytics | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/error_timeline.ts | analytics | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/errorBrainDiffs.ts | analytics | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/evidence.ts | core runtime db | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/index.ts | domain schema barrel | 0 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/ingestion-jobs.ts | core runtime db | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/jurisdictions.ts | legal corpus | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/legal-cases.ts | legal corpus | 3 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/legal-chunks.ts | legal corpus | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/legal-citations.ts | legal corpus | 1 | 1 |
| sveltekit-frontend/src/lib/server/db/schema/legal-definitions.ts | legal corpus | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/legal-nodes.ts | legal corpus | 1 | 1 |
| sveltekit-frontend/src/lib/server/db/schema/legal-relations.ts | core runtime db | 0 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/library-document-versions.ts | legal corpus | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/library-documents.ts | core runtime db | 1 | 3 |
| sveltekit-frontend/src/lib/server/db/schema/page-artifacts.ts | legal corpus | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/persons.ts | courtroom / simulation | 2 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/reports.ts | AST intelligence | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/route_error_patches.ts | analytics | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/route_health.ts | analytics | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/route_metadata.ts | core runtime db | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts | analytics | 10 | 0 |
| sveltekit-frontend/src/lib/server/db/schema/state-constitution-sources.ts | core runtime db | 1 | 0 |
| sveltekit-frontend/src/lib/server/db/unified-client.ts | core runtime db | 0 | 0 |
| sveltekit-frontend/src/lib/server/db/warden-schema.ts | core runtime db | 12 | 0 |

## Legacy / Dead Candidates

| File | Classification | Runtime imported? | Notes |
| --- | --- | --- | --- |
| sveltekit-frontend/src/lib/server/db/additional-tables.ts | legacy duplicate | no | duplicate definitions: case_embeddings, document_chunks, embedding_cache, evidence_vectors, legal_precedents, rag_messages, rag_sessions, user_ai_queries |
| sveltekit-frontend/src/lib/server/db/cases.ts | dead candidate | no | no external importers found |
| sveltekit-frontend/src/lib/server/db/enhanced-legal-schema.ts | imported only by tests/scripts | tests/scripts only | ts-nocheck compatibility layer, family peers: sveltekit-frontend/src/lib/server/db/jsonb-legal-schema.ts, sveltekit-frontend/src/lib/server/db/legal-schema.ts, sveltekit-frontend/src/lib/server/db/schema/legal-cases.ts, sveltekit-frontend/src/lib/server/db/schema/legal-chunks.ts, sveltekit-frontend/src/lib/server/db/schema/legal-citations.ts, sveltekit-frontend/src/lib/server/db/schema/legal-definitions.ts, sveltekit-frontend/src/lib/server/db/schema/legal-nodes.ts, sveltekit-frontend/src/lib/server/db/schema/legal-relations.ts |
| sveltekit-frontend/src/lib/server/db/legal-schema.ts | dead candidate | no | family peers: sveltekit-frontend/src/lib/server/db/enhanced-legal-schema.ts, sveltekit-frontend/src/lib/server/db/jsonb-legal-schema.ts, sveltekit-frontend/src/lib/server/db/schema/legal-cases.ts, sveltekit-frontend/src/lib/server/db/schema/legal-chunks.ts, sveltekit-frontend/src/lib/server/db/schema/legal-citations.ts, sveltekit-frontend/src/lib/server/db/schema/legal-definitions.ts, sveltekit-frontend/src/lib/server/db/schema/legal-nodes.ts, sveltekit-frontend/src/lib/server/db/schema/legal-relations.ts |
| sveltekit-frontend/src/lib/server/db/lucia-schema.ts | imported only by tests/scripts | tests/scripts only | duplicate definitions: sessions, users |
| sveltekit-frontend/src/lib/server/db/schema-actual.ts | legacy duplicate | no | family peers: sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts, duplicate definitions: cases, documents, evidence, users |
| sveltekit-frontend/src/lib/server/db/schema-enhanced.ts | legacy duplicate | no | ts-nocheck compatibility layer, family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts |
| sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts | dead candidate | no | placeholder or compatibility module, family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts |
| sveltekit-frontend/src/lib/server/db/schema-ingestion.ts | imported only by tests/scripts | tests/scripts only | family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts, duplicate definitions: document_chunks, document_summaries, processing_status |
| sveltekit-frontend/src/lib/server/db/schema-old.ts | legacy duplicate | no | re-export wrapper, ts-nocheck compatibility layer, placeholder or compatibility module, family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts |
| sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts | dead candidate | no | family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts |
| sveltekit-frontend/src/lib/server/db/schema-phase78.ts | imported only by tests/scripts | tests/scripts only | family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts, duplicate definitions: error_clusters, error_events, error_kind, error_severity, error_suggestion_states, error_suggestions, route_health, route_health_state, suggestion_state |
| sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts | imported only by tests/scripts | tests/scripts only | re-export wrapper, family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts |
| sveltekit-frontend/src/lib/server/db/schema-sqlite.ts | legacy duplicate | no | ts-nocheck compatibility layer, family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts |
| sveltekit-frontend/src/lib/server/db/schema-test-rag.ts | imported only by tests/scripts | tests/scripts only | family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts |
| sveltekit-frontend/src/lib/server/db/schema-timeline.ts | unknown owner | no | family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts |
| sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts | legacy duplicate | no | family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts |
| sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts | legacy duplicate | no | placeholder or compatibility module, family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema.ts |
| sveltekit-frontend/src/lib/server/db/unified-schema.ts | imported only by tests/scripts | tests/scripts only | ts-nocheck compatibility layer, family peers: sveltekit-frontend/src/lib/server/db/schema-actual.ts, sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts, sveltekit-frontend/src/lib/server/db/schema-canvas.ts, sveltekit-frontend/src/lib/server/db/schema-charges.ts, sveltekit-frontend/src/lib/server/db/schema-chat.ts, sveltekit-frontend/src/lib/server/db/schema-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts, sveltekit-frontend/src/lib/server/db/schema-gpu-metrics.ts, sveltekit-frontend/src/lib/server/db/schema-ingestion.ts, sveltekit-frontend/src/lib/server/db/schema-old.ts, sveltekit-frontend/src/lib/server/db/schema-pgvector-512.ts, sveltekit-frontend/src/lib/server/db/schema-phase78.ts, sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts, sveltekit-frontend/src/lib/server/db/schema-postgres-enhanced.ts, sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts, sveltekit-frontend/src/lib/server/db/schema-sqlite.ts, sveltekit-frontend/src/lib/server/db/schema-test-rag.ts, sveltekit-frontend/src/lib/server/db/schema-timeline.ts, sveltekit-frontend/src/lib/server/db/schema-unified.ts, sveltekit-frontend/src/lib/server/db/schema-web.ts, sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts, sveltekit-frontend/src/lib/server/db/schema.ts, sveltekit-frontend/src/lib/server/db/unified-schema-clean.ts |
| sveltekit-frontend/src/lib/server/db/vector-schema.ts | legacy duplicate | no | duplicate definitions: document_embeddings |

## Tables By Feature

### legal corpus Tables

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| canonical_chunks | canonicalChunks | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| canonical_documents | canonicalDocuments | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| case_chunks | caseChunks | sveltekit-frontend/src/lib/server/db/schema/legal-cases.ts | active |
| case_library_links | caseLibraryLinks | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| case_library_links | caseLibraryLinks | sveltekit-frontend/src/lib/server/db/schema/case-library-links.ts | duplicate candidate |
| case_statute_links | caseStatuteLinks | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| cases | cases | sveltekit-frontend/src/lib/server/db/schema/legal-cases.ts | duplicate candidate |
| cases_jsonb | casesJsonb | sveltekit-frontend/src/lib/server/db/jsonb-legal-schema.ts | legacy |
| citation_collections | citationCollections | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| citation_tags | citationTags | sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts | duplicate candidate |
| citation_tags | citationTags | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| citations | citations | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| collection_citations | collectionCitations | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| crimes | crimes | sveltekit-frontend/src/lib/server/db/schema/legal-cases.ts | active |
| document_relationships_jsonb | documentRelationshipsJsonb | sveltekit-frontend/src/lib/server/db/jsonb-legal-schema.ts | legacy |
| evidence_jsonb | evidenceJsonb | sveltekit-frontend/src/lib/server/db/jsonb-legal-schema.ts | legacy |
| jurisdictions | jurisdictions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| jurisdictions | jurisdictions | sveltekit-frontend/src/lib/server/db/schema/jurisdictions.ts | duplicate candidate |
| legal_analysis_sessions | legalAnalysisSessions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| legal_chunks | legalChunks | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| legal_chunks | legalChunks | sveltekit-frontend/src/lib/server/db/schema/legal-chunks.ts | duplicate candidate |
| legal_citations | legalCitations | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| legal_citations | legalCitations | sveltekit-frontend/src/lib/server/db/schema/legal-citations.ts | duplicate candidate |
| legal_definitions | legalDefinitions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| legal_definitions | legalDefinitions | sveltekit-frontend/src/lib/server/db/schema/legal-definitions.ts | duplicate candidate |
| legal_documents | legalDocuments | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| legal_documents_jsonb | legalDocumentsJsonb | sveltekit-frontend/src/lib/server/db/jsonb-legal-schema.ts | legacy |
| legal_glossary | legalGlossary | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| legal_nodes | legalNodes | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| legal_nodes | legalNodes | sveltekit-frontend/src/lib/server/db/schema/legal-nodes.ts | duplicate candidate |
| legal_precedents | legalPrecedents | sveltekit-frontend/src/lib/server/db/additional-tables.ts | duplicate candidate |
| legal_precedents | legalPrecedents | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| legal_terms | legalTerms | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| library_document_versions | libraryDocumentVersions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| library_document_versions | libraryDocumentVersions | sveltekit-frontend/src/lib/server/db/schema/library-document-versions.ts | duplicate candidate |
| library_documents | libraryDocuments | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| library_documents | libraryDocuments | sveltekit-frontend/src/lib/server/db/schema/library-documents.ts | duplicate candidate |
| page_artifacts | pageArtifacts | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| page_artifacts | pageArtifacts | sveltekit-frontend/src/lib/server/db/schema/page-artifacts.ts | duplicate candidate |
| saved_citations | savedCitations | sveltekit-frontend/src/lib/server/db/schema/citations.ts | active |
| statute_chunks | statuteChunks | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| statutes | statutes | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| term_examples | termExamples | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| warden_citation_graph | wardenCitationGraph | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |
| warden_citations | wardenCitations | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |

### courtroom / simulation Tables

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| canvas_annotations | canvasAnnotations | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| canvas_autosaves | canvasAutosaves | sveltekit-frontend/src/lib/server/db/schema-canvas-autosaves.ts | duplicate candidate |
| canvas_autosaves | canvasAutosaves | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| canvas_states | canvasStates | sveltekit-frontend/src/lib/server/db/schema-canvas.ts | duplicate candidate |
| canvas_states | canvasStates | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| case_timeline | caseTimeline | sveltekit-frontend/src/lib/server/db/schema-charges.ts | active |
| charges | charges | sveltekit-frontend/src/lib/server/db/schema-charges.ts | active |
| courtroom_animations | courtroomAnimations | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| courtroom_keyframes | courtroomKeyframes | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| courtroom_models | courtroomModels | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| fictional_case_actors | fictionalCaseActors | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| fictional_case_charges | fictionalCaseCharges | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| fictional_case_events | fictionalCaseEvents | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| fictional_cases | fictionalCases | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| persons_of_interest | personsOfInterest | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| persons_of_interest | personsOfInterest | sveltekit-frontend/src/lib/server/db/schema/persons.ts | duplicate candidate |
| poi_photos | poiPhotos | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| poi_relationships | poiRelationships | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| prosecutor_case_persons | prosecutorCasePersons | sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts | active |
| prosecutor_cases | prosecutorCases | sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts | active |
| prosecutor_evidence | prosecutorEvidence | sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts | active |
| prosecutor_persons | prosecutorPersons | sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts | active |
| timeline_events | timelineEvents | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| yorha_cases | yorhaCases | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| yorha_evidence_connections | yorhaEvidenceConnections | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| yorha_evidence_nodes | yorhaEvidenceNodes | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |

### audio Tables

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| audio_transcripts | audioTranscripts | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| whisper_segments | whisperSegments | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |

### research / synthesis Tables

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| knowledge_artifacts | knowledgeArtifacts | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| legal_research | legalResearch | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| qlora_examples | qloraExamples | sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts | active |
| research_summaries | researchSummaries | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| synthesis_runs | synthesisRuns | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| user_research_tasks | userResearchTasks | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| web_search_index | webSearchIndex | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |

### AST intelligence Tables

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| ai_reports | aiReports | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| ast_edges | astEdges | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| ast_file_features | astFileFeatures | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| ast_nodes | astNodes | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| case_reports | caseReports | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| cluster_narratives | clusterNarratives | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| cluster_summaries | clusterSummaries | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| cluster_summaries | clusterSummaries | sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts | duplicate candidate |
| code_repos | codeRepos | sveltekit-frontend/src/lib/server/db/schema/codebase-intelligence.ts | active |
| codebase_audit_reports | codebaseAuditReports | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| codebase_chunk_index | codebaseChunkIndex | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| codebase_chunk_index | codebaseChunkIndex | sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts | duplicate candidate |
| enrichment_jobs | enrichmentJobs | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| enrichment_jobs | enrichmentJobs | sveltekit-frontend/src/lib/server/db/schema/codebase-intelligence.ts | duplicate candidate |
| error_cluster | errorClusterTable | sveltekit-frontend/src/lib/server/db/schema/error_clusters.ts | active |
| error_clusters | errorClusters | sveltekit-frontend/src/lib/server/db/schema-phase78.ts | duplicate candidate |
| error_clusters | errorClusters | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| phase89_ast_signatures | phase89AstSignatures | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_error_clusters | phase89ErrorClusters | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| prosecutor_reports | prosecutorReports | sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts | active |
| report_audit_log | reportAuditLog | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| report_versions | reportVersions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| reports | reports | sveltekit-frontend/src/lib/server/db/schema-canvas.ts | duplicate candidate |
| reports | reports | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| reports | reports | sveltekit-frontend/src/lib/server/db/schema/reports.ts | duplicate candidate |
| saved_reports | savedReports | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |

### context engine Tables

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| ace_chunks | aceChunks | sveltekit-frontend/src/lib/db/schema/ace-web.ts | active |
| ace_context_cache | aceContextCache | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| ace_docs | aceDocs | sveltekit-frontend/src/lib/db/schema/ace-web.ts | active |
| ace_edges | aceEdges | sveltekit-frontend/src/lib/db/schema/ace-web.ts | active |
| ace_entities | aceEntities | sveltekit-frontend/src/lib/db/schema/ace-web.ts | active |
| ace_error_embeddings | aceErrorEmbeddings | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| ace_sources | aceSources | sveltekit-frontend/src/lib/db/schema/ace-web.ts | active |
| agent_sessions | agentSessions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| ai_chat_sessions | aiChatSessions | sveltekit-frontend/src/lib/server/db/schema/ace-web-crawl.ts | active |
| context_buffers | contextBuffers | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| context_timeline | contextTimeline | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| glyph_records | glyphRecords | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| model_registry | modelRegistry | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| route_context_cache | routeContextCache | sveltekit-frontend/src/lib/server/db/schema-phase78.ts | migration-only |
| service_capabilities | serviceCapabilities | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| user_analytics | userAnalytics | sveltekit-frontend/src/lib/server/db/schema/ace-web-crawl.ts | active |
| web_crawl_jobs | webCrawlJobs | sveltekit-frontend/src/lib/server/db/schema/ace-web-crawl.ts | active |
| workspace_citations | workspaceCitations | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| workspace_evidence | workspaceEvidence | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| workspace_notes | workspaceNotes | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| workspace_sessions | workspaceSessions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| workspace_statutes | workspaceStatutes | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| workspaces | workspaces | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |

### chat Tables

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| ai_memory | aiMemory | sveltekit-frontend/src/lib/server/db/schema/ai_chat.ts | active |
| chat_document_attachments | chatDocumentAttachments | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| chat_embeddings | chatEmbeddings | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| chat_messages | chatMessages | sveltekit-frontend/src/lib/server/db/schema-chat.ts | active |
| chat_metadata | chatMetadata | sveltekit-frontend/src/lib/server/db/schema-chat.ts | active |
| conversations | conversations | sveltekit-frontend/src/lib/server/db/schema/ai_chat.ts | active |
| messages | messages | sveltekit-frontend/src/lib/server/db/schema/ai_chat.ts | active |
| rag_index_metadata | ragIndexMetadata | sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts | active |
| rag_messages | ragMessages | sveltekit-frontend/src/lib/server/db/additional-tables.ts | duplicate candidate |
| rag_messages | ragMessages | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| rag_query_log | ragQueryLog | sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts | active |
| rag_sessions | ragSessions | sveltekit-frontend/src/lib/server/db/additional-tables.ts | duplicate candidate |
| rag_sessions | ragSessions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| storage_files | storageFiles | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| test_rag_documents | testRagDocuments | sveltekit-frontend/src/lib/server/db/schema-test-rag.ts | migration-only |
| test_rag_embeddings | testRagEmbeddings | sveltekit-frontend/src/lib/server/db/schema-test-rag.ts | migration-only |
| test_rag_search_sessions | testRagSearchSessions | sveltekit-frontend/src/lib/server/db/schema-test-rag.ts | migration-only |
| yorha_chat_messages | yorhaChatMessages | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| yorha_chat_sessions | yorhaChatSessions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |

### analytics Tables

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| ai_usage_log | aiUsageLog | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| analytics_events | analyticsEvents | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| api_audit_log | apiAuditLog | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| audit_log | auditLog | sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts | duplicate candidate |
| audit_log | auditLog | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| chunk_hit_log | chunkHitLog | sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts | active |
| diagnosis_events | diagnosisEvents | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| error_brain_analysis | errorBrainAnalysisTable | sveltekit-frontend/src/lib/server/db/schema/error_brain_analysis.ts | active |
| error_brain_diffs | errorBrainDiffs | sveltekit-frontend/src/lib/server/db/schema/errorBrainDiffs.ts | active |
| error_events | errorEvents | sveltekit-frontend/src/lib/server/db/schema-phase78.ts | duplicate candidate |
| error_events | errorEvents | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| error_events | errorEventsTable | sveltekit-frontend/src/lib/server/db/schema/error_events.ts | duplicate candidate |
| error_feedback | errorFeedback | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| error_feedback | errorFeedbackTable | sveltekit-frontend/src/lib/server/db/schema/error_feedback.ts | duplicate candidate |
| error_patch_log | errorPatchLog | sveltekit-frontend/src/lib/server/db/schema-phase78.ts | migration-only |
| error_sessions | errorSessions | sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts | duplicate candidate |
| error_suggestion_states | errorSuggestionStates | sveltekit-frontend/src/lib/server/db/schema-phase78.ts | duplicate candidate |
| error_suggestion_states | errorSuggestionStates | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| error_suggestions | errorSuggestions | sveltekit-frontend/src/lib/server/db/schema-phase78.ts | duplicate candidate |
| error_suggestions | errorSuggestions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| error_suggestions | errorSuggestionsTable | sveltekit-frontend/src/lib/server/db/schema/error_suggestions.ts | duplicate candidate |
| error_timeline | errorTimeline | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| error_timeline | errorTimelineTable | sveltekit-frontend/src/lib/server/db/schema/error_timeline.ts | duplicate candidate |
| error_topk_index | errorTopkIndex | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| evidence_audit_log | evidenceAuditLog | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| llm_output_chunks | llmOutputChunks | sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts | active |
| llm_outputs | llmOutputs | sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts | active |
| phase89_error_instances | phase89ErrorInstances | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| predictive_todos | predictiveTodos | sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts | active |
| query_variance_pairs | queryVariancePairs | sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts | active |
| raw_error_embeddings | rawErrorEmbeddings | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| response_feedback | responseFeedback | sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts | active |
| route_error_patches | routeErrorPatches | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| route_error_patches | routeErrorPatchesTable | sveltekit-frontend/src/lib/server/db/schema/route_error_patches.ts | duplicate candidate |
| route_health | routeHealth | sveltekit-frontend/src/lib/server/db/schema-phase78.ts | duplicate candidate |
| route_health | routeHealth | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| route_health | routeHealthTable | sveltekit-frontend/src/lib/server/db/schema/route_health.ts | duplicate candidate |
| user_analytics_events | userAnalyticsEvents | sveltekit-frontend/src/lib/server/db/schema/analytics.ts | active |
| warden_audit_log | wardenAuditLog | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |

### infra/runtime Tables

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| ai_models | aiModels | sveltekit-frontend/src/lib/server/db/vector-schema.ts | duplicate candidate |
| analysis_jobs | analysisJobs | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| attachment_verifications | attachmentVerifications | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| auto_approval_rules | autoApprovalRules | sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts | duplicate candidate |
| auto_tags | autoTags | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| case_activities | caseActivities | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| case_assignments | caseAssignments | sveltekit-frontend/src/lib/server/db/additional-tables.ts | duplicate candidate |
| case_embeddings | caseEmbeddings | sveltekit-frontend/src/lib/server/db/additional-tables.ts | duplicate candidate |
| case_embeddings | caseEmbeddings | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| case_note_evidence_refs | caseNoteEvidenceRefs | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| case_note_versions | caseNoteVersions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| case_notes | caseNotes | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| case_persons | casePersons | sveltekit-frontend/src/lib/server/db/schema/persons.ts | active |
| case_scores | caseScores | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| cases | cases | sveltekit-frontend/src/lib/server/db/schema-actual.ts | duplicate candidate |
| cases | cases | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| content_embeddings | contentEmbeddings | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| cpg_edges | cpgEdges | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| cpg_nodes | cpgNodes | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| criminals | criminals | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| document_chunks | additionalDocumentChunks | sveltekit-frontend/src/lib/server/db/additional-tables.ts | duplicate candidate |
| document_chunks | ingestedDocumentChunks | sveltekit-frontend/src/lib/server/db/schema-ingestion.ts | duplicate candidate |
| document_chunks | documentChunks | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| document_embeddings | documentEmbeddings | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | duplicate candidate |
| document_embeddings | documentEmbeddings | sveltekit-frontend/src/lib/server/db/vector-schema.ts | duplicate candidate |
| document_processing | documentProcessing | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| document_summaries | documentSummaries | sveltekit-frontend/src/lib/server/db/schema-ingestion.ts | duplicate candidate |
| document_summaries | documentSummaries | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| document_topics | documentTopics | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| documents | documents | sveltekit-frontend/src/lib/server/db/schema-actual.ts | duplicate candidate |
| documents | documents | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| email_verification_codes | emailVerificationCodes | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| embedding_cache | embeddingCache | sveltekit-frontend/src/lib/server/db/additional-tables.ts | duplicate candidate |
| embedding_cache | embeddingCache | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| embedding_cache_enhanced | embeddingCacheTable | sveltekit-frontend/src/lib/server/db/schema-ingestion.ts | migration-only |
| evidence | evidence | sveltekit-frontend/src/lib/server/db/schema-actual.ts | duplicate candidate |
| evidence | evidence | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| evidence | evidence | sveltekit-frontend/src/lib/server/db/schema/evidence.ts | duplicate candidate |
| evidence_analysis_cache | evidenceAnalysisCache | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| evidence_board_connections | evidenceBoardConnections | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| evidence_chain_of_custody | evidenceChainOfCustody | sveltekit-frontend/src/lib/server/db/additional-tables.ts | duplicate candidate |
| evidence_entities | evidenceEntities | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| evidence_forensic_flags | evidenceForensicFlags | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| evidence_relationships | evidenceRelationships | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| evidence_tags | evidenceTags | sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts | active |
| evidence_vectors | evidenceVectors | sveltekit-frontend/src/lib/server/db/additional-tables.ts | duplicate candidate |
| evidence_vectors | evidenceVectors | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| evidence_versions | evidenceVersions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| failed_jobs | failedJobs | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| file_index | fileIndex | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| generated_fixes | generatedFixes | sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts | duplicate candidate |
| hash_verifications | hashVerifications | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| ingested_documents | ingestedDocuments | sveltekit-frontend/src/lib/server/db/schema-ingestion.ts | migration-only |
| ingestion_buffers | ingestionBuffers | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| ingestion_jobs | ingestionJobs | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| ingestion_jobs | ingestionJobs | sveltekit-frontend/src/lib/server/db/schema/ingestion-jobs.ts | duplicate candidate |
| kb_provenance_graph | kbProvenanceGraph | sveltekit-frontend/src/lib/server/db/schema-week3-kb.ts | duplicate candidate |
| kg_nodes | kgNodes | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| multi_db_transactions | multiDbTransactions | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| ocr_processing_queue | ocrProcessingQueue | sveltekit-frontend/src/lib/server/db/schema-ingestion.ts | migration-only |
| password_reset_tokens | passwordResetTokens | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| phase89_agentic_calls | phase89AgenticCalls | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_cache_hits | phase89CacheHits | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_collection_summaries | phase89CollectionSummaries | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_cosine_rankings | phase89CosineRankings | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_edit_comparisons | phase89EditComparisons | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_edit_log | phase89EditLog | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_embeddings | phase89Embeddings | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_file_timeline | phase89FileTimeline | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_fix_attempts | phase89FixAttempts | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_import_edges | phase89ImportEdges | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_kb_cards | phase89KbCards | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_ripgrep_cache | phase89RipgrepCache | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_tag_mirror | phase89TagMirror | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_timeline | phase89Timeline | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_unit_index | phase89UnitIndex | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_vector_events | phase89VectorEvents | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| phase89_vector_events_vlm | phase89VectorEventsVlm | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| route_metadata | routeMetadata | sveltekit-frontend/src/lib/server/db/schema/route_metadata.ts | active |
| search_queries | searchQueries | sveltekit-frontend/src/lib/server/db/vector-schema.ts | duplicate candidate |
| sessions | sessions | sveltekit-frontend/src/lib/server/db/lucia-schema.ts | duplicate candidate |
| sessions | sessions | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| shader_cache_entries | shaderCacheEntries | sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts | legacy |
| shader_compilation_queue | shaderCompilationQueue | sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts | legacy |
| shader_dependencies | shaderDependencies | sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts | legacy |
| shader_preload_rules | shaderPreloadRules | sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts | legacy |
| shader_recommendations_view | shaderRecommendationsView | sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts | legacy |
| shader_user_patterns | shaderUserPatterns | sveltekit-frontend/src/lib/server/db/schema-gpu-cache.ts | legacy |
| state_constitution_sources | stateConstitutionSources | sveltekit-frontend/src/lib/server/db/schema/state-constitution-sources.ts | active |
| themes | themes | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| ts_errors | tsErrors | sveltekit-frontend/src/lib/server/db/schema-phase89-preserved.ts | active |
| user_ai_queries | userAiQueries | sveltekit-frontend/src/lib/server/db/additional-tables.ts | duplicate candidate |
| user_ai_queries | userAiQueries | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| user_embeddings | userEmbeddings | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| user_interaction_history | userInteractionHistory | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| user_timeline | userTimeline | sveltekit-frontend/src/lib/server/db/schema-timeline.ts | legacy |
| users | users | sveltekit-frontend/src/lib/server/db/lucia-schema.ts | duplicate candidate |
| users | users | sveltekit-frontend/src/lib/server/db/schema-actual.ts | duplicate candidate |
| users | users | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| vector_jobs | vectorJobs | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| vector_metadata | vectorMetadata | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| vector_outbox | vectorOutbox | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| vector_search_logs | vectorSearchLogs | sveltekit-frontend/src/lib/server/db/schema-ingestion.ts | migration-only |
| warden_cases | wardenCases | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |
| warden_chunks | wardenChunks | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |
| warden_evidence | wardenEvidence | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |
| warden_evidence_summaries | wardenEvidenceSummaries | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |
| warden_file_locks | wardenFileLocks | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |
| warden_hmm_topics | wardenHMMTopics | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |
| warden_holdings | wardenHoldings | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |
| warden_ocr | wardenOCR | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |
| warden_users | wardenUsers | sveltekit-frontend/src/lib/server/db/warden-schema.ts | active |
| web_embeddings | webEmbeddings | sveltekit-frontend/src/lib/server/db/schema-web.ts | active |
| web_pages | webPages | sveltekit-frontend/src/lib/server/db/schema-web.ts | active |
| yorha_system_metrics | yorhaSystemMetrics | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |

## Enums By Feature

### legal corpus

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| authority_level | authorityLevelEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| citation_type | citationTypeEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| citation_type | citationTypeEnum | sveltekit-frontend/src/lib/server/db/schema/legal-citations.ts | duplicate candidate |
| corpus_type | corpusTypeEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| corpus_type | corpusTypeEnum | sveltekit-frontend/src/lib/server/db/schema/library-documents.ts | duplicate candidate |
| jurisdiction | jurisdictionEnum | sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts | duplicate candidate |
| jurisdiction | jurisdictionEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| legal_node_type | legalNodeTypeEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| legal_node_type | legalNodeTypeEnum | sveltekit-frontend/src/lib/server/db/schema/legal-nodes.ts | duplicate candidate |

### courtroom / simulation

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| courtroom_anim_type | courtroomAnimTypeEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| fictional_actor_role | fictionalCaseActorRoleEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| fictional_case_category | fictionalCaseCategoryEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |

### audio

No enums in this bucket.

### research / synthesis

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| summary_type | summaryTypeEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |

### AST intelligence

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| report_status | reportStatusEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |

### context engine

No enums in this bucket.

### chat

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| chat_message_role | chatMessageRoleEnum | sveltekit-frontend/src/lib/server/db/schema-chat.ts | active |

### analytics

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| audit_operation | auditOperationEnum | sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts | active |
| audit_table | auditTableEnum | sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts | active |
| error_kind | errorKindEnum | sveltekit-frontend/src/lib/server/db/schema-phase78.ts | duplicate candidate |
| error_kind | errorKindEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| error_severity | errorSeverityEnum | sveltekit-frontend/src/lib/server/db/schema-phase78.ts | duplicate candidate |
| error_severity | errorSeverityEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| route_health_state | routeHealthStateEnum | sveltekit-frontend/src/lib/server/db/schema-phase78.ts | duplicate candidate |
| route_health_state | routeHealthStateEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |

### infra/runtime

| DB name | Export | Source file | Status |
| --- | --- | --- | --- |
| activity_status | activityStatusEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| case_link_category | caseLinkCategoryEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| case_link_category | caseLinkCategoryEnum | sveltekit-frontend/src/lib/server/db/schema/case-library-links.ts | duplicate candidate |
| case_link_type | caseLinkTypeEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| case_priority | casePriorityEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| case_risk_level | caseRiskLevelEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| case_status | caseStatusEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| chunk_level | chunkLevelEnum | sveltekit-frontend/src/lib/server/db/schema-ingestion.ts | migration-only |
| document_status | documentStatusEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| document_type | documentTypeEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| evidence_type | evidenceTypeEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| inference_backend | inferenceBackendEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| model_capability | modelCapabilityEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| patch_status | patchStatusEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| processing_status | processingStatusEnum | sveltekit-frontend/src/lib/server/db/schema-ingestion.ts | duplicate candidate |
| processing_status | processingStatusEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| processing_status | processingStatusEnum | sveltekit-frontend/src/lib/server/db/schema/library-documents.ts | duplicate candidate |
| relation_type | relationTypeEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| service_tier | serviceTierEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| source_type | sourceTypeEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| source_type | sourceTypeEnum | sveltekit-frontend/src/lib/server/db/schema/library-documents.ts | duplicate candidate |
| suggestion_state | suggestionStateEnum | sveltekit-frontend/src/lib/server/db/schema-phase78.ts | duplicate candidate |
| suggestion_state | suggestionStateEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | duplicate candidate |
| threat_level | threatLevelEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| user_role | userRoleEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |
| verification_status | verificationStatusEnum | sveltekit-frontend/src/lib/server/db/schema-postgres.ts | active |

