/**
 * PHASE 85 P5: FEATURE LABEL EXTRACTION
 *
 * Pure extraction logic: buildFeatureLabels() + extractQueryFeatures() + optional Gemma4 synthesis
 * Stores results to atlas_artifacts with type='feature_labels'
 */

import { buildFeatureLabels } from '../ai/feature-builder.js';
import { extractQueryFeatures } from '../ai/feature-extraction.js';
import { bifrostChat } from '../ollama.js';
import { ENV } from '../env.server.js';
import type { ArtifactStatus } from './artifact-logger.js';
import crypto from 'crypto';

export interface ExtractedFeatures {
  feature: string;
  labels: string[];
  symbols: string[];
  confidence: number;
  summary: string;
}

export interface FeatureLabelResult {
  packetKey: string;
  sourceRef: string;
  featureId: string;
  extractedFeatures: ExtractedFeatures;
  artifactId?: string;
  contentHash: string;
  status: ArtifactStatus;
}

/**
 * Step 1: Extract features from packet context (pure logic, no I/O)
 */
export function extractFeaturesFromContext(input: {
  packetKey: string;
  sourceRef: string;
  featureId: string;
  summary?: string;
  symbols?: Record<string, string[]>;
}): ExtractedFeatures {
  const { sourceRef, featureId, summary = '', symbols = {} } = input;

  // Strategy 1: Use feature-builder.ts for symbol extraction
  const builtLabels = buildFeatureLabels({
    trace: { source_ref: sourceRef },
    symbols
  });

  // Strategy 2: Use feature-extraction.ts for intent + keyword matching
  const queryFeatures = extractQueryFeatures(summary);

  // Merge results
  const combinedLabels = new Set<string>();

  // Add labels from built features
  if (builtLabels.length > 0) {
    builtLabels.forEach(f => {
      f.labels.forEach(l => combinedLabels.add(l));
    });
  }

  // Add labels from query features
  if (queryFeatures.entities.length > 0) {
    queryFeatures.entities.forEach(e => {
      combinedLabels.add(String(e).toLowerCase());
    });
  }

  // Keyword matches from extraction
  if (queryFeatures.keywords.length > 0) {
    queryFeatures.keywords.slice(0, 3).forEach(kw => {
      combinedLabels.add(kw);
    });
  }

  // Always include feature_id as fallback
  combinedLabels.add(featureId);

  // Calculate confidence based on extraction success
  const baseConfidence = Math.min(0.95, 0.4 + (summary.length / 500) * 0.3);
  const symbolBoost = Object.keys(symbols).length > 0 ? 0.15 : 0;
  const confidence = Math.min(0.99, baseConfidence + symbolBoost);

  return {
    feature: featureId,
    labels: Array.from(combinedLabels),
    symbols: builtLabels.flatMap(f => f.symbols || []),
    confidence,
    summary: summary.substring(0, 200)
  };
}

/**
 * Step 2: Synthesize feature label via Gemma4 if confidence is low
 */
export async function synthesizeFeatureLabelIfNeeded(input: {
  extractedFeatures: ExtractedFeatures;
  sourceRef: string;
  summary?: string;
}): Promise<ExtractedFeatures> {
  const { extractedFeatures, sourceRef, summary = '' } = input;

  // Skip synthesis if confidence is already high
  if (extractedFeatures.confidence >= 0.7) {
    return extractedFeatures;
  }

  // Synthesis prompt for ambiguous cases
  const prompt = `Given this code context:
Source: ${sourceRef}
Summary: ${summary.substring(0, 150)}
Current feature labels: [${extractedFeatures.labels.join(', ')}]

What is the primary feature category this code belongs to? Answer in 1-2 words.`;

  try {
    const response = await bifrostChat(
      [{ role: 'user', content: prompt }],
      ENV.GEMMA4_MODEL ?? ENV.FUNCTION_GEMMA_MODEL ?? 'gemma4-rotorquant:latest',
      { temperature: 0.3, maxTokens: 50 }
    );

    const synthesized = response.trim().toLowerCase().split(/[\s,]+/).filter(s => s.length > 0);

    // Boost confidence for synthesized labels (trusted synthesis)
    return {
      ...extractedFeatures,
      labels: [...new Set([...extractedFeatures.labels, ...synthesized])],
      confidence: Math.min(0.95, extractedFeatures.confidence + 0.2)
    };
  } catch (err) {
    // On synthesis error, return extracted features as-is
    console.warn(`[P5] Synthesis failed: ${err instanceof Error ? err.message : String(err)}`);
    return extractedFeatures;
  }
}

/**
 * Step 3: Main pipeline - extract and optionally synthesize features
 */
export async function extractPacketFeatures(input: {
  packetKey: string;
  sourceRef: string;
  featureId: string;
  summary?: string;
  symbols?: Record<string, string[]>;
  useSynthesis?: boolean;
}): Promise<FeatureLabelResult> {
  const { packetKey, sourceRef, featureId, summary, symbols, useSynthesis = true } = input;

  // Step 1: Pure extraction
  const extracted = extractFeaturesFromContext({
    packetKey,
    sourceRef,
    featureId,
    summary,
    symbols
  });

  // Step 2: Optional synthesis for low-confidence cases
  let final = extracted;
  if (useSynthesis && extracted.confidence < 0.7) {
    final = await synthesizeFeatureLabelIfNeeded({
      extractedFeatures: extracted,
      sourceRef,
      summary
    });
  }

  // Step 3: Validate result
  if (final.labels.length === 0) {
    final.labels = [featureId];
  }

  // Step 4: Generate content hash for deduplication
  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(final.labels.sort()))
    .digest('hex');

  return {
    packetKey,
    sourceRef,
    featureId,
    extractedFeatures: final,
    contentHash,
    status: 'generated'
  };
}

/**
 * Batch extraction helper - process multiple packets
 */
export async function extractPacketFeaturesBatch(
  packets: Array<{
    packetKey: string;
    sourceRef: string;
    featureId: string;
    summary?: string;
    symbols?: Record<string, string[]>;
  }>,
  options: { useSynthesis?: boolean; parallelism?: number } = {}
): Promise<FeatureLabelResult[]> {
  const { useSynthesis = true, parallelism = 1 } = options;
  const results: FeatureLabelResult[] = [];

  for (const packet of packets) {
    const result = await extractPacketFeatures({
      ...packet,
      useSynthesis
    });
    results.push(result);

    // Simple rate limiting for Gemma4 calls
    if (useSynthesis && result.extractedFeatures.confidence < 0.7) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}
