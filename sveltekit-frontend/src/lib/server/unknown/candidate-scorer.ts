/**
 * Phase 109 — Stage 2: Candidate Scoring
 * Scores observations across 5 lanes (identity, semantic, source, topology, freshness).
 * Writes candidate packets with composite scores to unknown_packets projection table.
 * Hard fail gates ensure only scored candidates proceed to validation stage.
 */

import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

export const CandidateScoreSchema = z.object({
  unknown_id: z.string().min(1, 'unknown_id required'),
  identity_score: z.number().min(0).max(1, 'identity_score must be 0-1'),
  semantic_score: z.number().min(0).max(1, 'semantic_score must be 0-1'),
  source_score: z.number().min(0).max(1, 'source_score must be 0-1'),
  topology_score: z.number().min(0).max(1, 'topology_score must be 0-1'),
  freshness_score: z.number().min(0).max(1, 'freshness_score must be 0-1'),
  combined_score: z.number().min(0).max(1, 'combined_score must be 0-1'),
});

export type CandidateScore = z.infer<typeof CandidateScoreSchema>;

export interface ScoringResult {
  unknown_id: string;
  observation_id: string;
  status: 'CANDIDATE';
  scores: CandidateScore;
  gate_results: ScoringGateResult[];
  overall_result: 'PASS' | 'FAIL';
  error?: string;
}

export interface ScoringGateResult {
  gate_name: string;
  result: 'PASS' | 'FAIL' | 'WARN';
  description?: string;
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// Candidate Scorer
// ═══════════════════════════════════════════════════════════════════════════

export class CandidateScorer {
  /**
   * Score an observation across 5 lanes (pure scoring, no database I/O).
   * Returns scores and gate results for validation/testing.
   */
  scoreObservationPure(
    unknown_id: string,
    observation_id: string,
    workspace_id: string,
    potential_source_ref: string,
    potential_feature_id?: string,
    evidence_payload?: Record<string, unknown>
  ): ScoringResult {
    const gateResults: ScoringGateResult[] = [];

    try {
      // Gate 1: IDENTITY_SCORE — presence + uniqueness of identity fields
      const identityGate = this.scoreIdentity(
        unknown_id,
        observation_id,
        workspace_id,
        potential_source_ref
      );
      gateResults.push(identityGate);

      // Gate 2: SEMANTIC_SCORE — feature_id presence + payload richness
      const semanticGate = this.scoreSemantic(
        potential_feature_id,
        evidence_payload
      );
      gateResults.push(semanticGate);

      // Gate 3: SOURCE_SCORE — source_ref validity + path structure
      const sourceGate = this.scoreSource(potential_source_ref);
      gateResults.push(sourceGate);

      // Gate 4: TOPOLOGY_SCORE — workspace_id consistency + feature linkage
      const topologyGate = this.scoreTopology(
        workspace_id,
        potential_feature_id,
        potential_source_ref
      );
      gateResults.push(topologyGate);

      // Gate 5: FRESHNESS_SCORE — unknown until ingestion timestamps are wired
      const freshnessGate = this.scoreFreshness();
      gateResults.push(freshnessGate);

      // Aggregate scores into composite
      const scores: CandidateScore = {
        unknown_id,
        identity_score: this.extractScoreFromGate(identityGate),
        semantic_score: this.extractScoreFromGate(semanticGate),
        source_score: this.extractScoreFromGate(sourceGate),
        topology_score: this.extractScoreFromGate(topologyGate),
        freshness_score: this.extractScoreFromGate(freshnessGate),
        combined_score: 0, // computed below
      };

      // Weighted blend: identity(0.25) + semantic(0.20) + source(0.20) + topology(0.20) + freshness(0.15)
      scores.combined_score =
        scores.identity_score * 0.25 +
        scores.semantic_score * 0.2 +
        scores.source_score * 0.2 +
        scores.topology_score * 0.2 +
        scores.freshness_score * 0.15;

      // Validate combined score
      const validationResult = CandidateScoreSchema.safeParse(scores);
      if (!validationResult.success) {
        return {
          unknown_id,
          observation_id,
          status: 'CANDIDATE',
          scores: this.defaultScores(unknown_id),
          gate_results: gateResults,
          overall_result: 'FAIL',
          error: `Score validation failed: ${validationResult.error.message}`,
        };
      }

      return {
        unknown_id,
        observation_id,
        status: 'CANDIDATE',
        scores,
        gate_results: gateResults,
        overall_result: 'PASS',
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      return {
        unknown_id,
        observation_id,
        status: 'CANDIDATE',
        scores: this.defaultScores(unknown_id),
        gate_results: gateResults,
        overall_result: 'FAIL',
        error: `Scoring exception: ${errorMsg}`,
      };
    }
  }

  /**
   * Score an observation and persist to database.
   * Wraps pure scoring + database write in atomic transaction.
   */
  async scoreObservation(
    unknown_id: string,
    observation_id: string,
    workspace_id: string,
    potential_source_ref: string,
    potential_feature_id?: string,
    evidence_payload?: Record<string, unknown>
  ): Promise<ScoringResult> {
    // Get pure scores (no DB I/O)
    const scoringResult = this.scoreObservationPure(
      unknown_id,
      observation_id,
      workspace_id,
      potential_source_ref,
      potential_feature_id,
      evidence_payload
    );

    if (scoringResult.overall_result === 'FAIL') {
      return scoringResult;
    }

    // Write to database if scoring passed
    const writeGate = await this.writeScoresToPostgres(
      unknown_id,
      scoringResult.scores,
      scoringResult.gate_results
    );
    scoringResult.gate_results.push(writeGate);

    if (writeGate.result === 'FAIL') {
      scoringResult.overall_result = 'FAIL';
      scoringResult.error = writeGate.description;
    }

    return scoringResult;
  }

  /**
   * Gate 1: Identity score based on field presence and validity.
   * Weight structural identity fields instead of treating all presence equally.
   */
  private scoreIdentity(
    unknown_id: string,
    observation_id: string,
    workspace_id: string,
    potential_source_ref: string
  ): ScoringGateResult {
    const timestamp = new Date();
    let score = 0;
    let validSignals = 0;

    const unknownIdValid = /^unknown:\d{4}-\d{2}-\d{2}:[A-Za-z0-9_]+:[A-Za-z0-9_-]+$/.test(unknown_id);
    if (unknownIdValid) {
      score += 0.2;
      validSignals += 1;
    }

    if (/^obs:\d{4}-\d{2}-\d{2}:.+/.test(observation_id)) {
      score += 0.2;
      validSignals += 1;
    } else if (observation_id.trim().length > 0) {
      score += 0.1;
    }

    if (workspace_id.trim().length >= 3) {
      score += 0.15;
      validSignals += 1;
    } else if (workspace_id.trim().length > 0) {
      score += 0.05;
    }

    if (potential_source_ref.trim().length > 0) {
      const structuredPath = /[\\/]/.test(potential_source_ref);
      score += structuredPath ? 0.45 : 0.25;
      if (structuredPath) {
        validSignals += 1;
      }
    }

    score = Math.min(1, score);

    return {
      gate_name: 'CANDIDATE_IDENTITY_SCORE',
      result: score >= 0.75 ? 'PASS' : 'WARN',
      description: `Identity score: ${score.toFixed(2)} (${validSignals}/4 critical signals valid)`,
      timestamp,
    };
  }

  /**
   * Gate 2: Semantic score based on feature metadata richness.
   * High score if feature_id present + evidence_payload populated.
   */
  private scoreSemantic(
    potential_feature_id?: string,
    evidence_payload?: Record<string, unknown>
  ): ScoringGateResult {
    const timestamp = new Date();
    let score = 0.5; // baseline

    if (potential_feature_id && potential_feature_id.trim().length > 0) {
      score += 0.25; // feature_id present
    }

    if (evidence_payload && Object.keys(evidence_payload).length > 0) {
      const keyCount = Object.keys(evidence_payload).length;
      score += Math.min(0.25, keyCount * 0.05); // payload richness
    }

    return {
      gate_name: 'CANDIDATE_SEMANTIC_SCORE',
      result: 'PASS',
      description: `Semantic score: ${Math.min(1, score).toFixed(2)} (feature_id=${!!potential_feature_id}, payload_keys=${Object.keys(evidence_payload || {}).length})`,
      timestamp,
    };
  }

  /**
   * Gate 3: Source score based on path structure validity.
   * High score if source_ref follows conventional patterns (src/lib, src/routes, etc.).
   */
  private scoreSource(potential_source_ref: string): ScoringGateResult {
    const timestamp = new Date();
    let score = 0.5; // baseline

    // Bonus for conventional paths
    const patterns = [
      /^src\/lib\//,
      /^src\/routes\//,
      /^scripts\//,
      /^sveltekit-frontend\//,
    ];

    if (patterns.some(p => p.test(potential_source_ref))) {
      score += 0.4;
    }

    // Penalize overly short or malformed paths
    if (potential_source_ref.length < 5) {
      score -= 0.3;
    }

    // Bonus for file extension
    if (/\.(ts|js|svelte|sql)$/.test(potential_source_ref)) {
      score += 0.1;
    }

    return {
      gate_name: 'CANDIDATE_SOURCE_SCORE',
      result: 'PASS',
      description: `Source score: ${Math.min(1, Math.max(0, score)).toFixed(2)} (path="${potential_source_ref}")`,
      timestamp,
    };
  }

  /**
   * Gate 4: Topology score based on workspace/feature linkage.
   * High score if workspace_id and feature_id are both consistent.
   */
  private scoreTopology(
    workspace_id: string,
    potential_feature_id?: string,
    potential_source_ref?: string
  ): ScoringGateResult {
    const timestamp = new Date();
    let score = 0.5; // baseline

    // Workspace consistency (non-empty, reasonable format)
    if (workspace_id && workspace_id.trim().length > 3) {
      score += 0.25;
    }

    // Feature linkage (feature_id present + matches source_ref pattern)
    if (potential_feature_id && potential_feature_id.trim().length > 0) {
      score += 0.15;

      // Bonus if feature_id matches a pattern in source_ref
      if (potential_source_ref?.includes(potential_feature_id.split('.')[0])) {
        score += 0.1;
      }
    }

    return {
      gate_name: 'CANDIDATE_TOPOLOGY_SCORE',
      result: 'PASS',
      description: `Topology score: ${Math.min(1, score).toFixed(2)} (workspace="${workspace_id}", feature_id=${!!potential_feature_id})`,
      timestamp,
    };
  }

  /**
   * Gate 5: Freshness score (time-based).
   * Until ingestion timestamps are persisted, freshness stays neutral instead of
   * pretending every observation is recent.
   */
  private scoreFreshness(): ScoringGateResult {
    const timestamp = new Date();
    return {
      gate_name: 'CANDIDATE_FRESHNESS_SCORE',
      result: 'WARN',
      description: 'Freshness score: 0.50 (ingestion timestamp unavailable)',
      timestamp,
    };
  }

  /**
   * Extract numeric score from gate description (parse "X.XX" from description).
   */
  private extractScoreFromGate(gate: ScoringGateResult): number {
    const match = gate.description?.match(/(\d+\.\d+)/);
    return match ? parseFloat(match[1]) : 0.5;
  }

  /**
   * Default scores when scoring fails.
   */
  private defaultScores(unknown_id: string): CandidateScore {
    return {
      unknown_id,
      identity_score: 0,
      semantic_score: 0,
      source_score: 0,
      topology_score: 0,
      freshness_score: 0,
      combined_score: 0,
    };
  }

  /**
   * Gate 6: Write scores to Postgres unknown_packets table + ledger entry.
   * Atomic transaction ensures consistency.
   */
  private async writeScoresToPostgres(
    unknown_id: string,
    scores: CandidateScore,
    gateResults: ScoringGateResult[]
  ): Promise<ScoringGateResult> {
    const timestamp = new Date();
    const ledger_id = `ledger:${unknown_id}:${Date.now()}`;

    try {
      // Atomic transaction: update packets + insert ledger or both fail
      await db.execute(sql`BEGIN`);

      try {
        // Update unknown_packets with scores
        await db.execute(sql`
          UPDATE unknown_packets
          SET
            identity_score = ${scores.identity_score},
            semantic_score = ${scores.semantic_score},
            source_score = ${scores.source_score},
            topology_score = ${scores.topology_score},
            freshness_score = ${scores.freshness_score},
            combined_score = ${scores.combined_score},
            status = 'CANDIDATE',
            scored_at = NOW(),
            updated_at = NOW()
          WHERE unknown_id = ${unknown_id}
        `);

        // Insert ledger entry
        const evidence_summary = {
          gates_passed: gateResults.filter(g => g.result === 'PASS').length,
          gates_warned: gateResults.filter(g => g.result === 'WARN').length,
          gates_failed: gateResults.filter(g => g.result === 'FAIL').length,
          gate_details: gateResults,
          scores,
        };

        await db.execute(sql`
          INSERT INTO unknown_resolution_ledger (
            ledger_id,
            unknown_id,
            stage,
            gate_name,
            gate_result,
            check_description,
            check_timestamp,
            evidence_summary
          ) VALUES (
            ${ledger_id},
            ${unknown_id},
            'CANDIDATE',
            'CANDIDATE_SCORING_COMPLETE',
            'PASS',
            'Stage 2 candidate scoring gates completed',
            NOW(),
            ${JSON.stringify(evidence_summary)}
          )
        `);

        // Commit transaction
        await db.execute(sql`COMMIT`);

        return {
          gate_name: 'CANDIDATE_WRITE_SCORES_SUCCESS',
          result: 'PASS',
          description: `Scores written: unknown_id=${unknown_id}, combined_score=${scores.combined_score.toFixed(2)}`,
          timestamp,
        };
      } catch (innerErr) {
        // Rollback on inner error
        await db.execute(sql`ROLLBACK`);
        throw innerErr;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown error';
      return {
        gate_name: 'CANDIDATE_WRITE_SCORES_SUCCESS',
        result: 'FAIL',
        description: `Write failed: ${errMsg}`,
        timestamp,
      };
    }
  }

  /**
   * Batch score multiple observations.
   */
  async scoreBatch(observations: Array<{
    unknown_id: string;
    observation_id: string;
    workspace_id: string;
    potential_source_ref: string;
    potential_feature_id?: string;
    evidence_payload?: Record<string, unknown>;
  }>): Promise<ScoringResult[]> {
    const results: ScoringResult[] = [];
    for (const obs of observations) {
      const result = await this.scoreObservation(
        obs.unknown_id,
        obs.observation_id,
        obs.workspace_id,
        obs.potential_source_ref,
        obs.potential_feature_id,
        obs.evidence_payload
      );
      results.push(result);
    }
    return results;
  }

  /**
   * Get statistics on scoring results.
   */
  static getStats(results: ScoringResult[]) {
    return {
      total: results.length,
      passed: results.filter(r => r.overall_result === 'PASS').length,
      failed: results.filter(r => r.overall_result === 'FAIL').length,
      average_combined_score:
        results.reduce((sum, r) => sum + r.scores.combined_score, 0) / results.length || 0,
      success_rate: results.length > 0
        ? (results.filter(r => r.overall_result === 'PASS').length / results.length) * 100
        : 0,
    };
  }
}

export default new CandidateScorer();
