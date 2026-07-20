import { z } from 'zod';

/**
 * File Understanding Contract
 * Defines labeling schema for atlas_packets with purpose, thoroughness, criticality, and test coverage.
 * Labels can be computed heuristically (fast) or via Gemma4 (accurate) or from training data (ground truth).
 */

export const FilePurposeEnum = z.enum([
  'audit',
  'config',
  'utility',
  'core',
  'test',
  'demo',
  'deprecated',
  'archived',
  'infrastructure',
  'other',
]);

export const ThoroughnessEnum = z.enum([
  'stub',               // 1: empty or <20 lines, bare outline only
  'outline',            // 2: basic structure, comments indicate intent, <40% implemented
  'partial',            // 3: feature-level implementation, 40-80% complete, may have TODOs
  'feature_complete',   // 4: implements documented features, >80%, ready for use
  'battle_tested',      // 5: production-hardened, >90%, has tests/docs/monitoring
]);

export const AppCriticalityEnum = z.enum([
  'core',           // Core functionality, app breaks without this
  'high_risk',      // High-value feature, breaks important workflows
  'mid_tier',       // Useful feature, app works without it but worse
  'optional',       // Nice-to-have feature, optional enhancement
  'experimental',   // Research/prototype, may be removed
]);

export const FileUnderstandingMethodEnum = z.enum([
  'heuristic',      // Fast pattern matching (AST + regex + file stats)
  'gemma4',         // LLM-based analysis (slow, high accuracy)
  'training_data',  // Ground truth from training set
  'human',          // Manual labeling via dashboard
]);

export const FileUnderstandingSchema = z.object({
  packet_key: z.string(),
  source_ref: z.string(),
  file_purpose: FilePurposeEnum,
  thoroughness: ThoroughnessEnum,
  app_criticality: AppCriticalityEnum,
  test_coverage_pct: z.number().int().min(0).max(100),
  computed_at: z.date(),
  method: FileUnderstandingMethodEnum,
  confidence: z.number().min(0).max(1), // 0.5-0.7 (heuristic), 0.8-0.95 (Gemma4), 1.0 (ground truth)
  reasoning: z.string().optional(), // Why we chose these labels
});

export type FilePurpose = z.infer<typeof FilePurposeEnum>;
export type Thoroughness = z.infer<typeof ThoroughnessEnum>;
export type AppCriticality = z.infer<typeof AppCriticalityEnum>;
export type FileUnderstandingMethod = z.infer<typeof FileUnderstandingMethodEnum>;
export type FileUnderstanding = z.infer<typeof FileUnderstandingSchema>;

/**
 * Heuristic label computation (fast path)
 * Uses AST, file stats, and content patterns to estimate labels without LLM.
 */
export const HeuristicLabelsSchema = z.object({
  packet_key: z.string(),
  source_ref: z.string(),
  file_path: z.string(),
  content: z.string(),
  ast_symbols: z.array(z.string()).optional(), // ['it', 'describe'] → test file
  imports: z.array(z.string()).optional(),
  exports: z.array(z.string()).optional(),
  line_count: z.number().int(),
});

/**
 * Gemma4-based label computation (accurate path)
 * LLM analyzes file purpose and quality with reasoning.
 */
export const Gemma4LabelsSchema = z.object({
  packet_key: z.string(),
  source_ref: z.string(),
  purpose_reasoning: z.string(),
  thoroughness_reasoning: z.string(),
  criticality_reasoning: z.string(),
  test_coverage_reasoning: z.string(),
  confidence_score: z.number().min(0.7).max(1.0),
});

/**
 * Labeling decision history for audit trail.
 */
export const FileUnderstandingAuditSchema = z.object({
  packet_key: z.string(),
  source_ref: z.string(),
  labeled_at: z.date(),
  method: FileUnderstandingMethodEnum,
  previous_labels: FileUnderstandingSchema.optional(),
  new_labels: FileUnderstandingSchema,
  confidence_score: z.number(),
  notes: z.string().optional(),
});

export type FileUnderstandingAudit = z.infer<typeof FileUnderstandingAuditSchema>;

/**
 * Label thresholds and heuristic rules.
 */
export const HEURISTIC_LABELS = {
  /**
   * File purpose detection rules (evaluated in order).
   */
  purposes: [
    {
      pattern: /test|spec|\.test\.|\.spec\.|__tests__|jest\.setup/i,
      purpose: 'test' as FilePurpose,
    },
    {
      pattern: /config|\.config\.|settings|env\.|constants\./i,
      purpose: 'config' as FilePurpose,
    },
    {
      pattern: /docker|ci|github|gitlab|makefile|build|webpack|rollup|tsconfig/i,
      purpose: 'infrastructure' as FilePurpose,
    },
    {
      pattern: /deprecated|archived|backup|old_|legacy_|v1_|v2_|sunset/i,
      purpose: 'deprecated' as FilePurpose,
    },
    {
      pattern: /demo|example|showcase|playground|sandbox/i,
      purpose: 'demo' as FilePurpose,
    },
    {
      pattern: /db|model|schema|entity|service|handler|controller|router/i,
      purpose: 'core' as FilePurpose,
    },
    {
      pattern: /helper|util|lib|function|method|tool|adapter|bridge/i,
      purpose: 'utility' as FilePurpose,
    },
  ],

  /**
   * Thoroughness estimation based on line count and code density.
   */
  thoroughnessRules: {
    stub: { lineCount: { max: 20 }, commentRatio: { min: 0.8 } }, // Mostly comments
    outline: { lineCount: { max: 40 }, implementationRatio: { max: 0.4 } },
    partial: { lineCount: { max: 200 }, implementationRatio: { min: 0.4, max: 0.8 } },
    feature_complete: { lineCount: { max: 2000 }, implementationRatio: { min: 0.8 } },
    battle_tested: { hasTests: true, hasDocumentation: true, implementationRatio: { min: 0.9 } },
  },

  /**
   * Criticality inference: if imports these modules, it's likely high-risk.
   */
  criticalImports: [
    'db/client',
    'auth',
    'middleware',
    'errors',
    'security',
    'validation',
    'schema',
  ],
};

/**
 * Compute heuristic labels (fast path, 0-confidence-calibrated).
 * Returns partial labels + confidence scores for missing fields.
 */
export function computeHeuristicLabels(input: z.infer<typeof HeuristicLabelsSchema>): Partial<FileUnderstanding> {
  const { file_path, content, ast_symbols = [], imports = [], line_count } = input;

  // Purpose detection
  let purpose: FilePurpose = 'other';
  for (const rule of HEURISTIC_LABELS.purposes) {
    if (rule.pattern.test(file_path)) {
      purpose = rule.purpose;
      break;
    }
  }

  // Thoroughness estimation
  let thoroughness: Thoroughness = 'stub';
  if (line_count > 2000) thoroughness = 'battle_tested';
  else if (line_count > 200) thoroughness = 'feature_complete';
  else if (line_count > 40) thoroughness = 'partial';
  else if (line_count > 20) thoroughness = 'outline';

  // Test coverage heuristic
  const hasTests = ast_symbols?.includes('it') || ast_symbols?.includes('describe');
  const test_coverage_pct = hasTests ? 50 : 0; // Placeholder: AST only

  // Criticality: check if imports critical modules
  let app_criticality: AppCriticality = 'optional';
  if (purpose === 'core') app_criticality = 'core';
  else if (HEURISTIC_LABELS.criticalImports.some((imp) => imports?.includes(imp))) {
    app_criticality = 'high_risk';
  }

  return {
    file_purpose: purpose,
    thoroughness,
    app_criticality,
    test_coverage_pct,
    method: 'heuristic',
    confidence: 0.6, // Heuristics are inherently uncertain
  };
}
