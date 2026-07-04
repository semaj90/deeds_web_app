/**
 * HMM Error Classifier
 *
 * Classifies error observation sequences into hidden error states.
 * CPU-only — no GPU, no LLM, no retrieval ranking.
 *
 * Flow:
 *   error_signal_stream rows → normalize observations → Viterbi decode
 *   → emit ErrorState + confidence + suggestedAction
 *   → caller writes result to error_cluster_groups / error_suggestion_states
 *
 * Hard rules:
 * - HMM classifies sequences only — it does NOT do retrieval ranking
 * - Always join on (error_class, model_name) pair — never error_class alone
 * - packet_key is immutable — classifier selects existing packets, never mutates
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';

// ── Types ────────────────────────────────────────────────────────────────────

export type ErrorState =
  | 'schema_mismatch'
  | 'missing_dependency'
  | 'stale_cache'
  | 'retrieval_miss'
  | 'worker_timeout'
  | 'codec_failure'
  | 'unknown';

export type ErrorObservation =
  | 'SQL_RELATION_MISSING'
  | 'COLUMN_MISSING'
  | 'IMPORT_FAIL'
  | 'HTTP_404'
  | 'HTTP_500'
  | 'TIMEOUT'
  | 'EMPTY_RESULT'
  | 'DECODE_FAIL'
  | 'TYPECHECK_FAIL';

export interface ClassificationResult {
  state: ErrorState;
  confidence: number;
  reason: string;
  suggestedAction: string;
}

export interface ErrorSignalRow {
  packet_key: string;
  task_id: string;
  error_class: string;
  model_name: string;
  evidence: Record<string, unknown>;
  ingested_at: Date;
}

// ── Emission matrix ───────────────────────────────────────────────────────────
// P(observation | hidden_state) — rows = states, cols = observations
// Values are log-probabilities approximated as weights (not normalized — Viterbi
// uses relative ordering, not absolute probability).

const STATES: ErrorState[] = [
  'schema_mismatch',
  'missing_dependency',
  'stale_cache',
  'retrieval_miss',
  'worker_timeout',
  'codec_failure',
  'unknown',
];

const OBSERVATIONS: ErrorObservation[] = [
  'SQL_RELATION_MISSING',
  'COLUMN_MISSING',
  'IMPORT_FAIL',
  'HTTP_404',
  'HTTP_500',
  'TIMEOUT',
  'EMPTY_RESULT',
  'DECODE_FAIL',
  'TYPECHECK_FAIL',
];

// emission[state][observation] = weight
const EMISSION: Record<ErrorState, Partial<Record<ErrorObservation, number>>> = {
  schema_mismatch:    { SQL_RELATION_MISSING: 0.9, COLUMN_MISSING: 0.8, HTTP_500: 0.3, TYPECHECK_FAIL: 0.4 },
  missing_dependency: { IMPORT_FAIL: 0.9, HTTP_404: 0.5, TYPECHECK_FAIL: 0.6 },
  stale_cache:        { EMPTY_RESULT: 0.7, HTTP_404: 0.4, STALE_CACHE: 0.9 } as never,
  retrieval_miss:     { EMPTY_RESULT: 0.9, HTTP_404: 0.6, HTTP_500: 0.2 },
  worker_timeout:     { TIMEOUT: 0.95, HTTP_500: 0.4, EMPTY_RESULT: 0.3 },
  codec_failure:      { DECODE_FAIL: 0.95, HTTP_500: 0.3, TYPECHECK_FAIL: 0.5 },
  unknown:            { HTTP_500: 0.3, EMPTY_RESULT: 0.2, TIMEOUT: 0.2 },
};

// Prior weights (initial state distribution)
const PRIOR: Record<ErrorState, number> = {
  schema_mismatch:    0.20,
  missing_dependency: 0.15,
  stale_cache:        0.15,
  retrieval_miss:     0.20,
  worker_timeout:     0.15,
  codec_failure:      0.10,
  unknown:            0.05,
};

// Suggested actions per hidden state
const SUGGESTED_ACTION: Record<ErrorState, string> = {
  schema_mismatch:    'Run drizzle-kit introspect and verify table exists; check CREATE TABLE migration was applied',
  missing_dependency: 'Verify npm install ran in sveltekit-frontend; check $lib alias resolution',
  stale_cache:        'Invalidate BitFrost keys for this packet_key; run cache warm after Postgres read',
  retrieval_miss:     'Check Qdrant collection count and Postgres codebase_chunk_index population',
  worker_timeout:     'Increase AbortSignal.timeout; check Gemma4 :8090 health; reduce batch size',
  codec_failure:      'Verify @msgpack/msgpack encode/decode round-trip; check BYTEA column integrity',
  unknown:            'Inspect error_signal_stream.evidence for raw error text; escalate to operator',
};

// ── Observation normalization ─────────────────────────────────────────────────

const OBS_PATTERNS: Array<{ pattern: RegExp | string; obs: ErrorObservation }> = [
  { pattern: /relation.*does not exist|table.*not found/i,      obs: 'SQL_RELATION_MISSING' },
  { pattern: /column.*does not exist/i,                          obs: 'COLUMN_MISSING' },
  { pattern: /cannot find module|import.*fail|ERR_MODULE/i,      obs: 'IMPORT_FAIL' },
  { pattern: /404|not found/i,                                   obs: 'HTTP_404' },
  { pattern: /500|internal server error/i,                       obs: 'HTTP_500' },
  { pattern: /timeout|timed out|ETIMEDOUT|AbortError/i,          obs: 'TIMEOUT' },
  { pattern: /empty result|no rows|0 rows|zero results/i,        obs: 'EMPTY_RESULT' },
  { pattern: /decode.*fail|msgpack|BYTEA|binary.*invalid/i,      obs: 'DECODE_FAIL' },
  { pattern: /TypeScript|TS\d{4}|type.*error|svelte-check/i,     obs: 'TYPECHECK_FAIL' },
];

export function normalizeObservation(rawError: string): ErrorObservation | null {
  for (const { pattern, obs } of OBS_PATTERNS) {
    if (typeof pattern === 'string' ? rawError.includes(pattern) : pattern.test(rawError)) {
      return obs;
    }
  }
  return null;
}

export function normalizeSignals(signals: ErrorSignalRow[]): ErrorObservation[] {
  const observations: ErrorObservation[] = [];
  for (const sig of signals) {
    const raw =
      (sig.evidence?.message as string) ??
      (sig.evidence?.error as string) ??
      sig.error_class ??
      '';
    const obs = normalizeObservation(raw);
    if (obs) observations.push(obs);
  }
  return observations;
}

// ── Viterbi decoder ───────────────────────────────────────────────────────────

export function viterbiDecode(observations: ErrorObservation[]): {
  state: ErrorState;
  score: number;
} {
  if (!observations.length) return { state: 'unknown', score: 0 };

  // Initialize with prior × first emission
  let scores: Record<ErrorState, number> = {} as never;
  for (const state of STATES) {
    const emitWeight = EMISSION[state][observations[0]] ?? 0.01;
    scores[state] = PRIOR[state] * emitWeight;
  }

  // Forward pass (simplified — no backpointer needed, just max accumulation)
  for (let t = 1; t < observations.length; t++) {
    const next: Record<ErrorState, number> = {} as never;
    for (const state of STATES) {
      const emitWeight = EMISSION[state][observations[t]] ?? 0.01;
      next[state] = scores[state] * emitWeight;
    }
    scores = next;
  }

  // Pick argmax
  let bestState: ErrorState = 'unknown';
  let bestScore = -1;
  for (const state of STATES) {
    if (scores[state] > bestScore) {
      bestScore = scores[state];
      bestState = state;
    }
  }

  // Normalize confidence to [0, 1] using softmax-like ratio
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = total > 0 ? bestScore / total : 0;

  return { state: bestState, score: confidence };
}

// ── Main classification entry point ──────────────────────────────────────────

export function classifyObservations(observations: ErrorObservation[]): ClassificationResult {
  const { state, score } = viterbiDecode(observations);

  const obsLabel = observations.slice(0, 3).join(', ') || 'no observations';
  const reason =
    observations.length === 0
      ? 'No normalized observations from signal sequence'
      : `${observations.length} observation(s): ${obsLabel} → decoded state: ${state}`;

  return {
    state,
    confidence: parseFloat(score.toFixed(4)),
    reason,
    suggestedAction: SUGGESTED_ACTION[state],
  };
}

/**
 * Load recent signals for a (error_class, model_name) pair from Postgres,
 * normalize them, run Viterbi, and return the classification.
 */
export async function classifyErrorCluster(
  errorClass: string,
  modelName: string,
  windowMinutes = 15
): Promise<ClassificationResult> {
  const rows = await db.execute(sql`
    SELECT packet_key, task_id, error_class, model_name, evidence, ingested_at
    FROM error_signal_stream
    WHERE error_class = ${errorClass}
      AND model_name  = ${modelName}
      AND ingested_at > NOW() - (${windowMinutes} || ' minutes')::interval
    ORDER BY ingested_at ASC
    LIMIT 100
  `);

  const signals = (rows.rows ?? []) as ErrorSignalRow[];
  const observations = normalizeSignals(signals);
  return classifyObservations(observations);
}

// ── Cluster group persistence ─────────────────────────────────────────────────

export async function writeClusterClassification(
  errorClass: string,
  modelName: string,
  taskId: string,
  packetKeys: string[],
  classification: ClassificationResult
): Promise<void> {
  await db.execute(sql`
    INSERT INTO error_cluster_groups
      (error_class, model_name, task_id, packet_keys, failure_count, last_seen,
       recovery_packet_key, recovery_confidence)
    VALUES
      (${errorClass}, ${modelName}, ${taskId}, ${packetKeys},
       ${packetKeys.length}, NOW(),
       ${classification.suggestedAction}, ${classification.confidence})
    ON CONFLICT (error_class, model_name, task_id) DO UPDATE SET
      packet_keys         = EXCLUDED.packet_keys,
      failure_count       = error_cluster_groups.failure_count + ${packetKeys.length},
      last_seen           = NOW(),
      recovery_packet_key = EXCLUDED.recovery_packet_key,
      recovery_confidence = EXCLUDED.recovery_confidence
  `);
}
