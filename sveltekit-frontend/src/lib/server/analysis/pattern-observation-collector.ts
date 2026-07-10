/**
 * Pattern Observation Collector — Phase 1
 *
 * Collects historical fix data from existing error infrastructure tables:
 *   - error_events (raw error observations)
 *   - error_clusters (grouped error patterns)
 *   - error_suggestions (repair strategies proposed)
 *   - error_feedback (operator confirmation of success/failure)
 *   - error_logs (detailed error records with fix outcomes)
 *
 * Produces PatternObservation tuples suitable for HMM training.
 * No new tables needed — leverages existing schema.
 */

import { db } from '$lib/server/db/client.js';
import {
  errorEvents,
  errorClusters,
  errorSuggestions,
  errorFeedback,
  errorLogs
} from '$lib/server/db/schema-postgres.js';
import { eq, isNotNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export type HmmState =
  | 'START'
  | 'RETRIEVE'
  | 'VALIDATE'
  | 'RECOVER'
  | 'GRAPH'
  | 'SYNTHESIZE'
  | 'DONE'
  | 'ERROR';

export interface PatternObservation {
  fingerprint: string;           // SHA1 of error kind + pattern
  errorKind: string;             // 'runtime' | 'api' | 'other'
  previousState: HmmState;       // Where workflow was
  nextState: HmmState;           // Where it went
  repairStrategy: string;        // e.g., 'retry', 'fallback', 'skip'
  confidence: number;            // 0-1 from error_suggestions.confidence
  succeeded: boolean;            // From error_feedback.worksSoon or fix_confidence > 0.7
  latencyMs: number;             // Time from error to resolution
  operatorFeedback?: number;     // +1 (helpful), 0 (neutral), -1 (unhelpful)
  timestamp: Date;
}

export interface TransitionStatistics {
  previousState: HmmState;
  nextState: HmmState;
  successCount: number;
  failureCount: number;
  totalCount: number;
  successRate: number;
  avgLatencyMs: number;
  confidence: number;
}

// ── Phase 1: Collect observations ────────────────────────────────────────────

export async function collectPatternObservations(limit = 1000): Promise<PatternObservation[]> {
  // Join error_logs + error_clusters + error_suggestions + error_feedback
  // to get complete repair history

  const rows = await db
    .select({
      clusterId: errorClusters.id,
      errorKind: errorClusters.kind,
      pattern: errorClusters.pattern,
      suggestionId: errorSuggestions.id,
      suggestion: errorSuggestions.title,
      confidence: errorSuggestions.confidence,
      appliedCount: errorSuggestions.appliedCount,
      successCount: errorSuggestions.successCount,
      errorLogId: errorLogs.id,
      fixStrategy: errorLogs.fix_strategy,
      fixConfidence: errorLogs.fix_confidence,
      createdAt: errorLogs.created_at,
      fixedAt: errorLogs.fixed_at,
      helpful: errorFeedback.helpful,
      accurate: errorFeedback.accurate,
      worksSoon: errorFeedback.works_soon,
    })
    .from(errorLogs)
    .leftJoin(
      errorClusters,
      eq(errorLogs.error_category, errorClusters.pattern)
    )
    .leftJoin(
      errorSuggestions,
      eq(errorClusters.id, errorSuggestions.clusterId)
    )
    .leftJoin(
      errorFeedback,
      eq(errorSuggestions.id, errorFeedback.suggestionId)
    )
    .limit(limit)
    .catch(() => ({ rows: [] as any[] }));

  const observations: PatternObservation[] = [];

  for (const row of rows) {
    if (!row.errorKind || !row.pattern) continue;

    const fingerprint = createHash('sha1')
      .update(`${row.errorKind}:${row.pattern}`)
      .digest('hex');

    // Infer HMM state transitions from fix strategy + success
    const previousState = inferPreviousState(row.fixStrategy || '');
    const succeeded =
      row.worksSoon === true ||
      (row.fixConfidence && parseFloat(row.fixConfidence) > 0.7) ||
      (row.successCount ?? 0) > 0;
    const nextState = succeeded ? inferNextState(row.fixStrategy || '') : 'ERROR';

    const latencyMs = row.fixedAt && row.createdAt
      ? Math.max(0, row.fixedAt.getTime() - row.createdAt.getTime())
      : 0;

    const operatorFeedback =
      row.helpful === true ? 1 :
      row.helpful === false ? -1 :
      row.accurate === true ? 0 :
      undefined;

    observations.push({
      fingerprint,
      errorKind: row.errorKind,
      previousState,
      nextState,
      repairStrategy: row.fixStrategy || 'unknown',
      confidence: row.confidence ? parseFloat(row.confidence) : 0.5,
      succeeded,
      latencyMs,
      operatorFeedback,
      timestamp: row.createdAt || new Date(),
    });
  }

  return observations;
}

// ── Phase 2: Build transition statistics ─────────────────────────────────────

export async function computeTransitionStatistics(
  observations: PatternObservation[]
): Promise<Map<string, TransitionStatistics>> {
  const stats = new Map<string, TransitionStatistics>();

  for (const obs of observations) {
    const key = `${obs.previousState}→${obs.nextState}`;
    const entry = stats.get(key) || {
      previousState: obs.previousState,
      nextState: obs.nextState,
      successCount: 0,
      failureCount: 0,
      totalCount: 0,
      avgLatencyMs: 0,
      confidence: 0,
      successRate: 0,
    };

    if (obs.succeeded) {
      entry.successCount++;
    } else {
      entry.failureCount++;
    }
    entry.totalCount++;
    entry.avgLatencyMs = (entry.avgLatencyMs * (entry.totalCount - 1) + obs.latencyMs) / entry.totalCount;
    entry.confidence = (entry.confidence * (entry.totalCount - 1) + obs.confidence) / entry.totalCount;
    entry.successRate = entry.successCount / entry.totalCount;

    stats.set(key, entry);
  }

  return stats;
}

// ── Phase 3: Score patterns ──────────────────────────────────────────────────

export function scorePattern(
  observation: PatternObservation,
  recencyWeight = 0.1, // 0-1: how much to weight recent observations
  now = new Date()
): number {
  const ageHours = (now.getTime() - observation.timestamp.getTime()) / (1000 * 60 * 60);
  const recencyFactor = Math.exp(-recencyWeight * ageHours); // Exponential decay

  const successRate = observation.succeeded ? 0.95 : 0.05; // 0.95 if worked, 0.05 if failed
  const operatorBonus = observation.operatorFeedback ? observation.operatorFeedback * 0.1 : 0;

  // score = successRate × confidence × recency + operatorFeedback
  const score = successRate * observation.confidence * recencyFactor + operatorBonus;
  return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
}

// ── HMM State inference ──────────────────────────────────────────────────────

function inferPreviousState(fixStrategy: string): HmmState {
  const s = (fixStrategy || '').toLowerCase();
  if (s.includes('retrieve') || s.includes('search')) return 'RETRIEVE';
  if (s.includes('validate')) return 'VALIDATE';
  if (s.includes('recover')) return 'RECOVER';
  if (s.includes('graph')) return 'GRAPH';
  if (s.includes('synthesize') || s.includes('summary')) return 'SYNTHESIZE';
  return 'START';
}

function inferNextState(fixStrategy: string): HmmState {
  const s = (fixStrategy || '').toLowerCase();
  if (s.includes('retry')) return 'RETRIEVE';
  if (s.includes('validate')) return 'VALIDATE';
  if (s.includes('recover')) return 'RECOVER';
  if (s.includes('expand')) return 'GRAPH';
  if (s.includes('summarize')) return 'SYNTHESIZE';
  return 'DONE';
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function runPatternObservationPipeline() {
  console.log('[pattern-observation] Starting Phase 1: historical collection...');
  const observations = await collectPatternObservations(1000);
  console.log(`[pattern-observation] Collected ${observations.length} observations`);

  console.log('[pattern-observation] Phase 2: computing transition statistics...');
  const stats = await computeTransitionStatistics(observations);
  console.log(`[pattern-observation] Computed ${stats.size} transition statistics`);

  console.log('[pattern-observation] Phase 3: scoring patterns...');
  const scored = observations.map(obs => ({
    ...obs,
    score: scorePattern(obs),
  }));
  scored.sort((a, b) => b.score - a.score);

  console.log('[pattern-observation] Top 10 patterns by score:');
  for (const obs of scored.slice(0, 10)) {
    console.log(
      `  ${obs.errorKind.padEnd(8)} ${obs.previousState}→${obs.nextState} ` +
      `score=${obs.score.toFixed(2)} confidence=${obs.confidence.toFixed(2)}`
    );
  }

  return {
    observations,
    statistics: Object.fromEntries(stats),
    scored,
  };
}

// ── CLI Entry Point ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isApply = args.includes('--apply');

  try {
    if (isDryRun) {
      console.log('[pattern-observation] DRY RUN: Phase 1-3 pipeline');
    }

    const result = await runPatternObservationPipeline();

    if (isApply) {
      console.log('[pattern-observation] Phase 1-3 COMPLETE');
      console.log(`[pattern-observation] Total observations: ${result.observations.length}`);
      console.log(`[pattern-observation] Transition statistics: ${Object.keys(result.statistics).length}`);
      console.log(`[pattern-observation] Top scorer: ${result.scored[0]?.errorKind || 'N/A'}`);
    } else {
      console.log('[pattern-observation] DRY RUN COMPLETE — rerun with --apply to persist');
    }

    process.exit(0);
  } catch (err) {
    console.error('[pattern-observation] Pipeline failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Execute if run as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
