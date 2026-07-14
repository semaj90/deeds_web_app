import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import type { RetrievalPromotionDecision } from '$lib/runtime-cache/contracts';
import { RetrievalPromotionDecisionSchema, validatePacketIdentity } from '$lib/runtime-cache/contracts';

/**
 * Record Promotion Decision — Winner/Loser Tracking
 *
 * Called after ranking, before cache write.
 * Tracks destination (browser-l1, valkey-hot, valkey-warm, analytics-only, cold-archive).
 */

export async function recordPromotionDecision(
  packet: any,
  traceId: string,
  rank: number,
  score: number,
  destination: string,
  validation: { passed: boolean; reasons: string[] }
): Promise<RetrievalPromotionDecision | null> {
  try {
    const selected =
      destination !== 'analytics-only' &&
      destination !== 'cold-archive';

    const decision: RetrievalPromotionDecision = {
      traceId,
      packetKey: packet.packet_key,
      rank,
      finalScore: score,
      selected,

      destination: destination as any,
      reasonCodes: validation.reasons,
      timestamp: new Date().toISOString(),
      validationGatePassed: validation.passed
    };

    // Validate
    const validated = RetrievalPromotionDecisionSchema.parse(decision);

    // Persist to Postgres
    try {
      await db.execute(
        sql`
          INSERT INTO retrieval_promotion_decisions
            (trace_id, packet_key, rank, final_score, selected, destination, validation_gate_passed, reason_codes)
          VALUES
            (${validated.traceId}, ${validated.packetKey}, ${validated.rank}, ${validated.finalScore}, ${validated.selected}, ${validated.destination}, ${validated.validationGatePassed}, ${validated.reasonCodes})
        `
      );
    } catch (err) {
      console.warn('Failed to persist promotion decision:', err);
      // Non-blocking — telemetry is logged even if Postgres write fails
    }

    // Telemetry
    console.log(`[PROMOTION] ${packet.packet_key} → ${destination} (score=${score.toFixed(3)}, gate=${validation.passed})`);

    return validated;
  } catch (err) {
    console.error('Failed to record promotion decision:', err);
    return null;
  }
}

/**
 * Promotion Policy — Decision Tree
 *
 * Input: packet + rank + score + validation gates
 * Output: destination (browser-l1 | valkey-hot | valkey-warm | analytics-only | cold-archive)
 */

export function determinePromotionDestination(options: {
  packet: any;
  rank: number;
  score: number;
  validationPassed: boolean;
}): string {
  const { packet, rank, score, validationPassed } = options;

  // Hard fail: identity validation
  if (!validationPassed) {
    return 'analytics-only'; // Telemetry only, no cache
  }

  // Top-3 winners → hot cache
  if (rank <= 2 && score >= 0.85) {
    return 'browser-l1';
  }

  // Top-10 → warm cache
  if (rank <= 9 && score >= 0.70) {
    return 'valkey-hot';
  }

  // Top-100 → warm tier (long TTL)
  if (rank <= 99 && score >= 0.50) {
    return 'valkey-warm';
  }

  // Near-winners: telemetry only
  if (score >= 0.30) {
    return 'analytics-only';
  }

  // Losers: cold archive
  return 'cold-archive';
}

/**
 * Winner vs Near-Winner Distinction
 *
 * Winner: promoted to cache (destinations 1-2)
 * Near-winner: telemetry only (destination 4, analytics-only)
 * Loser: cold archive (destination 5, cold-archive)
 */

export function classifyRetrievalOutcome(
  destination: string
): 'winner' | 'near-winner' | 'loser' {
  if (destination === 'browser-l1' || destination === 'valkey-hot' || destination === 'valkey-warm') {
    return 'winner';
  }
  if (destination === 'analytics-only') {
    return 'near-winner';
  }
  return 'loser';
}

/**
 * Validate Promotion Candidate
 *
 * Checks: packet_key, source_ref, feature_id, content_hash
 */

export function validatePromotionCandidate(packet: any): {
  passed: boolean;
  reasonCodes: string[];
} {
  const validation = validatePacketIdentity(packet);

  const reasonCodes: string[] = [];
  if (validation.passed) {
    reasonCodes.push('identity_validated');
  } else {
    reasonCodes.push(...validation.failed);
  }

  if (packet.rank && packet.rank <= 10) {
    reasonCodes.push('top_10_rank');
  }

  if (packet.score && packet.score >= 0.85) {
    reasonCodes.push('high_confidence_score');
  }

  return {
    passed: validation.passed,
    reasonCodes
  };
}
