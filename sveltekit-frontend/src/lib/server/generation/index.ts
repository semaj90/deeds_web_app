/**
 * PHASE 85a: Generation pipeline exports
 *
 * Centralized exports for:
 *   - Semantic diff gating (similarity scoring)
 *   - Artifact registry logging (universal derived registry)
 *   - Summary QA validation (confidence, grounding, hallucination)
 *   - Summary pipeline (end-to-end flow)
 */

export * from './semantic-diff-gate.js';
export type { SemanticDiffRecommendation } from './semantic-diff-gate.js';
export { SEMANTIC_DIFF_THRESHOLDS, semanticDiffGate, cacheSummaryEmbedding, getCachedSummaryEmbedding } from './semantic-diff-gate.js';

export * from './artifact-logger.js';
export type {
  ArtifactType,
  Generator,
  ArtifactStatus,
  ArtifactLogEntry,
} from './artifact-logger.js';
export { logArtifact, getPacketArtifacts, getArtifactsByGenerator, getSupersessionChain, markArtifactValidated, markArtifactFailed } from './artifact-logger.js';

export * from './summary-qa.js';
export type { SummaryQAResult } from './summary-qa.js';
export { SUMMARY_QA_THRESHOLDS, validateSummaryStructure, validateSummaryQuality, storeSummaryArtifact } from './summary-qa.js';

export * from './packet-summary-pipeline.js';
export type { SummaryPipelineResult } from './packet-summary-pipeline.js';
export { runPacketSummaryPipeline, runPacketSummaryPipelineBatch } from './packet-summary-pipeline.js';
