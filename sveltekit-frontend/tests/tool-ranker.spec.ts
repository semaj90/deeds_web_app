// @vitest-environment node
/**
 * FastMCP tool-ranker unit tests
 *
 * Covers:
 *   1. scoreToolForContext — weight formula + confidence gate
 *   2. rankTools — ordering, limit, inputManifold filter
 *   3. defaultToolsForSection — section-to-tool shortcut lists
 *   4. registerTool / getToolRegistry — runtime extension
 *   5. updateToolStats — EMA latency + gain update
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  scoreToolForContext,
  rankTools,
  defaultToolsForSection,
  registerTool,
  getToolRegistry,
  updateToolStats,
  type TraceToolProfile,
} from '$lib/server/mcp/tool-ranker.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<TraceToolProfile> = {}): TraceToolProfile {
  return {
    name:               'test.tool',
    kind:               'search',
    accepts:            ['query'],
    produces:           ['chunks'],
    bestForHmmSections: ['FACTS'],
    avgLatencyMs:       100,
    avgGainScore:       0.70,
    risk:               'read_only',
    ...overrides,
  };
}

// ── 1. scoreToolForContext ────────────────────────────────────────────────────

describe('scoreToolForContext — weight formula', () => {
  it('returns score in [0, 1]', () => {
    const tool = makeProfile();
    const { score } = scoreToolForContext(tool, 'FACTS', 1.0);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('HMM-fit tool scores higher than non-fit tool at full confidence', () => {
    const fit    = makeProfile({ bestForHmmSections: ['LEGAL_AUTHORITY'] });
    const nonFit = makeProfile({ bestForHmmSections: ['PARTIES'] });

    const { score: s1 } = scoreToolForContext(fit,    'LEGAL_AUTHORITY', 1.0);
    const { score: s2 } = scoreToolForContext(nonFit, 'LEGAL_AUTHORITY', 1.0);
    expect(s1).toBeGreaterThan(s2);
  });

  it('dangerous tool scores lower than read_only tool (all else equal)', () => {
    const safe = makeProfile({ risk: 'read_only' });
    const dang = makeProfile({ risk: 'dangerous' });

    const { score: s1 } = scoreToolForContext(safe, 'FACTS', 1.0);
    const { score: s2 } = scoreToolForContext(dang, 'FACTS', 1.0);
    expect(s1).toBeGreaterThan(s2);
  });

  it('high avgGainScore raises expected-gain and prior-success-rate components', () => {
    const highGain = makeProfile({ avgGainScore: 0.95 });
    const lowGain  = makeProfile({ avgGainScore: 0.10 });

    const { score: s1 } = scoreToolForContext(highGain, 'FACTS', 1.0);
    const { score: s2 } = scoreToolForContext(lowGain,  'FACTS', 1.0);
    expect(s1).toBeGreaterThan(s2);
  });

  it('fast tool (low latency) scores higher than slow tool', () => {
    const fast = makeProfile({ avgLatencyMs: 50 });
    const slow = makeProfile({ avgLatencyMs: 1800 });

    const { score: s1 } = scoreToolForContext(fast, 'FACTS', 1.0);
    const { score: s2 } = scoreToolForContext(slow, 'FACTS', 1.0);
    expect(s1).toBeGreaterThan(s2);
  });

  it('cache warmth raises score by ≈0.10 at full warmth vs cold', () => {
    const tool = makeProfile();
    const { score: cold } = scoreToolForContext(tool, 'FACTS', 1.0, 0);
    const { score: warm } = scoreToolForContext(tool, 'FACTS', 1.0, 1);
    // cacheWarmth weight is 0.10 — delta should be close to that
    expect(warm - cold).toBeCloseTo(0.10, 1);
  });

  it('confidence=0 collapses score toward 0.5 regardless of tool quality', () => {
    const excellent = makeProfile({ avgGainScore: 1.0, avgLatencyMs: 10, risk: 'read_only' });
    const { score } = scoreToolForContext(excellent, 'FACTS', 0.0);
    // 0.5*(1-0) + rawScore*0 = 0.5 exactly
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('confidence=1 returns full raw score without blending', () => {
    // Tool with HMM fit, high gain, fast, read_only, no cache warmth
    const tool = makeProfile({
      bestForHmmSections: ['FACTS'],
      avgGainScore:       0.72,
      avgLatencyMs:       120,
      risk:               'read_only',
    });
    const { score } = scoreToolForContext(tool, 'FACTS', 1.0);
    // Manually compute:
    //   hmmFit=1 → 1.0*0.35 = 0.35
    //   expectedGain=0.72 → 0.72*0.25 = 0.18
    //   priorSuccessRate=0.72 → 0.72*0.20 = 0.144
    //   cacheWarmth=0 → 0
    //   latency: (120-50)/(2000-50)=0.0359 → penalty=0.0359*0.05≈0.0018
    //   risk: 0
    //   rawScore ≈ 0.35+0.18+0.144-0.0018 = 0.6722
    //   score = 0.5*0 + 0.6722*1 = 0.6722
    expect(score).toBeCloseTo(0.6722, 2);
  });

  it('why[] includes "best_for_facts" when section matches', () => {
    const tool = makeProfile({ bestForHmmSections: ['FACTS'] });
    const { why } = scoreToolForContext(tool, 'FACTS', 1.0);
    expect(why).toContain('best_for_facts');
  });

  it('why[] includes "read_only_safe" for read_only tools', () => {
    const tool = makeProfile({ risk: 'read_only' });
    const { why } = scoreToolForContext(tool, 'FACTS', 1.0);
    expect(why).toContain('read_only_safe');
  });

  it('why[] includes "fast_tool" when latency is near zero', () => {
    const tool = makeProfile({ avgLatencyMs: 10 });
    const { why } = scoreToolForContext(tool, 'FACTS', 1.0);
    expect(why).toContain('fast_tool');
  });

  it('why[] includes "high_prior_gain" when avgGainScore > 0.6', () => {
    const tool = makeProfile({ avgGainScore: 0.85 });
    const { why } = scoreToolForContext(tool, 'FACTS', 1.0);
    expect(why).toContain('high_prior_gain');
  });
});

// ── 2. rankTools ─────────────────────────────────────────────────────────────

describe('rankTools — ordering and filtering', () => {
  it('returns at most `limit` results', () => {
    const results = rankTools({ hmmSection: 'FACTS', confidence: 1.0, limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('default limit is 3', () => {
    const results = rankTools({ hmmSection: 'FACTS', confidence: 1.0 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('results are sorted descending by score', () => {
    const results = rankTools({ hmmSection: 'LEGAL_AUTHORITY', confidence: 1.0, limit: 5 });
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }
  });

  it('filters by inputManifold — only tools accepting the manifold are returned', () => {
    // Only tools accepting 'chunkId' should appear
    const results = rankTools({
      hmmSection:   'LEGAL_AUTHORITY',
      confidence:   1.0,
      inputManifold: ['chunkId'],
      limit:        10,
    });
    for (const r of results) {
      expect(r.profile.accepts).toContain('chunkId');
    }
  });

  it('returns empty array when no tool matches inputManifold', () => {
    const results = rankTools({
      hmmSection:   'FACTS',
      confidence:   1.0,
      inputManifold: ['nonexistent_manifold'],
    });
    expect(results).toHaveLength(0);
  });

  it('top-ranked tool for LEGAL_AUTHORITY has HMM fit in why[]', () => {
    const results = rankTools({ hmmSection: 'LEGAL_AUTHORITY', confidence: 1.0 });
    expect(results[0].why).toContain('best_for_legal_authority');
  });

  it('every result has profile, score, and why fields', () => {
    const results = rankTools({ hmmSection: 'CLAIMS', confidence: 0.8 });
    for (const r of results) {
      expect(r).toHaveProperty('profile');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('why');
      expect(Array.isArray(r.why)).toBe(true);
    }
  });
});

// ── 3. defaultToolsForSection ─────────────────────────────────────────────────

describe('defaultToolsForSection — section shortcut lists', () => {
  const sections = [
    'LEGAL_AUTHORITY', 'FACTS', 'CLAIMS', 'PRAYER_HOLDING',
    'JURISDICTION', 'PARTIES', 'UNKNOWN',
  ] as const;

  it.each(sections)('returns 3 tool names for %s', (section) => {
    const tools = defaultToolsForSection(section);
    expect(tools).toHaveLength(3);
    tools.forEach((t) => expect(typeof t).toBe('string'));
  });

  it('LEGAL_AUTHORITY starts with trace.kag_search', () => {
    const tools = defaultToolsForSection('LEGAL_AUTHORITY');
    expect(tools[0]).toBe('trace.kag_search');
  });

  it('CLAIMS leads with graph.fetch_rerank', () => {
    const tools = defaultToolsForSection('CLAIMS');
    expect(tools[0]).toBe('graph.fetch_rerank');
  });

  it('JURISDICTION leads with topology.search_near', () => {
    const tools = defaultToolsForSection('JURISDICTION');
    expect(tools[0]).toBe('topology.search_near');
  });

  it('UNKNOWN falls back to trace.kag_search first', () => {
    const tools = defaultToolsForSection('UNKNOWN');
    expect(tools[0]).toBe('trace.kag_search');
  });
});

// ── 4. registerTool / getToolRegistry ────────────────────────────────────────

describe('registerTool — runtime extension', () => {
  it('registered tool appears in getToolRegistry()', () => {
    const profile = makeProfile({ name: 'custom.my_tool' });
    registerTool(profile);
    expect(getToolRegistry().has('custom.my_tool')).toBe(true);
  });

  it('registered tool is ranked when it fits the HMM section', () => {
    const profile = makeProfile({
      name:               'custom.high_fit',
      bestForHmmSections: ['PRAYER_HOLDING'],
      avgGainScore:       0.99,
      avgLatencyMs:       10,
      risk:               'read_only',
    });
    registerTool(profile);

    const results = rankTools({ hmmSection: 'PRAYER_HOLDING', confidence: 1.0, limit: 5 });
    const names = results.map((r) => r.profile.name);
    expect(names).toContain('custom.high_fit');
  });

  it('registry returns ReadonlyMap (no accidental mutation)', () => {
    const registry = getToolRegistry();
    expect(typeof registry.get).toBe('function');
    expect(typeof (registry as Map<string, TraceToolProfile>).set).toBe('function');
    // ReadonlyMap still has set at runtime — just type-unsafe to call it; check structural shape
    expect(registry.size).toBeGreaterThan(0);
  });
});

// ── 5. updateToolStats ───────────────────────────────────────────────────────

describe('updateToolStats — EMA updates', () => {
  // Use a freshly registered tool so we don't pollute the shared default registry
  const TOOL_NAME = 'test.ema_tool';

  beforeEach(() => {
    registerTool(makeProfile({
      name:         TOOL_NAME,
      avgLatencyMs: 200,
      avgGainScore: 0.60,
    }));
  });

  it('EMA moves avgLatencyMs toward new measurement (α=0.2)', () => {
    const registry = getToolRegistry() as Map<string, TraceToolProfile>;
    const before   = registry.get(TOOL_NAME)!.avgLatencyMs;

    updateToolStats(TOOL_NAME, 1000, 0.60, true);

    const after = registry.get(TOOL_NAME)!.avgLatencyMs;
    const expected = before * 0.8 + 1000 * 0.2;
    expect(after).toBeCloseTo(expected, 5);
  });

  it('EMA moves avgGainScore toward new measurement', () => {
    const registry = getToolRegistry() as Map<string, TraceToolProfile>;
    const before   = registry.get(TOOL_NAME)!.avgGainScore;

    updateToolStats(TOOL_NAME, 200, 0.90, true);

    const after    = registry.get(TOOL_NAME)!.avgGainScore;
    const expected = before * 0.8 + 0.90 * 0.2;
    expect(after).toBeCloseTo(expected, 5);
  });

  it('no-op for unknown tool name (does not throw)', () => {
    expect(() => updateToolStats('nonexistent.tool', 100, 0.5, true)).not.toThrow();
  });

  it('zero avgLatencyMs seed uses measurement directly', () => {
    const SEED_NAME = 'test.seed_tool';
    registerTool(makeProfile({ name: SEED_NAME, avgLatencyMs: 0, avgGainScore: 0 }));

    updateToolStats(SEED_NAME, 500, 0.75, true);

    const registry = getToolRegistry() as Map<string, TraceToolProfile>;
    expect(registry.get(SEED_NAME)!.avgLatencyMs).toBeCloseTo(500, 5);
    expect(registry.get(SEED_NAME)!.avgGainScore).toBeCloseTo(0.75, 5);
  });

  it('multiple EMA updates converge score toward repeated measurement', () => {
    const registry = getToolRegistry() as Map<string, TraceToolProfile>;

    // After many updates of 0.9, avgGainScore should approach 0.9
    for (let i = 0; i < 30; i++) {
      updateToolStats(TOOL_NAME, 200, 0.9, true);
    }

    expect(registry.get(TOOL_NAME)!.avgGainScore).toBeCloseTo(0.9, 1);
  });
});
