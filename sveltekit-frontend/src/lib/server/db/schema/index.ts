// Prosecutor MVP tables
export * from '../schema-prosecutor.js';

// Core Application Tables (legal-cases.js is canonical for 'cases' table + relations)
export * from './citations.js';
export * from './evidence.js';
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

// Analytics (user_analytics_events — used via raw SQL in event-logger.ts)
export * from './analytics.js';
