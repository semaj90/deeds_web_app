import { ALLOWED_TRANSITIONS, type RouterState } from './router-types.js';

/**
 * Log-space Viterbi decoder over the MCP router states (T15 offline slice).
 *
 * Pure and unwired: no production caller, no database access, no online updates.
 * Learned transition weights may only re-rank edges that ALLOWED_TRANSITIONS already
 * permits; a disallowed edge is masked to -Infinity regardless of its weight. The
 * first decoded state must be START. If no legal path exists the decoder fails closed.
 *
 * This is a decoding kernel, not a routing authority: its output is advisory and
 * canonicalAuthority is always false.
 */
export const VITERBI_DECODER_V1_REVISION = 'atlas.router-viterbi-decoder.v1' as const;

export type ViterbiDecodeInputV1 = {
  /** Column order for both matrices. Must be unique and include 'START'. */
  states: readonly RouterState[];
  /** emissionLogProb[t][s]: log P(observation_t | states[s]). -Infinity is allowed. */
  emissionLogProb: ReadonlyArray<ReadonlyArray<number>>;
  /** transitionLogProb[i][j]: learned log weight for states[i] -> states[j]; masked by ALLOWED_TRANSITIONS. */
  transitionLogProb: ReadonlyArray<ReadonlyArray<number>>;
};

export type ViterbiDecodeResultV1 =
  | {
    status: 'DECODED';
    path: RouterState[];
    logScore: number;
    revision: typeof VITERBI_DECODER_V1_REVISION;
    canonicalAuthority: false;
  }
  | {
    status: 'NO_LEGAL_PATH';
    path: null;
    logScore: null;
    revision: typeof VITERBI_DECODER_V1_REVISION;
    canonicalAuthority: false;
  };

/** Bounds the T x S decode table. Longer sequences must be split by the caller. */
export const VITERBI_MAX_OBSERVATIONS_V1 = 512;

/** NaN and +Infinity would corrupt scores; -Infinity is the legal "impossible" value. */
function assertFiniteOrNegInf(values: ReadonlyArray<number>, label: string): void {
  for (const value of values) {
    if (Number.isNaN(value) || value === Number.POSITIVE_INFINITY) {
      throw new Error(`VITERBI_NAN_INPUT:${label}`);
    }
  }
}

function validate(input: ViterbiDecodeInputV1): void {
  const { states, emissionLogProb, transitionLogProb } = input;
  if (states.length === 0) throw new Error('VITERBI_NO_STATES');
  if (new Set(states).size !== states.length) throw new Error('VITERBI_DUPLICATE_STATE');
  if (!states.includes('START')) throw new Error('VITERBI_START_STATE_MISSING');
  if (emissionLogProb.length === 0) throw new Error('VITERBI_NO_OBSERVATIONS');
  if (emissionLogProb.length > VITERBI_MAX_OBSERVATIONS_V1) {
    throw new Error(`VITERBI_TOO_MANY_OBSERVATIONS:${emissionLogProb.length}>${VITERBI_MAX_OBSERVATIONS_V1}`);
  }
  for (const [t, row] of emissionLogProb.entries()) {
    if (row.length !== states.length) throw new Error(`VITERBI_EMISSION_SHAPE:${t}`);
    assertFiniteOrNegInf(row, `emission:${t}`);
  }
  if (transitionLogProb.length !== states.length) throw new Error('VITERBI_TRANSITION_SHAPE');
  for (const [i, row] of transitionLogProb.entries()) {
    if (row.length !== states.length) throw new Error(`VITERBI_TRANSITION_SHAPE:${i}`);
    assertFiniteOrNegInf(row, `transition:${i}`);
  }
}

/**
 * Decode the most likely legal state path. Ties resolve to the lowest state index,
 * so the same input always yields the same path.
 */
export function decodeRouterViterbiV1(input: ViterbiDecodeInputV1): ViterbiDecodeResultV1 {
  validate(input);
  const { states, emissionLogProb, transitionLogProb } = input;
  const S = states.length;
  const T = emissionLogProb.length;
  const startIndex = states.indexOf('START');

  const delta: number[][] = Array.from({ length: T }, () => new Array<number>(S).fill(Number.NEGATIVE_INFINITY));
  const psi: number[][] = Array.from({ length: T }, () => new Array<number>(S).fill(-1));

  delta[0][startIndex] = emissionLogProb[0][startIndex];

  for (let t = 1; t < T; t += 1) {
    for (let j = 0; j < S; j += 1) {
      let best = Number.NEGATIVE_INFINITY;
      let bestFrom = -1;
      for (let i = 0; i < S; i += 1) {
        const from = delta[t - 1][i];
        if (from === Number.NEGATIVE_INFINITY) continue;
        if (!ALLOWED_TRANSITIONS[states[i]].includes(states[j])) continue;
        const candidate = from + transitionLogProb[i][j];
        if (candidate > best) {
          best = candidate;
          bestFrom = i;
        }
      }
      if (bestFrom >= 0) {
        delta[t][j] = best + emissionLogProb[t][j];
        psi[t][j] = bestFrom;
      }
    }
  }

  let bestFinal = Number.NEGATIVE_INFINITY;
  let last = -1;
  for (let j = 0; j < S; j += 1) {
    if (delta[T - 1][j] > bestFinal) {
      bestFinal = delta[T - 1][j];
      last = j;
    }
  }

  if (last < 0 || bestFinal === Number.NEGATIVE_INFINITY) {
    return { status: 'NO_LEGAL_PATH', path: null, logScore: null, revision: VITERBI_DECODER_V1_REVISION, canonicalAuthority: false };
  }

  const indices = new Array<number>(T);
  indices[T - 1] = last;
  for (let t = T - 1; t >= 1; t -= 1) {
    indices[t - 1] = psi[t][indices[t]];
  }

  return {
    status: 'DECODED',
    path: indices.map((index) => states[index]),
    logScore: bestFinal,
    revision: VITERBI_DECODER_V1_REVISION,
    canonicalAuthority: false,
  };
}
