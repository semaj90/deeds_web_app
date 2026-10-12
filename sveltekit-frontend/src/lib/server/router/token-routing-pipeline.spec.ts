import { describe, expect, it } from 'vitest';
import { normalizeAndSplitTokenV1 } from '../atlas/agentic-file-compiler/token-normalization-v1';
import { CANONICAL_DOMAINS, classifyDomainTaxonomy } from '../atlas/domain-taxonomy';
import { ALLOWED_TRANSITIONS, type RouterState } from './router-types';
import { decodeRouterViterbiV1 } from './viterbi-decoder-v1';

/**
 * Offline integration test: query -> lexical tokens -> domain classification -> routing decode.
 *
 * Real owners: normalizeAndSplitTokenV1 (token), classifyDomainTaxonomy (domain), decodeRouterViterbiV1
 * (routing kernel). The token -> router-state dictionary below is a FIXTURE, not learned from traces;
 * the test proves the pipeline composes and respects the transition mask, not that routing is accurate.
 */

const STATES: RouterState[] = [
  'START', 'RETRIEVE', 'STRUCTURE', 'LEGAL_ANALYZE', 'OPERATE', 'VALIDATE',
  'RECOVER', 'CLARIFY', 'SYNTHESIZE', 'ESCALATE', 'DONE',
];

// FIXTURE dictionary: lexical token -> the router state it most plausibly observes.
const TOKEN_TO_STATE: Record<string, RouterState> = {
  start: 'START',
  retrieve: 'RETRIEVE',
  validate: 'VALIDATE',
  synthesize: 'SYNTHESIZE',
  recover: 'RECOVER',
};

function emissionsFor(tokens: string[]): number[][] {
  return tokens.map((token) => {
    const target = TOKEN_TO_STATE[token];
    return STATES.map((state) => (state === target ? 0 : -4));
  });
}

function uniformTransitions(): number[][] {
  return STATES.map(() => STATES.map(() => 0));
}

describe('token definition (normalizeAndSplitTokenV1)', () => {
  it('splits case, separators, and paths into lowercase word tokens', () => {
    expect(normalizeAndSplitTokenV1('viterbiDecoder')).toEqual(['viterbi', 'decoder']);
    expect(normalizeAndSplitTokenV1('MCP_tool-calling')).toEqual(['mcp', 'tool', 'calling']);
    expect(normalizeAndSplitTokenV1('src/lib/router.ts')).toEqual(['src', 'lib', 'router', 'ts']);
  });

  it('preserves scoped package names whole and returns nothing for blank input', () => {
    expect(normalizeAndSplitTokenV1('@scope/pkg-name')).toEqual(['@scope/pkg-name']);
    expect(normalizeAndSplitTokenV1('   ')).toEqual([]);
  });
});

describe('domain classification of query tokens (classifyDomainTaxonomy)', () => {
  it('returns a canonical domain or the general fallback, deterministically', () => {
    const input = { title: 'mcp tool calling router', symbol: 'dispatch tool call' };
    const first = classifyDomainTaxonomy(input);
    const second = classifyDomainTaxonomy(input);
    expect(second).toEqual(first);
    const allowed = new Set<string>([...CANONICAL_DOMAINS, 'general']);
    if (first.primary_domain !== null) expect(allowed.has(first.primary_domain)).toBe(true);
    expect(first.confidence).toBeGreaterThanOrEqual(0);
    expect(first.confidence).toBeLessThanOrEqual(1);
  });
});

describe('token -> router decode (decodeRouterViterbiV1)', () => {
  it('routes a legal token sequence and returns it in transition-legal order', () => {
    const tokens = ['start', 'retrieve', 'validate', 'synthesize'];
    const result = decodeRouterViterbiV1({
      states: STATES,
      emissionLogProb: emissionsFor(tokens),
      transitionLogProb: uniformTransitions(),
    });
    if (result.status !== 'DECODED') throw new Error('expected a decoded path');
    expect(result.path).toEqual(['START', 'RETRIEVE', 'VALIDATE', 'SYNTHESIZE']);
    expect(result.canonicalAuthority).toBe(false);
  });

  it('never returns an illegal transition, even when the observed tokens ask for one', () => {
    // SYNTHESIZE -> RETRIEVE is not in ALLOWED_TRANSITIONS; the decoder must route around it.
    const tokens = ['start', 'synthesize', 'retrieve'];
    const result = decodeRouterViterbiV1({
      states: STATES,
      emissionLogProb: emissionsFor(tokens),
      transitionLogProb: uniformTransitions(),
    });
    if (result.status !== 'DECODED') throw new Error('expected a decoded path');
    expect(result.path[0]).toBe('START');
    for (let t = 1; t < result.path.length; t += 1) {
      expect(ALLOWED_TRANSITIONS[result.path[t - 1]]).toContain(result.path[t]);
    }
  });
});

/** Deterministic PRNG (mulberry32): variance is seeded so any failure reproduces exactly. */
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

describe('seeded variance over the fixture (regression under noise, not accuracy evidence)', () => {
  // Noise is bounded below the fixture margin (4 log-units), so the intended state should still win.
  const NOISE = 1.0;
  const SEEDS = 100;

  it('keeps the decoded path legal and START-first across 100 noisy seeds', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const rand = prng(seed);
      const noisy = (x: number) => x + (rand() * 2 - 1) * NOISE;
      const tokens = ['start', 'retrieve', 'validate', 'synthesize', 'recover'];
      const emissionLogProb = emissionsFor(tokens).map((row) => row.map(noisy));
      const transitionLogProb = uniformTransitions().map((row) => row.map(noisy));
      const result = decodeRouterViterbiV1({ states: STATES, emissionLogProb, transitionLogProb });
      if (result.status !== 'DECODED') throw new Error(`seed ${seed}: no legal path`);
      expect(result.path[0], `seed ${seed}`).toBe('START');
      for (let t = 1; t < result.path.length; t += 1) {
        expect(ALLOWED_TRANSITIONS[result.path[t - 1]], `seed ${seed} step ${t}`).toContain(result.path[t]);
      }
    }
  });

  it('recovers the intended token-driven path under bounded noise, for every seed', () => {
    // SYNTHESIZE may only transition to DONE, so the intended sequence must end at SYNTHESIZE.
    const expected: RouterState[] = ['START', 'RETRIEVE', 'VALIDATE', 'SYNTHESIZE'];
    const tokens = ['start', 'retrieve', 'validate', 'synthesize'];
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const rand = prng(seed);
      const noisy = (x: number) => x + (rand() * 2 - 1) * NOISE;
      const emissionLogProb = emissionsFor(tokens).map((row) => row.map(noisy));
      const transitionLogProb = uniformTransitions().map((row) => row.map(noisy));
      const result = decodeRouterViterbiV1({ states: STATES, emissionLogProb, transitionLogProb });
      if (result.status !== 'DECODED') throw new Error(`seed ${seed}: no legal path`);
      expect(result.path, `seed ${seed}`).toEqual(expected);
    }
  });
});
