/**
 * PHASE 85a: SUMMARY QA GATE
 *
 * Validates summaries before storage to atlas_artifacts.
 * Rejects bad summaries (too short, too long, low grounding, hallucination).
 * Logs accepted summaries to the universal artifact registry.
 */

import { logArtifact } from './artifact-logger.js';
import type { ArtifactLogEntry } from './artifact-logger.js';

// ── Quality thresholds ─────────────────────────────────────────────────────────

export const SUMMARY_QA_THRESHOLDS = {
  min_length: 10,         // Must be >10 chars
  max_length: 1024,       // Must be <1KB
  min_confidence: 0.4,    // Confidence must be ≥40%
  min_grounding: 0.5,     // ≥50% of claims must have citations
  max_hallucination: 0.2, // ≤20% hallucination rate (claims without sources)
} as const;

export type SummaryQAResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-100
  metrics: {
    length: number;
    confidence?: number;
    grounding?: number;
    hallucination?: number;
  };
};

// ── Validate summary structure ─────────────────────────────────────────────────

export function validateSummaryStructure(summary: string | undefined): SummaryQAResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  if (!summary) {
    errors.push('Summary is empty or undefined');
    return { valid: false, errors, warnings, score: 0, metrics: { length: 0 } };
  }

  const length = summary.length;

  // Hard fail: too short
  if (length < SUMMARY_QA_THRESHOLDS.min_length) {
    errors.push(`Summary too short: ${length} chars (minimum ${SUMMARY_QA_THRESHOLDS.min_length})`);
    score -= 30;
  }

  // Hard fail: too long
  if (length > SUMMARY_QA_THRESHOLDS.max_length) {
    errors.push(`Summary too long: ${length} chars (maximum ${SUMMARY_QA_THRESHOLDS.max_length})`);
    score -= 30;
  }

  // Soft warning: very short
  if (length < 50) {
    warnings.push(`Summary is quite short (${length} chars) — consider elaboration`);
    score -= 10;
  }

  // Soft warning: repeated content (simple check)
  const sentences = summary.split(/[.!?]+/).filter((s) => s.trim());
  const uniqueSentences = new Set(sentences.map((s) => s.trim().toLowerCase()));
  if (sentences.length > 0 && uniqueSentences.size < sentences.length * 0.7) {
    warnings.push(`Summary has ${sentences.length - uniqueSentences.size} repeated sentences`);
    score -= 5;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    score: Math.max(0, score),
    metrics: { length },
  };
}

// ── Validate summary quality (confidence, grounding, hallucination) ────────────

export function validateSummaryQuality(qa: {
  summary: string;
  confidence?: number;
  groundingScore?: number;
  citations?: Array<{ chunkId: string; sourceTitle: string; quote?: string }>;
}): SummaryQAResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  const structureCheck = validateSummaryStructure(qa.summary);
  if (!structureCheck.valid) {
    return structureCheck;
  }

  // Confidence check
  if (qa.confidence !== undefined) {
    if (qa.confidence < SUMMARY_QA_THRESHOLDS.min_confidence) {
      errors.push(
        `Low confidence: ${(qa.confidence * 100).toFixed(1)}% (minimum ${SUMMARY_QA_THRESHOLDS.min_confidence * 100}%)`
      );
      score -= 25;
    } else if (qa.confidence < 0.6) {
      warnings.push(`Moderate confidence: ${(qa.confidence * 100).toFixed(1)}%`);
      score -= 10;
    }
  }

  // Grounding check (hallucination detection)
  const citationCount = qa.citations?.length || 0;
  const claims = qa.summary.split(/[.!?]+/).filter((s) => s.trim()).length;
  const groundingScore = claims > 0 ? citationCount / claims : 0;

  if (groundingScore < SUMMARY_QA_THRESHOLDS.min_grounding) {
    const hallucRate = 1 - groundingScore;
    if (hallucRate > SUMMARY_QA_THRESHOLDS.max_hallucination) {
      errors.push(
        `High hallucination rate: ${(hallucRate * 100).toFixed(1)}% claims without citations (max ${SUMMARY_QA_THRESHOLDS.max_hallucination * 100}%)`
      );
      score -= 25;
    } else {
      warnings.push(`Low grounding: ${(groundingScore * 100).toFixed(1)}% of claims have citations`);
      score -= 10;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    score: Math.max(0, score),
    metrics: {
      length: qa.summary.length,
      confidence: qa.confidence,
      grounding: groundingScore,
      hallucination: 1 - groundingScore,
    },
  };
}

// ── Store validated summary to artifact registry ────────────────────────────────

export async function storeSummaryArtifact(entry: {
  packet_key: string;
  source_ref: string;
  feature_id?: string;
  summary: string;
  confidence?: number;
  groundingScore?: number;
  citations?: Array<{ chunkId: string; sourceTitle: string; quote?: string }>;
  generator: 'Gemma4' | 'EmbeddingGemma';
  generator_version: string;
  generator_config?: Record<string, unknown>;
  trace_id?: string;
  git_commit?: string;
}): Promise<{ artifactId: string; qa: SummaryQAResult } | { error: string }> {
  // Run QA gate
  const qa = validateSummaryQuality({
    summary: entry.summary,
    confidence: entry.confidence,
    groundingScore: entry.groundingScore,
    citations: entry.citations,
  });

  if (!qa.valid) {
    return {
      error: `Summary QA failed: ${qa.errors.join('; ')}`,
    };
  }

  // Log to artifact registry
  const artifactLogEntry: ArtifactLogEntry = {
    packet_key: entry.packet_key,
    source_ref: entry.source_ref,
    feature_id: entry.feature_id,
    artifact_type: 'summary',
    generator: entry.generator,
    generator_version: entry.generator_version,
    generator_config: {
      ...entry.generator_config,
      qa_score: qa.score,
      confidence: entry.confidence,
      grounding_score: entry.groundingScore,
      citations_count: entry.citations?.length || 0,
    },
    storage_backend: 'postgres_jsonb',
    storage_location: `atlas_packets.summary`,
    status: 'generated',
    trace_id: entry.trace_id,
    git_commit: entry.git_commit,
    content: entry.summary,
  };

  const artifactId = await logArtifact(artifactLogEntry);

  return { artifactId, qa };
}
