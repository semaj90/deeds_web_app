/**
 * HMM Legal Section Classifier — TypeScript port of deeds_labs/services/hmm-topic-service/hmm_legal_model.py
 *
 * Viterbi decoder over 7 legal document states.
 * Runs inline (no HTTP round-trip, no Docker dependency) in ~0.1–1ms per chunk.
 *
 * Output feeds:
 *   hmmStateToGlyphSection(prediction.primaryState) → GlyphRecord.semantic.section
 *   prediction.confidence                           → GlyphRecord.semantic.dominantState
 *
 * States mirror LegalHMM.STATES from the Python model exactly so
 * hmmStateToGlyphSection() maps them without modification.
 */

export type HMMRawState =
  | 'PARTIES'
  | 'JURISDICTION'
  | 'FACTS'
  | 'LEGAL_AUTHORITY'
  | 'CLAIMS'
  | 'PRAYER'
  | 'HOLDING';

export interface HMMPrediction {
  /** Most probable state (mode of Viterbi path) */
  primaryState: HMMRawState;
  /** exp(max viterbi log-prob) — 0–1 confidence */
  confidence: number;
  /** Normalized state frequency over the Viterbi path */
  stateProbabilities: Record<HMMRawState, number>;
  /** Full Viterbi state path (one label per token) */
  stateSequence: HMMRawState[];
}

// ─── Transition matrix (mirrors Python TRANSITIONS exactly) ──────────────────

const TRANSITIONS: Record<HMMRawState, Partial<Record<HMMRawState, number>>> = {
  PARTIES:        { JURISDICTION: 0.9, FACTS: 0.1 },
  JURISDICTION:   { FACTS: 0.8, LEGAL_AUTHORITY: 0.2 },
  FACTS:          { LEGAL_AUTHORITY: 0.7, CLAIMS: 0.3 },
  LEGAL_AUTHORITY:{ CLAIMS: 0.8, FACTS: 0.2 },
  CLAIMS:         { PRAYER: 0.6, HOLDING: 0.4 },
  PRAYER:         { HOLDING: 0.9, PARTIES: 0.1 },
  HOLDING:        { PARTIES: 0.1, HOLDING: 0.9 },
};

// ─── Emission probabilities (mirrors Python EMISSIONS exactly) ───────────────

const EMISSIONS: Record<HMMRawState, Record<string, number>> = {
  PARTIES: {
    plaintiff: 0.15, defendant: 0.15, appellant: 0.1,
    respondent: 0.1, petitioner: 0.1, v: 0.2,
    versus: 0.15, party: 0.05,
  },
  JURISDICTION: {
    jurisdiction: 0.2, venue: 0.15, court: 0.15,
    district: 0.1, federal: 0.1, state: 0.1,
    competent: 0.05, proper: 0.05,
  },
  FACTS: {
    occurred: 0.1, happened: 0.1, alleged: 0.15,
    facts: 0.1, incident: 0.1, event: 0.1,
    date: 0.1, time: 0.05, place: 0.05,
  },
  LEGAL_AUTHORITY: {
    statute: 0.15, regulation: 0.15, constitution: 0.1,
    law: 0.15, code: 0.1, section: 0.1,
    usc: 0.1, precedent: 0.05,
  },
  CLAIMS: {
    claim: 0.2, cause: 0.15, action: 0.15,
    violation: 0.15, breach: 0.1, negligence: 0.1,
    damages: 0.05,
  },
  PRAYER: {
    prayer: 0.2, relief: 0.2, damages: 0.15,
    injunction: 0.15, declaratory: 0.1, request: 0.05,
  },
  HOLDING: {
    held: 0.2, holding: 0.2, ruled: 0.15,
    affirmed: 0.1, reversed: 0.1, remanded: 0.1,
    therefore: 0.05,
  },
};

const STATES: HMMRawState[] = [
  'PARTIES', 'JURISDICTION', 'FACTS', 'LEGAL_AUTHORITY', 'CLAIMS', 'PRAYER', 'HOLDING',
];
const N = STATES.length;
const DEFAULT_EMISSION = 0.01;
const DEFAULT_TRANSITION = 1 / N;
const LOG_MIN = -1e10; // stand-in for -Infinity to avoid NaN propagation

// ─── Helpers ─────────────────────────────────────────────────────────────────

function logEmit(state: HMMRawState, word: string): number {
  return Math.log((EMISSIONS[state][word] ?? DEFAULT_EMISSION) + 1e-10);
}

function logTrans(from: HMMRawState, to: HMMRawState): number {
  return Math.log((TRANSITIONS[from][to] ?? DEFAULT_TRANSITION) + 1e-10);
}

/** Tokenize text to lowercase word tokens (mirrors Python re.findall(r'\b\w+\b')) */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/\b\w+\b/g) ?? []);
}

// ─── Viterbi ─────────────────────────────────────────────────────────────────

function viterbi(tokens: string[]): { path: HMMRawState[]; logProb: number } {
  if (tokens.length === 0) {
    return { path: [], logProb: LOG_MIN };
  }

  const T = tokens.length;
  // viterbi[i][t] = best log-prob ending in state i at time t
  const v: number[][] = Array.from({ length: N }, () => new Array<number>(T).fill(LOG_MIN));
  // backpointer[i][t] = best predecessor state index for state i at time t
  const bp: number[][] = Array.from({ length: N }, () => new Array<number>(T).fill(0));

  // t = 0: no prior, start uniform
  for (let i = 0; i < N; i++) {
    v[i][0] = logEmit(STATES[i], tokens[0]);
  }

  // Forward
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      const emitLogP = logEmit(STATES[j], tokens[t]);
      let best = LOG_MIN;
      let bestIdx = 0;
      for (let i = 0; i < N; i++) {
        const p = v[i][t - 1] + logTrans(STATES[i], STATES[j]);
        if (p > best) { best = p; bestIdx = i; }
      }
      v[j][t] = best + emitLogP;
      bp[j][t] = bestIdx;
    }
  }

  // Backtrack
  let last = 0;
  let bestFinal = LOG_MIN;
  for (let i = 0; i < N; i++) {
    if (v[i][T - 1] > bestFinal) { bestFinal = v[i][T - 1]; last = i; }
  }

  const path: HMMRawState[] = new Array<HMMRawState>(T);
  path[T - 1] = STATES[last];
  for (let t = T - 1; t > 0; t--) {
    last = bp[last][t];
    path[t - 1] = STATES[last];
  }

  return { path, logProb: bestFinal };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify a single text chunk into its most likely legal section.
 * Returns 'FACTS' with confidence 0 on empty input.
 */
export function predictChunk(text: string): HMMPrediction {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    const zeroProbabilities = Object.fromEntries(
      STATES.map(s => [s, 0])
    ) as Record<HMMRawState, number>;
    zeroProbabilities['FACTS'] = 1;
    return { primaryState: 'FACTS', confidence: 0, stateProbabilities: zeroProbabilities, stateSequence: [] };
  }

  const { path, logProb } = viterbi(tokens);

  // Count state frequencies for distribution
  const counts = Object.fromEntries(STATES.map(s => [s, 0])) as Record<HMMRawState, number>;
  for (const s of path) counts[s]++;
  const stateProbabilities = Object.fromEntries(
    STATES.map(s => [s, counts[s] / path.length])
  ) as Record<HMMRawState, number>;

  // Mode state = primary
  const primaryState = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as HMMRawState;
  const confidence = Math.min(1, Math.exp(logProb / Math.max(1, tokens.length)));

  return { primaryState, confidence, stateProbabilities, stateSequence: path };
}

/**
 * Batch-classify multiple text chunks.
 * Safe to call with empty array.
 */
export function predictChunks(texts: string[]): HMMPrediction[] {
  return texts.map(predictChunk);
}