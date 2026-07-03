import { pgTable, text, real, boolean, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
import { z } from 'zod';

/**
 * Summary Quality Evaluation Schema
 * Tracks sanitation, quality scoring, and contamination detection for Phase 8.5
 */

// ────────────────────────────────────────────────────────────────────────
// Database Tables
// ────────────────────────────────────────────────────────────────────────

export const summaryQualityEvals = pgTable('summary_quality_evals', {
  id: uuid('id').primaryKey().defaultRandom(),
  chunk_id: uuid('chunk_id').notNull(),

  // Original summary metadata
  original_length: real('original_length').notNull(),
  original_hash: text('original_hash').notNull(), // SHA256 for idempotency

  // Sanitation results
  cleaned_summary: text('cleaned_summary'),
  cleaned_length: real('cleaned_length'),

  // Quality scoring
  quality_score: real('quality_score'), // 0.0-1.0
  quality_status: text('quality_status').notNull(), // PASS | WARN | FAIL

  // Contamination detection
  contamination_flags: jsonb('contamination_flags').$type<ContaminationFlags>(),
  contamination_count: real('contamination_count').default(0),

  // Sanitation details
  cleaned_by: text('cleaned_by'), // sanitizer version
  sanitation_notes: text('sanitation_notes'),

  // Lifecycle
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export type SummaryQualityEval = typeof summaryQualityEvals.$inferSelect;
export type NewSummaryQualityEval = typeof summaryQualityEvals.$inferInsert;

// ────────────────────────────────────────────────────────────────────────
// Zod Schemas for Validation & Eval Indexing
// ────────────────────────────────────────────────────────────────────────

export const ContaminationFlagsSchema = z.object({
  has_thinking_markers: z.boolean().default(false),
  has_meta_preamble: z.boolean().default(false),
  has_self_correction: z.boolean().default(false),
  has_planning_steps: z.boolean().default(false),
  has_truncation: z.boolean().default(false),
  markers_found: z.array(z.string()).default([]), // ["<|channel>", "<thinking>", etc.]
  preamble_patterns: z.array(z.string()).default([]), // ["The user wants", "Analyze the code", etc.]
});

export type ContaminationFlags = z.infer<typeof ContaminationFlagsSchema>;

export const SummarySanitationResultSchema = z.object({
  chunk_id: z.string().uuid(),
  original_summary: z.string(),
  original_hash: z.string(), // SHA256
  original_length: z.number().nonnegative(),

  // Detected contaminations
  contaminations_detected: ContaminationFlagsSchema,
  contamination_count: z.number().nonnegative(),
  is_contaminated: z.boolean(),

  // Cleaning decisions
  is_cleanable: z.boolean(), // true if semantic content remains after cleanup
  cleaned_summary: z.string().optional(),
  cleaned_length: z.number().nonnegative().optional(),
  length_delta_pct: z.number().optional(), // % change

  // Quality assessment
  quality_score: z.number().min(0).max(1), // 0.0-1.0
  quality_status: z.enum(['PASS', 'WARN', 'FAIL']),
  quality_reason: z.string().optional(),

  // Sanitation trace
  removal_steps: z.array(z.object({
    step: z.string(), // e.g., "strip_thinking_markers", "remove_preamble"
    pattern_matched: z.string(),
    text_removed: z.string(),
    length_before: z.number(),
    length_after: z.number(),
  })).default([]),

  // Metadata
  sanitizer_version: z.string(),
  evaluated_at: z.date().default(() => new Date()),
});

export type SummarySanitationResult = z.infer<typeof SummarySanitationResultSchema>;

export const SummaryQualityReportSchema = z.object({
  phase: z.literal('8.5'),
  mode: z.enum(['dry-run', 'apply']),

  // Scan results
  total_scanned: z.number().nonnegative(),
  total_contaminated: z.number().nonnegative(),
  total_cleaned: z.number().nonnegative(),
  total_skipped: z.number().nonnegative(),
  total_failed: z.number().nonnegative(),

  // Quality metrics
  contamination_rate_before: z.number().min(0).max(100), // %
  contamination_rate_after: z.number().min(0).max(100),
  avg_length_before: z.number().nonnegative(),
  avg_length_after: z.number().nonnegative(),
  avg_quality_score: z.number().min(0).max(1),

  // Pass/warn/fail breakdown
  pass_count: z.number().nonnegative(),
  warn_count: z.number().nonnegative(),
  fail_count: z.number().nonnegative(),

  // Top contamination patterns
  top_contamination_patterns: z.array(z.object({
    pattern: z.string(),
    count: z.number(),
    pct_of_contaminated: z.number().min(0).max(100),
  })).default([]),

  // Detailed results
  results: z.array(SummarySanitationResultSchema).default([]),

  // Acceptance gates
  gates: z.object({
    contamination_rate_acceptable: z.boolean(),
    avg_quality_score_acceptable: z.boolean(),
    all_pass_or_warn: z.boolean(),
    ready_for_phase_9: z.boolean(),
  }),

  // Metadata
  started_at: z.date(),
  completed_at: z.date(),
  duration_ms: z.number().nonnegative(),
  sanitizer_version: z.string(),
  feature_extraction_ready: z.boolean().default(false),
});

export type SummaryQualityReport = z.infer<typeof SummaryQualityReportSchema>;

export const SummaryEvalIndexSchema = z.object({
  // Index key
  eval_id: z.string().uuid(),
  chunk_id: z.string().uuid(),
  source_ref: z.string(), // file path
  feature_id: z.string(), // semantic feature

  // Quality signals (for next-phase ranking)
  quality_score: z.number().min(0).max(1),
  quality_status: z.enum(['PASS', 'WARN', 'FAIL']),
  contamination_severity: z.enum(['none', 'low', 'medium', 'high']),

  // Content metrics
  summary_length: z.number().nonnegative(),
  summary_entropy: z.number().nonnegative().optional(), // for diversity
  semantic_density: z.number().min(0).max(1).optional(), // content/length ratio

  // Evaluation context
  eval_pass: z.number().nonnegative(), // Pass number (e.g., 1 for initial sanitation)
  eval_phase: z.literal('8.5').or(z.literal('9')).or(z.literal('10')),

  // Lineage
  original_hash: z.string(),
  cleaned_hash: z.string().optional(),

  // Indexed at
  indexed_at: z.date(),
});

export type SummaryEvalIndex = z.infer<typeof SummaryEvalIndexSchema>;

// ────────────────────────────────────────────────────────────────────────
// Contamination Detection Patterns
// ────────────────────────────────────────────────────────────────────────

export const CONTAMINATION_PATTERNS = {
  thinking_markers: [
    /<\|channel\>thought<channel\|>/g,
    /<\|endthinking\>/g,
    /<\|thinking\>/g,
    /<thinking>[\s\S]*?<\/thinking>/g,
  ],

  meta_preambles: [
    /^(here'?s|here'?is)\s+a\s+(thinking|summary|breakdown)/im,
    /^(the\s+)?(user\s+)?(wants|is\s+asking|is\s+looking|wants\s+a)/im,
    /^(the|this)\s+(user|code|snippet|object|component)\s+/im,
  ],

  self_correction: [
    /\*?self-correction/im,
    /\*?refinement:/im,
    /\*?important:/im,
  ],

  planning_steps: [
    /^(plan|output|note):/im,
    /^(1|2|3)\.\s+(identify|analyze|break|define|note|step)/im,
    /^(1|2|3)\.\s+\*\*/,
  ],

  final_plan: [
    /^\*?final\s+(plan|summary):/im,
    /^\*\*final\s+(plan|summary)/im,
  ],
};

export const CONTAMINATION_THRESHOLDS = {
  PASS: 0,        // 0 contaminations = PASS
  WARN: 1,        // 1-2 contaminations = WARN
  FAIL: 3,        // 3+ contaminations = FAIL
  QUALITY_PASS: 0.8,
  QUALITY_WARN: 0.6,
};
