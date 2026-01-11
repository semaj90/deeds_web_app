// Prosecutor MVP tables (separate from existing schema)
export * from '../schema-prosecutor.js';

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

