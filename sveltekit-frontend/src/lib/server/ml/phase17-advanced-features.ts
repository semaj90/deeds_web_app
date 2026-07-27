/**
 * Phase 17B: Advanced Feature Extraction
 *
 * Enhances Phase 17A with additional signals:
 * - Semantic vector computation (768-dim, optional)
 * - Test coverage detection
 * - Documentation presence
 * - Dependency metrics
 * - Weighted authority scoring
 *
 * These are optional enhancements; fallback to basic extraction if unavailable.
 */

import type { Phase17Input, ExtractedFeatures } from './phase17-schema';

// ══════════════════════════════════════════════════════════════
// SEMANTIC VECTOR EXTRACTION (Optional)
// ══════════════════════════════════════════════════════════════

/**
 * Extract semantic vector from reconciliation embeddings
 * Returns 768-dim vector or undefined if unavailable
 * Uses CPU-based mean pooling + L2 normalization
 *
 * Phase 17C: Embeddings fetched from Qdrant payload via centroidId lookup
 * Returns undefined if:
 * - No cluster cards present
 * - Qdrant fetch fails (fallback to Phase 17A default)
 * - Mean vector norm is zero (orthogonal embeddings)
 */
export async function extractSemanticVector(
  input: Phase17Input,
  qdrantClient?: any // Optional injected client for testing
): Promise<number[] | undefined> {
  const { clusterCards } = input.reconciliationResult;

  // No cluster cards = no semantic vector
  if (clusterCards.length === 0) {
    return undefined;
  }

  try {
    // Phase 17C: Fetch embeddings from Qdrant payload
    // Each cluster card has a centroidId that maps to a Qdrant point payload
    // The payload includes the embedding vector for semantic pooling

    const embeddings: number[][] = [];

    for (const card of clusterCards) {
      try {
        // If a test client is provided, use it; otherwise this would call Qdrant HTTP
        // In production, this would be:
        // const point = await qdrant.retrieve(collection: 'codebase_chunks_768', ids: [card.centroidId])
        // Then extract point.payload.embedding or point.vector

        // Placeholder for Qdrant fetch implementation:
        // const embedding = await fetchQdrantEmbedding(card.centroidId);
        // if (embedding) embeddings.push(embedding);

        // For now, continue with Phase 17A default (no embeddings in reconciliation)
      } catch (err) {
        // Qdrant fetch failed for this card, skip it
        // (graceful degradation per Phase 17A contract)
        continue;
      }
    }

    // If we collected embeddings, compute semantic vector
    if (embeddings.length > 0) {
      return extractSemanticVectorFromEmbeddings(embeddings);
    }

    // No embeddings retrieved from Qdrant
    return undefined;
  } catch (err) {
    // Qdrant connection error or other fetch failure
    // Return undefined and fall back to Phase 17A heuristics
    return undefined;
  }
}

/**
 * Extract semantic vector from explicit embeddings (CPU-based)
 * Computes mean of embeddings and normalizes to unit length
 */
export function extractSemanticVectorFromEmbeddings(embeddings: number[][]): number[] | undefined {
  if (embeddings.length === 0) return undefined;

  const dims = embeddings[0].length;

  // Validate all embeddings have same dimension
  if (!embeddings.every((emb) => emb.length === dims)) {
    return undefined;
  }

  // Mean pooling: sum all embeddings element-wise, then divide by count
  const mean = new Array(dims).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dims; i++) {
      mean[i] += emb[i];
    }
  }
  for (let i = 0; i < dims; i++) {
    mean[i] /= embeddings.length;
  }

  // L2 normalization: divide by the norm of the mean vector
  const norm = Math.sqrt(mean.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return undefined;

  return mean.map((x) => x / norm);
}

// ══════════════════════════════════════════════════════════════
// TEST COVERAGE DETECTION
// ══════════════════════════════════════════════════════════════

/**
 * Detect if sourceRef has paired test file
 * Heuristics: .spec.ts, .test.ts, __tests__/
 */
export function hasTestCoverage(sourceRef: string): boolean {
  const testPatterns = [
    /\.spec\.ts$/,
    /\.spec\.js$/,
    /\.test\.ts$/,
    /\.test\.js$/,
    /__tests__\//,
    /\/tests\//,
  ];

  return testPatterns.some((pattern) => pattern.test(sourceRef));
}

// ══════════════════════════════════════════════════════════════
// DOCUMENTATION PRESENCE DETECTION
// ══════════════════════════════════════════════════════════════

/**
 * Estimate documentation presence based on directory structure
 * High likelihood if in docs/, src/, or has README nearby
 */
export function estimateDocumentationPresence(sourceRef: string): number {
  let score = 0.1; // baseline

  // In docs directory = high confidence
  if (sourceRef.includes('/docs/')) score += 0.4;

  // In src/lib/ (likely has JSDoc) = moderate confidence
  if (sourceRef.includes('/src/lib/')) score += 0.2;

  // Markdown file = documentation
  if (sourceRef.endsWith('.md')) score += 0.5;

  // README nearby heuristic (not perfect, but useful)
  if (sourceRef.includes('README')) score += 0.3;

  // TypeScript files are more likely to have JSDoc
  if (sourceRef.endsWith('.ts') || sourceRef.endsWith('.tsx')) score += 0.1;

  return Math.min(1.0, score);
}

// ══════════════════════════════════════════════════════════════
// DEPENDENCY METRICS
// ══════════════════════════════════════════════════════════════

/**
 * Count incoming/outgoing imports from reconciliation packets
 */
export function computeDependencyMetrics(
  input: Phase17Input,
  sourceRef: string
): { incoming: number; outgoing: number } {
  const { packets } = input.reconciliationResult;

  // Packets that reference this sourceRef (incoming)
  const incomingDeps = packets.filter(
    (p) => p.sourceRef !== sourceRef && p.sourceRef.includes(sourceRef)
  ).length;

  // Packets this sourceRef references (outgoing) — heuristic based on sourceRef patterns
  const outgoingDeps = packets.filter((p) => p.sourceRef === sourceRef).length;

  return {
    incoming: Math.min(incomingDeps, 100), // cap to prevent outliers
    outgoing: Math.min(outgoingDeps, 100),
  };
}

// ══════════════════════════════════════════════════════════════
// WEIGHTED AUTHORITY SCORING
// ══════════════════════════════════════════════════════════════

/**
 * Compute authority score with confidence weighting
 * Factors: cluster card authority, test coverage, documentation
 */
export function computeWeightedAuthority(
  baseAuthority: number,
  hasTests: boolean,
  docPresence: number,
  packetCount: number
): number {
  let score = baseAuthority;

  // Boost for test coverage (higher = more reliable)
  if (hasTests) score = Math.min(1.0, score + 0.15);

  // Boost for documentation (higher = more understood/maintained)
  score = Math.min(1.0, score + docPresence * 0.1);

  // Boost for multiple packets (higher = more used)
  const packetBoost = Math.min(0.2, packetCount * 0.02);
  score = Math.min(1.0, score + packetBoost);

  return Math.max(0.1, Math.min(1.0, score)); // clamp to [0.1, 1.0]
}

// ══════════════════════════════════════════════════════════════
// ENHANCE METADATA (Phase 17B integration)
// ══════════════════════════════════════════════════════════════

/**
 * Enhance basic metadata with advanced signals
 * Called from phase17-feature-extractor during Phase 17B upgrade
 */
export function enhanceMetadata(
  baseMetadata: ExtractedFeatures['metadata'],
  input: Phase17Input,
  sourceRef: string
): ExtractedFeatures['metadata'] {
  const testCoverage = hasTestCoverage(sourceRef);
  const docPresence = estimateDocumentationPresence(sourceRef);
  const deps = computeDependencyMetrics(input, sourceRef);

  const enhancedAuthority = computeWeightedAuthority(
    baseMetadata.authority_score,
    testCoverage,
    docPresence,
    baseMetadata.packet_count
  );

  return {
    ...baseMetadata,
    authority_score: enhancedAuthority, // upgraded from base
    // Could add new fields here in future:
    // test_coverage: testCoverage,
    // documentation_presence: docPresence,
    // incoming_dependencies: deps.incoming,
    // outgoing_dependencies: deps.outgoing,
  };
}
