// Prosecutor MVP tables
export * from '../schema-prosecutor.js';

// Core Application Tables (legal-cases.js is canonical for 'cases' table + relations)
export * from './citations.js';
export * from './evidence.js';
export * from './evidence-multi-modal.js';
export * from './legal-cases.js';
export * from './persons.js';
export * from './reports.js';

// AI & Chat
export * from './ai_chat.js';

// Phase 78 (Cutlass) error tracking tables
export * from './error_clusters.js';
export * from './error_events.js';
export * from './error_feedback.js';
export * from './error_suggestions.js';
export * from './error_timeline.js';
export * from './route_error_patches.js';
export * from './route_health.js';
export * from './route_metadata.js';

// Phase 9 (Error Brain Analysis) tables
export * from './error_brain_analysis.js';

// Phase 27 (Error Brain Diffs) tables
export * from './errorBrainDiffs.js';

// ACE Pipeline tables
export * from './ace-web-crawl.js';
export * from '../schema-ace.js';

// Analytics (user_analytics_events — used via raw SQL in event-logger.ts)
export * from './analytics.js';

// Search Intelligence pipeline tables (chunk_hit_log, rag_query_log, qlora_examples, response_feedback, query_variance_pairs)
export * from './search-analytics.js';

// === UNIVERSAL LEGAL CORPUS SCHEMA ===
// Canonical legal structure (Layer 1)
export * from './jurisdictions.js';
export * from './library-documents.js';
export * from './library-document-versions.js';
export * from './legal-nodes.js';
export * from './legal-definitions.js';
export * from './legal-citations.js';

// Retrieval/index layer (Layer 2)
export * from './legal-chunks.js';

// Pipeline & provenance
export * from './page-artifacts.js';
export * from './ingestion-jobs.js';
export * from './state-constitution-sources.js';

// Case ↔ corpus linkage
export * from './case-library-links.js';

// Drizzle relations for legal corpus tables
export * from './legal-relations.js';

// Codebase intelligence persistence layer (code_repos, enrichment_jobs)
export * from './codebase-intelligence.js';

// Codebase document atlas, features index, and cache traces
export * from './documents-atlas.js';
export * from './parent-atlas-jobs.js';
export * from './parent-atlas-documents.js';
export * from './feature-registry.js';
export * from './atlas-cards.js';
export * from './atlas-profile-store.js';

// Phase 6f/7 Post-Synthesis metadata
export * from './synthesis-logs.js';

export * from './rag-cards.js';
export * from './summary-cards.js';
export * from './normalize-labels.js';
export * from './nes-chrom-packets.js';
export * from './atlas-feature-map.js';
export * from './atlas-memory-address-registry.js';
export * from './atlas-dict.js';

// 2026-05-30 drift remediation — DO NOT add the Round-1 sidecars
// (case-notes, case-statute-links, case-note-versions, case-note-evidence-refs,
//  legal-documents, statute-chunks, timeline-events, workspaces,
//  workspace-notes, workspace-sessions) to this barrel — they are REDUNDANT with
// schema-postgres.ts. See the MERGED-WITH-CANONICAL banner inside each file.
//
// Round 2 (Tier-A from real-gap-classification.md): these are confirmed
// undeclared in any canonical schema file and have active rows. Safe to export.
export * from './feature-registry-vectors.js';
export * from './codebase-embeddings.js';
export * from './codebase-files.js';
export * from './intent-synthesis-rewards.js';
export * from './feature-cards.js';
export * from './codebase-relationship-reports.js';
export * from './vector-smoke.js';
export * from './atlas-feature-map-synthesized.js';
export * from './atlas-feature-packets.js';

// Round 3 (Tier-D promotions from real-gap-classification.md):
// `embeddings` is FK-referenced by case_chunks.chunk_embedding_id.
// `model_weights` is consumed by admin/model-manager + admin routes + dashboard.
// `migrations` is custom journal (managed by db/migrate.ts) — added to tablesFilter.
export * from './embeddings.js';
export * from './model-weights.js';
export * from './route_runtime_packets.js';
export * from './concept-records.js';
export * from './retrieval-telemetry.js';
export * from './kanban-tasks.js';
export * from './agent-traces.js';
export * from './atlas-packets.js';
export * from './atlas-tree-nodes.js';
