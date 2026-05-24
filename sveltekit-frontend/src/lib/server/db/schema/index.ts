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
export * from './feature-registry.js';
export * from './atlas-cards.js';

// Phase 6f/7 Post-Synthesis metadata
export * from './synthesis-logs.js';
