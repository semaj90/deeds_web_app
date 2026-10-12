import { describe, expect, it } from 'vitest';
import { ALLOWED_TRANSITIONS, type RouterState } from './router-types.js';
import {
  decodeRouterViterbiV1,
  VITERBI_MAX_OBSERVATIONS_V1,
  type ViterbiDecodeInputV1,
} from './viterbi-decoder-v1.js';

const STATES: RouterState[] = [
  'START', 'RETRIEVE', 'STRUCTURE', 'LEGAL_ANALYZE', 'OPERATE', 'VALIDATE',
  'RECOVER', 'CLARIFY', 'SYNTHESIZE', 'ESCALATE', 'DONE',
];

/** Deterministic PRNG (mulberry32) so failures reproduce exactly. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInput(rand: () => number, steps: number, states: RouterState[]): ViterbiDecodeInputV1 {
  const S = states.length;
  const emissionLogProb = Array.from({ length: steps }, () =>
    Array.from({ length: S }, () => -rand() * 4));
  const transitionLogProb = Array.from({ length: S }, () =>
    Array.from({ length: S }, () => -rand() * 4));
  return { states, emissionLogProb, transitionLogProb };
}

function scorePath(input: ViterbiDecodeInputV1, path: RouterState[]): number {
  let score = 0;
  path.forEach((state, t) => {
    const j = input.states.indexOf(state);
    score += input.emissionLogProb[t][j];
    if (t > 0) {
      const i = input.states.indexOf(path[t - 1]);
      score += input.transitionLogProb[i][j];
    }
  });
  return score;
}

/** Exhaustive oracle: every legal path that starts at START. Only usable for tiny inputs. */
function bruteForceBest(input: ViterbiDecodeInputV1): { path: RouterState[]; score: number } | null {
  const T = input.emissionLogProb.length;
  let best: { path: RouterState[]; score: number } | null = null;
  const extend = (path: RouterState[]) => {
    if (path.length === T) {
      const score = scorePath(input, path);
      if (!best || score > best.score) best = { path: [...path], score };
      return;
    }
    const prev = path[path.length - 1];
    for (const next of input.states) {
      if (!ALLOWED_TRANSITIONS[prev].includes(next)) continue;
      extend([...path, next]);
    }
  };
  extend(['START']);
  return best;
}

describe('decodeRouterViterbiV1', () => {
  it('matches an exhaustive legal-path oracle on 200 seeded random instances', () => {
    const rand = prng(20261011);
    for (let trial = 0; trial < 200; trial += 1) {
      const steps = 2 + Math.floor(rand() * 3);
      const input = randomInput(rand, steps, STATES);
      const oracle = bruteForceBest(input);
      const result = decodeRouterViterbiV1(input);
      expect(oracle).not.toBeNull();
      expect(result.status).toBe('DECODED');
      if (result.status !== 'DECODED') continue;
      expect(result.path).toEqual(oracle!.path);
      expect(result.logScore).toBeCloseTo(oracle!.score, 9);
    }
  });

  it('never emits an illegal transition, even when a learned weight favours it', () => {
    const rand = prng(7);
    const base = randomInput(rand, 5, STATES);
    // Make an illegal edge (START -> SYNTHESIZE) overwhelmingly attractive.
    const i = STATES.indexOf('START');
    const j = STATES.indexOf('SYNTHESIZE');
    expect(ALLOWED_TRANSITIONS.START.includes('SYNTHESIZE')).toBe(false);
    const transitionLogProb = base.transitionLogProb.map((row) => [...row]);
    transitionLogProb[i][j] = 1e6;
    const result = decodeRouterViterbiV1({ ...base, transitionLogProb });
    if (result.status !== 'DECODED') throw new Error('expected a decoded path');
    for (let t = 1; t < result.path.length; t += 1) {
      expect(ALLOWED_TRANSITIONS[result.path[t - 1]]).toContain(result.path[t]);
    }
  });

  it('keeps VALIDATE before SYNTHESIZE even when the learned weight prefers skipping it', () => {
    // Only two edges are legal into SYNTHESIZE: VALIDATE -> SYNTHESIZE. Force a bypass.
    const states: RouterState[] = ['START', 'RETRIEVE', 'VALIDATE', 'SYNTHESIZE', 'DONE'];
    const S = states.length;
    const transitionLogProb = Array.from({ length: S }, () => new Array<number>(S).fill(0));
    transitionLogProb[states.indexOf('RETRIEVE')][states.indexOf('SYNTHESIZE')] = 1e6; // illegal edge, masked
    const emissionLogProb = [
      [0, -5, -5, -5, -5],
      [-5, 0, -5, -5, -5],
      [-5, -5, 0, -5, -5],
      [-5, -5, -5, 0, -5],
    ];
    const result = decodeRouterViterbiV1({ states, emissionLogProb, transitionLogProb });
    if (result.status !== 'DECODED') throw new Error('expected a decoded path');
    for (let t = 1; t < result.path.length; t += 1) {
      expect(ALLOWED_TRANSITIONS[result.path[t - 1]]).toContain(result.path[t]);
      if (result.path[t] === 'SYNTHESIZE') expect(result.path[t - 1]).toBe('VALIDATE');
    }
  });

  it('requires the first decoded state to be START', () => {
    const rand = prng(99);
    const input = randomInput(rand, 3, STATES);
    const result = decodeRouterViterbiV1(input);
    if (result.status !== 'DECODED') throw new Error('expected a decoded path');
    expect(result.path[0]).toBe('START');
  });

  it('fails closed with NO_LEGAL_PATH when every legal path is forced to -Infinity', () => {
    const states: RouterState[] = ['START', 'DONE'];
    // START -> DONE is not in ALLOWED_TRANSITIONS, so a two-step path has no legal route.
    const result = decodeRouterViterbiV1({
      states,
      emissionLogProb: [[0, -Infinity], [-Infinity, 0]],
      transitionLogProb: [[0, 0], [0, 0]],
    });
    expect(result.status).toBe('NO_LEGAL_PATH');
    expect(result.canonicalAuthority).toBe(false);
  });

  it('returns NO_LEGAL_PATH when START is absent from the observation column', () => {
    const states: RouterState[] = ['START', 'RETRIEVE'];
    const result = decodeRouterViterbiV1({
      states,
      emissionLogProb: [[-Infinity, 0]],
      transitionLogProb: [[0, 0], [0, 0]],
    });
    expect(result.status).toBe('NO_LEGAL_PATH');
  });

  it('rejects NaN inputs instead of decoding through them', () => {
    expect(() => decodeRouterViterbiV1({
      states: ['START', 'RETRIEVE'],
      emissionLogProb: [[0, Number.NaN]],
      transitionLogProb: [[0, 0], [0, 0]],
    })).toThrow('VITERBI_NAN_INPUT');
  });

  it('rejects +Infinity emissions and transitions (only -Infinity means impossible)', () => {
    expect(() => decodeRouterViterbiV1({
      states: ['START', 'RETRIEVE'],
      emissionLogProb: [[0, Number.POSITIVE_INFINITY]],
      transitionLogProb: [[0, 0], [0, 0]],
    })).toThrow('VITERBI_NAN_INPUT');
    expect(() => decodeRouterViterbiV1({
      states: ['START', 'RETRIEVE'],
      emissionLogProb: [[0, 0]],
      transitionLogProb: [[0, Number.POSITIVE_INFINITY], [0, 0]],
    })).toThrow('VITERBI_NAN_INPUT');
  });

  it('bounds the number of observations to VITERBI_MAX_OBSERVATIONS_V1', () => {
    const steps = VITERBI_MAX_OBSERVATIONS_V1 + 1;
    expect(() => decodeRouterViterbiV1({
      states: ['START'],
      emissionLogProb: Array.from({ length: steps }, () => [0]),
      transitionLogProb: [[0]],
    })).toThrow('VITERBI_TOO_MANY_OBSERVATIONS');
  });

  it('rejects inputs without START, with duplicate states, or with shape mismatches', () => {
    expect(() => decodeRouterViterbiV1({
      states: ['RETRIEVE'], emissionLogProb: [[0]], transitionLogProb: [[0]],
    })).toThrow('VITERBI_START_STATE_MISSING');
    expect(() => decodeRouterViterbiV1({
      states: ['START', 'START'], emissionLogProb: [[0, 0]], transitionLogProb: [[0, 0], [0, 0]],
    })).toThrow('VITERBI_DUPLICATE_STATE');
    expect(() => decodeRouterViterbiV1({
      states: ['START', 'RETRIEVE'], emissionLogProb: [[0]], transitionLogProb: [[0, 0], [0, 0]],
    })).toThrow('VITERBI_EMISSION_SHAPE');
  });

  it('is deterministic for identical input', () => {
    const rand = prng(42);
    const input = randomInput(rand, 4, STATES);
    expect(decodeRouterViterbiV1(input)).toEqual(decodeRouterViterbiV1(input));
  });

  it('is advisory only: canonicalAuthority is false on every result', () => {
    const rand = prng(3);
    const decoded = decodeRouterViterbiV1(randomInput(rand, 3, STATES));
    expect(decoded.canonicalAuthority).toBe(false);
  });
});
