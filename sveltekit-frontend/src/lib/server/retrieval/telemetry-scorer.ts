/**
 * Telemetry Scorer — Compute recency + validation signal
 *
 * Phase 1 Quick Win: Replace stub returning 0 with real telemetry scoring
 * Expected impact: +10% NDCG@5 through temporal & confidence signals
 */

/**
 * Compute recency score based on last access timestamp
 *
 * Recent items rank higher:
 * - Accessed < 1 hour ago: 1.0 (most recent)
 * - Accessed 1-7 days ago: 0.5 (moderately recent)
 * - Accessed > 30 days ago: 0.1 (stale)
 */
export function computeRecencyScore(
  lastAccessedAt: Date | string | number | null,
  referenceTime: Date = new Date()
): number {
  if (!lastAccessedAt) return 0.1; // Not accessed = lowest score

  const lastAccess = new Date(lastAccessedAt);
  const ageMs = referenceTime.getTime() - lastAccess.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  // Exponential decay: half-life = 7 days
  const halfLifeHours = 7 * 24;
  const decayFactor = Math.pow(0.5, ageHours / halfLifeHours);
  const score = Math.max(0.1, decayFactor); // Floor at 0.1

  return Math.min(1, score);
}

/**
 * Compute validation confidence score
 *
 * Higher confidence = more trustworthy result
 * Range [0, 1] where:
 * - 0.9-1.0 = canonical/verified
 * - 0.7-0.9 = high confidence
 * - 0.5-0.7 = moderate confidence
 * - < 0.5 = low confidence
 */
export function computeValidationScore(confidenceScore: number | null): number {
  if (confidenceScore === null || confidenceScore === undefined) return 0.5; // Neutral
  return Math.max(0, Math.min(1, confidenceScore));
}

/**
 * Compute hit rate score
 * Frequently accessed items are more likely to be relevant again
 *
 * Hit rate: how many times this item was clicked/selected
 * Normalize by max historical hit rate
 */
export function computeHitRateScore(hitCount: number, maxHistoricalHitRate: number = 100): number {
  if (maxHistoricalHitRate <= 0 || hitCount < 0) return 0;
  const normalized = Math.min(hitCount / maxHistoricalHitRate, 1.0);
  return normalized;
}

/**
 * Blend telemetry signals into single score
 *
 * Combines recency, confidence, and hit rate
 * with configurable weights
 */
export function blendTelemetrySignals(
  lastAccessedAt?: Date | string | number | null,
  confidenceScore?: number | null,
  hitCount?: number,
  weights?: { recency?: number; confidence?: number; hitRate?: number }
): number {
  const w = {
    recency: weights?.recency ?? 0.4,
    confidence: weights?.confidence ?? 0.4,
    hitRate: weights?.hitRate ?? 0.2
  };

  let score = 0;
  let weightSum = 0;

  if (lastAccessedAt !== undefined && w.recency > 0) {
    score += computeRecencyScore(lastAccessedAt) * w.recency;
    weightSum += w.recency;
  }

  if (confidenceScore !== undefined && w.confidence > 0) {
    score += computeValidationScore(confidenceScore) * w.confidence;
    weightSum += w.confidence;
  }

  if (hitCount !== undefined && w.hitRate > 0) {
    score += computeHitRateScore(hitCount) * w.hitRate;
    weightSum += w.hitRate;
  }

  return weightSum > 0 ? score / weightSum : 0.1; // Default to 0.1 if no signals
}

/**
 * Unit test: verify telemetry scorer
 */
export function testTelemetryScorer(): { pass: boolean; message: string } {
  const tests: Array<{ name: string; pass: boolean }> = [];
  const now = new Date();

  // Test 1: Recency scoring
  const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
  const rec1 = computeRecencyScore(oneHourAgo, now);
  tests.push({
    name: 'Item accessed 1 hour ago → high score',
    pass: rec1 > 0.9
  });

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rec2 = computeRecencyScore(thirtyDaysAgo, now);
  tests.push({
    name: 'Item accessed 30 days ago → lower score',
    pass: rec2 < 0.3
  });

  const nullAccess = computeRecencyScore(null);
  tests.push({
    name: 'Null access time → 0.1',
    pass: Math.abs(nullAccess - 0.1) < 0.01
  });

  // Test 2: Validation confidence
  const conf1 = computeValidationScore(0.95);
  tests.push({
    name: 'High confidence (0.95) → 0.95',
    pass: Math.abs(conf1 - 0.95) < 0.01
  });

  const conf2 = computeValidationScore(null);
  tests.push({
    name: 'Null confidence → 0.5 (neutral)',
    pass: Math.abs(conf2 - 0.5) < 0.01
  });

  // Test 3: Hit rate scoring
  const hits1 = computeHitRateScore(50, 100);
  tests.push({
    name: 'Hit rate (50/100) → 0.5',
    pass: Math.abs(hits1 - 0.5) < 0.01
  });

  const hits2 = computeHitRateScore(0);
  tests.push({
    name: 'No hits → 0.0',
    pass: Math.abs(hits2 - 0.0) < 0.01
  });

  // Test 4: Signal blending
  const blend = blendTelemetrySignals(oneHourAgo, 0.9, 50, { recency: 0.4, confidence: 0.4, hitRate: 0.2 });
  tests.push({
    name: 'Signal blending produces score in [0, 1]',
    pass: blend >= 0 && blend <= 1
  });

  const allPass = tests.every(t => t.pass);
  return {
    pass: allPass,
    message: tests.map(t => `${t.pass ? '✓' : '✗'} ${t.name}`).join('\n')
  };
}