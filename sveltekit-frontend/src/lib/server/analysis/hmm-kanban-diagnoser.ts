import { getRedis } from '$lib/server/redis.js';
import * as fs from 'fs';
import * as path from 'path';

// Hidden States
export type HMMHiddenState = 'S1' | 'S2' | 'S3' | 'S4';
export const HIDDEN_STATES: HMMHiddenState[] = ['S1', 'S2', 'S3', 'S4'];

export const STATE_LABELS: Record<HMMHiddenState, string> = {
  S1: 'Healthy Progression',
  S2: 'Relational/Schema Bloat',
  S3: 'Regression Trap',
  S4: 'Stale / Abandoned'
};

// Observable Emissions
export type HMMObservation = 'TSC_ERR' | 'MQ_NACK' | 'CACHE_HIT_STALE' | 'GRAPH_HOTSPOT' | 'MQ_ACK' | 'COMMIT' | 'other';
export const OBSERVATIONS: HMMObservation[] = [
  'TSC_ERR',
  'MQ_NACK',
  'CACHE_HIT_STALE',
  'GRAPH_HOTSPOT',
  'other' // covers MQ_ACK, COMMIT, etc.
];

// Mapping helper from string telemetry event to index
export function getObservationIndex(event: string): number {
  const norm = event.trim().toUpperCase();
  if (norm === 'TSC_ERR') return 0;
  if (norm === 'MQ_NACK') return 1;
  if (norm === 'CACHE_HIT_STALE') return 2;
  if (norm === 'GRAPH_HOTSPOT') return 3;
  return 4; // other
}

// ─── HMM Probability Matrices ───────────────────────────────────────────────

// Initial state distribution: S1 is highly likely initially
const PI = [0.60, 0.15, 0.10, 0.15];

// State Transition Matrix A
// A[i][j] = P(Q_{t+1} = S_j | Q_t = S_i)
const A = [
  // S1 (Healthy)
  [0.70, 0.10, 0.10, 0.10],
  // S2 (Schema Bloat)
  [0.15, 0.60, 0.15, 0.10],
  // S3 (Regression Trap)
  [0.15, 0.05, 0.70, 0.10],
  // S4 (Stale)
  [0.10, 0.05, 0.05, 0.80]
];

// Emission Probability Matrix B
// B[j][k] = P(O_t = V_k | Q_t = S_j)
const B = [
  // S1: TSC_ERR: 0.1, MQ_NACK: 0.05, CACHE_HIT_STALE: 0.1, GRAPH_HOTSPOT: 0.05, other: 0.7
  [0.10, 0.05, 0.10, 0.05, 0.70],
  // S2: TSC_ERR: 0.1, MQ_NACK: 0.05, CACHE_HIT_STALE: 0.6, GRAPH_HOTSPOT: 0.15, other: 0.1
  [0.10, 0.05, 0.60, 0.15, 0.10],
  // S3: TSC_ERR: 0.5, MQ_NACK: 0.3, CACHE_HIT_STALE: 0.05, GRAPH_HOTSPOT: 0.1, other: 0.05
  [0.50, 0.30, 0.05, 0.10, 0.05],
  // S4: TSC_ERR: 0.05, MQ_NACK: 0.05, CACHE_HIT_STALE: 0.05, GRAPH_HOTSPOT: 0.05, other: 0.8
  [0.05, 0.05, 0.05, 0.05, 0.80]
];

// Log-probability versions for underflow-safe math
const logPi = PI.map(p => Math.log(Math.max(p, 1e-10)));
const logA = A.map(row => row.map(p => Math.log(Math.max(p, 1e-10))));
const logB = B.map(row => row.map(p => Math.log(Math.max(p, 1e-10))));

// ─── Viterbi Decoder ─────────────────────────────────────────────────────────

export function diagnoseSpecState(observations: number[]): number[] {
  const N = logA.length;
  const T = observations.length;

  if (T === 0) return [];

  // viterbi[state][time]
  const viterbi = Array.from({ length: N }, () => new Array(T).fill(-Infinity));
  const backpointer = Array.from({ length: N }, () => new Array(T).fill(0));

  // Base case (t = 0)
  for (let s = 0; s < N; s++) {
    viterbi[s][0] = logPi[s] + logB[s][observations[0]];
    backpointer[s][0] = 0;
  }

  // Forward pass
  for (let t = 1; t < T; t++) {
    const obsIndex = observations[t];
    for (let s = 0; s < N; s++) {
      let maxLogProb = -Infinity;
      let bestState = 0;

      for (let prevS = 0; prevS < N; prevS++) {
        const logProb = viterbi[prevS][t - 1] + logA[prevS][s];
        if (logProb > maxLogProb) {
          maxLogProb = logProb;
          bestState = prevS;
        }
      }

      viterbi[s][t] = maxLogProb + logB[s][obsIndex];
      backpointer[s][t] = bestState;
    }
  }

  // Find ending best state
  let maxFinalLogProb = -Infinity;
  let pseudoState = 0;
  for (let s = 0; s < N; s++) {
    if (viterbi[s][T - 1] > maxFinalLogProb) {
      maxFinalLogProb = viterbi[s][T - 1];
      pseudoState = s;
    }
  }

  // Backtracking path
  const path: number[] = [pseudoState];
  for (let t = T - 1; t > 0; t--) {
    pseudoState = backpointer[pseudoState][t];
    path.unshift(pseudoState);
  }

  return path;
}

// ─── Recommendation Cards ───────────────────────────────────────────────────

export interface RecommendationCard {
  state: HMMHiddenState;
  stateLabel: string;
  recommendation: string;
  timestamp: string;
  triggerCondition: string;
}

export function getRecommendationForState(state: HMMHiddenState): RecommendationCard {
  const timestamp = new Date().toISOString();
  switch (state) {
    case 'S2':
      return {
        state: 'S2',
        stateLabel: STATE_LABELS.S2,
        recommendation: 'Detecting frequent database modifications. Run npm run graphify:authority to update Postgres knowledge maps before altering schemas again.',
        triggerCondition: 'High emission of Drizzle migration steps mixed with low Qdrant index hits.',
        timestamp
      };
    case 'S3':
      return {
        state: 'S3',
        stateLabel: STATE_LABELS.S3,
        recommendation: 'Your CRUD loop has generated a cyclic loop. Isolate the handler using a TypeScript Service Worker or verify your Zod validation rules.',
        triggerCondition: 'Sequence of multiple tsc failures combined with cyclic import flags.',
        timestamp
      };
    case 'S4':
      return {
        state: 'S4',
        stateLabel: STATE_LABELS.S4,
        recommendation: "This spec card has no active vector footprint. Evicting model parameters or moving card to 'Backlog'.",
        triggerCondition: 'Zero updates in Valkey cache across a 24-hour TTL window.',
        timestamp
      };
    case 'S1':
    default:
      return {
        state: 'S1',
        stateLabel: STATE_LABELS.S1,
        recommendation: 'Development loop is healthy. Normal progression.',
        triggerCondition: 'Normal CRUD loop generation/testing.',
        timestamp
      };
  }
}

// ─── Valkey / Redis Integration ──────────────────────────────────────────────

const MAX_WINDOW_SIZE = 15;
const TELEMETRY_KEY_PREFIX = 'kanban:telemetry:';
const RECO_KEY_PREFIX = 'kanban:recommendation:';
const LOG_FILE_PATH = path.resolve('docs/reports/indexing-activities.log');

function writeToActivitiesLog(message: string) {
  try {
    const dir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const logLine = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(LOG_FILE_PATH, logLine, 'utf8');
  } catch (err) {
    console.error('[HMM Diagnoser] Failed to append to log file:', err);
  }
}

export async function processTelemetryEvent(specId: string, event: string): Promise<{
  path: HMMHiddenState[];
  recommendation: RecommendationCard;
}> {
  const redis = getRedis();
  const telKey = `${TELEMETRY_KEY_PREFIX}${specId}`;
  const recKey = `${RECO_KEY_PREFIX}${specId}`;

  // 1. Push event to list and slice to keep sliding window
  const pipeline = redis.pipeline();
  pipeline.rpush(telKey, event);
  pipeline.ltrim(telKey, -MAX_WINDOW_SIZE, -1);
  pipeline.lrange(telKey, 0, -1);
  const results = await pipeline.exec();

  if (!results) {
    throw new Error('Redis transaction execution returned null');
  }

  // Extract the list of current telemetry events
  const [, , lrangeResult] = results;
  if (lrangeResult[0]) {
    throw lrangeResult[0]; // Error from lrange
  }
  const events = lrangeResult[1] as string[];

  // 2. Convert event strings to indices
  const obsIndices = events.map(getObservationIndex);

  // 3. Run Viterbi
  const stateIndices = diagnoseSpecState(obsIndices);
  const pathStates = stateIndices.map(idx => HIDDEN_STATES[idx]);
  const finalState = pathStates[pathStates.length - 1] ?? 'S1';

  // 4. Generate recommendation
  const recommendation = getRecommendationForState(finalState);

  // 5. Cache recommendation and final state in Valkey with 24h TTL
  const payload = {
    specId,
    events,
    path: pathStates,
    recommendation
  };
  await redis.set(recKey, JSON.stringify(payload), 'EX', 24 * 3600);

  // 6. Log activity (zero hidden thoughts policy)
  writeToActivitiesLog(
    `HMM diagnosis executed for spec_id '${specId}'. Telemetry sequence length: ${events.length}. Final State: ${finalState} (${STATE_LABELS[finalState]}).`
  );

  return {
    path: pathStates,
    recommendation
  };
}

export async function getSpecDiagnosis(specId: string): Promise<{
  specId: string;
  events: string[];
  path: HMMHiddenState[];
  recommendation: RecommendationCard | null;
} | null> {
  const redis = getRedis();
  const recKey = `${RECO_KEY_PREFIX}${specId}`;
  const raw = await redis.get(recKey);
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function getAllDiagnosedSpecs(): Promise<string[]> {
  const redis = getRedis();
  const keys = await redis.keys(`${RECO_KEY_PREFIX}*`);
  return keys.map(k => k.replace(RECO_KEY_PREFIX, ''));
}
