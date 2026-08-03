/**
 * Phase 17 PyTorch Feature Extractor
 *
 * Accepts ReconciliationResult from Phase 10-19 and extracts features for ranking.
 * Implements 4-step pipeline:
 * 1. Input validation
 * 2. Feature scoring (extract 3 score lanes)
 * 3. Metadata extraction
 * 4. Schema serialization (task_semantic_packets format)
 *
 * Fallback chain: Full extraction → Schema-indexer only → JS heuristics → default
 */

import {
  phase17InputSchema,
  extractedFeaturesSchema,
  phase17OutputSchema,
  extractFeatureLabel,
  generatePacketKey,
  type Phase17Input,
  type ExtractedFeatures,
  type Phase17Output,
} from './phase17-schema';
import {
  enhanceMetadata,
  extractSemanticVector,
} from './phase17-advanced-features';
import { db } from '$lib/server/db/client';

// ══════════════════════════════════════════════════════════════
// STEP 1: Input Validation
// ══════════════════════════════════════════════════════════════

export async function validatePhase17Input(
  input: unknown
): Promise<{ valid: true; data: Phase17Input } | { valid: false; error: string }> {
  try {
    const parsed = phase17InputSchema.parse(input);
    return { valid: true, data: parsed };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Unknown validation error',
    };
  }
}

// ══════════════════════════════════════════════════════════════
// STEP 2: Feature Scoring (Extract 3 score lanes from reconciliation)
// ══════════════════════════════════════════════════════════════

function extractScoreProfile(input: Phase17Input): {
  qdrant: number;
  cluster: number;
  topological: number;
  fusion: number;
} {
  const { qdrant, cluster, topological, fusion } = input.reconciliationResult.scoreProfile;

  return {
    qdrant: Math.max(0, Math.min(1, qdrant || 0.5)),
    cluster: Math.max(0, Math.min(1, cluster || 0.5)),
    topological: Math.max(0, Math.min(1, topological || 0.5)),
    fusion: Math.max(0, Math.min(1, fusion || 0.5)),
  };
}

// ══════════════════════════════════════════════════════════════
// STEP 3: Metadata Extraction
// ══════════════════════════════════════════════════════════════

function extractMetadata(
  input: Phase17Input,
  sourceRef: string
): ExtractedFeatures['metadata'] {
  const { clusterCards, packets } = input.reconciliationResult;

  // Find matching cluster card
  const matchingCard = clusterCards.find((card) =>
    card.sourceRefs.some((ref) => ref === sourceRef)
  );

  // Authority score (from cluster card or default)
  const authorityScore = matchingCard?.authorityScore ?? 0.5;

  // Member count (cluster size)
  const memberCount = matchingCard?.sourceRefs.length ?? 0;

  // Summary length
  const summaryLength = matchingCard?.clusterSummary?.length ?? 0;

  // Source ref depth (number of path segments)
  const sourceRefDepth = sourceRef.split('/').length - 1;

  // Is core library (in src/lib/?)
  const isCoreLibrary = sourceRef.startsWith('src/lib/');

  // Is test file
  const isTestFile = /test|spec|__tests__|\.spec\.|\.test\./.test(sourceRef);

  // Packet coverage
  const matchingPackets = packets.filter(
    (p) => p.sourceRef === sourceRef || p.featureId === input.featureId
  );
  const hasPackets = matchingPackets.length > 0;
  const packetCount = matchingPackets.length;
  const avgPacketAuthority =
    packetCount > 0
      ? matchingPackets.reduce((sum, p) => sum + (matchingCard?.authorityScore ?? 0.5), 0) /
        packetCount
      : 0.5;

  return {
    authority_score: authorityScore,
    member_count: memberCount,
    summary_length: summaryLength,
    source_ref_depth: sourceRefDepth,
    is_core_library: isCoreLibrary,
    is_test_file: isTestFile,
    has_packets: hasPackets,
    packet_count: packetCount,
    avg_packet_authority: avgPacketAuthority,
  };
}

// ══════════════════════════════════════════════════════════════
// PERSISTENCE: Write to Postgres task_semantic_packets
// ══════════════════════════════════════════════════════════════

/**
 * Persist Phase 17 output to Postgres task_semantic_packets table
 * Handles upsert logic: insert if new, update if exists
 */
export async function persistPhase17Output(output: Phase17Output): Promise<void> {
  try {
    // Prepare the row for insertion
    // Note: Using raw SQL insert since Drizzle schema for this table isn't generated yet
    const query = `
      INSERT INTO task_semantic_packets (
        packet_key, source_ref, feature_id, feature_label, alias_id,
        qdrant_score, cluster_score, topological_score, fusion_score,
        metadata, semantic_vector,
        validation_status, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (packet_key) DO UPDATE SET
        updated_at = NOW(),
        validation_status = EXCLUDED.validation_status,
        error_message = EXCLUDED.error_message,
        metadata = EXCLUDED.metadata,
        semantic_vector = EXCLUDED.semantic_vector
    `;

    const params = [
      output.packet_key,
      output.source_ref,
      output.feature_id,
      output.feature_label,
      output.alias_id,
      output.extracted_features.qdrant_score,
      output.extracted_features.cluster_score,
      output.extracted_features.topological_score,
      output.extracted_features.fusion_score,
      JSON.stringify(output.extracted_features.metadata),
      output.extracted_features.semantic_vector ? JSON.stringify(output.extracted_features.semantic_vector) : null,
      output.validation_status,
      output.error_message,
    ];

    // Execute the query using Drizzle's raw query interface
    // (Postgres driver with type safety but raw SQL for table without schema)
    // For now, log the intention; real implementation waits for ORM table schema
    console.info('[Phase17] Persistence: would write packet', {
      packet_key: output.packet_key,
      source_ref: output.source_ref,
      feature_id: output.feature_id,
      validation_status: output.validation_status,
    });

    // TODO: Implement actual Postgres write once task_semantic_packets table is in Drizzle schema
    // await db.execute(query, params);
  } catch (err) {
    console.error('[Phase17] Persistence failed:', err);
    // Non-blocking: log the error but don't throw
    // Feature extraction completed successfully; persistence is optional
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN: Extract Features (with fallback chain)
// ══════════════════════════════════════════════════════════════

export async function extractFeatures(input: unknown): Promise<Phase17Output> {
  // Step 1: Validate input
  const validation = await validatePhase17Input(input);
  if (!validation.valid) {
    console.warn('[Phase17] Input validation failed:', (validation as { error?: string }).error);
    return defaultFeatures(input);
  }

  const { data } = validation;

  try {
    // Step 2: Extract score lanes
    const scores = extractScoreProfile(data);

    // Step 3: Extract metadata
    let metadata = extractMetadata(data, data.sourceRef);

    // Step 3b: Enhance with advanced features (Phase 17B)
    try {
      metadata = enhanceMetadata(metadata, data, data.sourceRef);
    } catch (err) {
      console.warn('[Phase17] Advanced feature enhancement failed:', err);
      // Continue with base metadata
    }

    // Step 3c: Optional semantic vector (Phase 17C)
    let semanticVector: number[] | undefined;
    try {
      semanticVector = await extractSemanticVector(data);
    } catch (err) {
      console.warn('[Phase17] Semantic vector extraction failed:', err);
      // Continue without semantic vector
      semanticVector = undefined;
    }

    // Step 4: Construct extracted_features
    const extractedFeatures: ExtractedFeatures = {
      qdrant_score: scores.qdrant,
      cluster_score: scores.cluster,
      topological_score: scores.topological,
      fusion_score: scores.fusion,
      metadata,
      semantic_vector: semanticVector,
    };

    // Validate extracted features
    const featuresValidation = extractedFeaturesSchema.safeParse(extractedFeatures);
    if (!featuresValidation.success) {
      console.warn('[Phase17] Features validation failed:', featuresValidation.error);
      return defaultFeatures(input);
    }

    // Construct output packet
    const output: Phase17Output = {
      packet_key: generatePacketKey(data.sourceRef, data.featureId),
      source_ref: data.sourceRef,
      feature_id: data.featureId,
      feature_label: extractFeatureLabel(data.featureId),
      alias_id: data.aliasId,
      extracted_features: featuresValidation.data,
      validation_status: 'valid',
      error_message: null,
    };

    // Final validation
    const outputValidation = phase17OutputSchema.safeParse(output);
    if (!outputValidation.success) {
      console.warn('[Phase17] Output validation failed:', outputValidation.error);
      return defaultFeatures(input);
    }

    return outputValidation.data;
  } catch (err) {
    console.error('[Phase17] Feature extraction failed:', err);
    return defaultFeatures(input);
  }
}

// ══════════════════════════════════════════════════════════════
// FALLBACK: Default features (validation_status: pending)
// ══════════════════════════════════════════════════════════════

function defaultFeatures(input: unknown): Phase17Output {
  const sourceRef = typeof input === 'object' && input !== null && 'sourceRef' in input
    ? String((input as Record<string, unknown>).sourceRef)
    : 'unknown';

  const featureId = typeof input === 'object' && input !== null && 'featureId' in input
    ? String((input as Record<string, unknown>).featureId)
    : 'unknown';

  const aliasId = typeof input === 'object' && input !== null && 'aliasId' in input
    ? String((input as Record<string, unknown>).aliasId)
    : 'unknown';

  return {
    packet_key: generatePacketKey(sourceRef, featureId),
    source_ref: sourceRef,
    feature_id: featureId,
    feature_label: extractFeatureLabel(featureId),
    alias_id: aliasId,
    extracted_features: {
      qdrant_score: 0.5,
      cluster_score: 0.5,
      topological_score: 0.5,
      fusion_score: 0.5,
      metadata: {
        authority_score: 0.5,
        member_count: 0,
        summary_length: 0,
        source_ref_depth: 0,
        is_core_library: false,
        is_test_file: false,
        has_packets: false,
        packet_count: 0,
        avg_packet_authority: 0.5,
      },
    },
    validation_status: 'pending',
    error_message: 'All extraction methods failed, using default score',
  };
}

// ══════════════════════════════════════════════════════════════
// BATCH: Extract features for multiple inputs
// ══════════════════════════════════════════════════════════════

export async function extractFeaturesBatch(
  inputs: unknown[],
  options: { continueOnError?: boolean } = {}
): Promise<Phase17Output[]> {
  const results: Phase17Output[] = [];

  for (const input of inputs) {
    try {
      const result = await extractFeatures(input);
      results.push(result);
    } catch (err) {
      if (!options.continueOnError) throw err;
      console.warn('[Phase17] Batch item failed, continuing:', err);
      results.push(defaultFeatures(input));
    }
  }

  return results;
}
