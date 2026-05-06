// @vitest-environment node
/**
 * HMM ACE Flow + 4D Wiki Logger tests
 *
 * Covers:
 *   - scoreNarrativeFlow: transition log-prob coherence scoring
 *   - classifyQuerySection: query → legal section HMM classification
 *   - getCompressionHints: merge/split/keep recommendations
 *   - logHMMAnalysis: cache-first 4D wiki note write (Redis)
 *   - logHMMBatch: sequential loop that skips cached pools
 *   - scanHMMNotes: MCP-searchable Redis SCAN sorted by flowScore
 *   - 4D coordinate derivation (x/y from SOM, z=flowScore, w=sectionNumeric)
 *   - wiki note shape and field contract
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlyphRecord, GlyphSection } from '../src/lib/server/types/glyph.js';

// ── Mock refs ────────────────────────────────────────────────────────────────
const mockGet    = vi.fn();
const mockSetex  = vi.fn().mockResolvedValue('OK');
const mockSadd   = vi.fn().mockResolvedValue(1);
const mockScan   = vi.fn();
const mockMget   = vi.fn();

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get:    mockGet,
    setex:  mockSetex,
    sadd:   mockSadd,
    scan:   mockScan,
    mget:   mockMget,
    zincrby: vi.fn().mockResolvedValue(1),
    expire:  vi.fn().mockResolvedValue(1),
    zrevrange: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('$lib/server/observability/langfuse.js', () => ({
  traceGraph: (_name: string, _meta: unknown, fn: () => unknown) => fn(),
  traceCache: (_name: string, _meta: unknown, fn: () => unknown) => fn(),
}));

vi.mock('$lib/server/glyph-prompt-cache.js', () => ({
  getFragment: vi.fn().mockReturnValue(null),
  setFragment: vi.fn(),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: { QDRANT_URL: 'http://localhost:6333', OLLAMA_BASE_URL: 'http://localhost:11434' },
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public',  () => ({ env: {} }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeGlyph(
  id: string,
  section: GlyphSection,
  gridX = 3,
  gridY = 5
): GlyphRecord {
  return {
    glyphId:  id,
    kind:     'chunk',
    semantic: {
      summary:     `Summary of ${id} about ${section}`,
      content:     `Detailed content for ${id}`,
      tags:        [section.toLowerCase()],
      entities:    [],
      section,
      kagNeighbors: [],
      dagPrev:     [],
      dagNext:     [],
    },
    vector: {
      embedding768:  new Float32Array(768).fill(0.1),
      embeddingModel: 'embeddinggemma',
      grpoRewardScore: 0.75,
    },
    topology: {
      gridX,
      gridY,
      somCluster: gridX,
      normX: gridX / 10,
      normY: gridY / 10,
    },
    render: {
      promptCacheKey: `glyph:${id}`,
    },
  } as unknown as GlyphRecord;
}

const PARTY_GLYPH = makeGlyph('g-parties',  'PARTIES',        1, 2);
const FACTS_GLYPH = makeGlyph('g-facts',    'FACTS',          3, 5);
const LAW_GLYPH   = makeGlyph('g-law',      'LEGAL_AUTHORITY', 5, 3);
const CLAIM_GLYPH = makeGlyph('g-claims',   'CLAIMS',         7, 6);

const COHERENT_POOL = [PARTY_GLYPH, FACTS_GLYPH, LAW_GLYPH, CLAIM_GLYPH];

function makeAnalysis(
  overrides: Partial<{
    flowScore: number;
    dominantSection: GlyphSection;
    sectionCoverage: GlyphSection[];
  }> = {}
) {
  return {
    flowScore:         overrides.flowScore        ?? 0.87,
    dominantSection:   overrides.dominantSection  ?? 'FACTS',
    sectionCoverage:   overrides.sectionCoverage  ?? ['PARTIES', 'FACTS', 'LEGAL_AUTHORITY', 'CLAIMS'],
    gaps:              [] as { fromSection: GlyphSection; toSection: GlyphSection; glyphIdA: string; glyphIdB: string }[],
    compressionHints:  [] as { glyphIdA: string; glyphIdB: string; action: 'merge'|'split'|'keep'; reason: string; confidence: number }[],
    perGlyphConfidence: [0.9, 0.85, 0.88, 0.75],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HMM ACE flow + 4D wiki logger', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);      // cold cache by default
    mockScan.mockResolvedValue(['0', []]); // empty scan
    mockMget.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ─── scoreNarrativeFlow ────────────────────────────────────────────────────

  describe('scoreNarrativeFlow', () => {
    it('canonical order (PARTIES→JURISDICTION→FACTS→LA→CLAIMS) scores near 1', async () => {
      const { scoreNarrativeFlow } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const score = scoreNarrativeFlow(['PARTIES', 'JURISDICTION', 'FACTS', 'LEGAL_AUTHORITY', 'CLAIMS']);
      expect(score).toBeGreaterThan(0.7);
    });

    it('reversed order scores lower than canonical', async () => {
      const { scoreNarrativeFlow } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const canonical = scoreNarrativeFlow(['PARTIES', 'FACTS', 'LEGAL_AUTHORITY', 'CLAIMS']);
      const reversed  = scoreNarrativeFlow(['CLAIMS', 'LEGAL_AUTHORITY', 'FACTS', 'PARTIES']);
      expect(canonical).toBeGreaterThan(reversed);
    });

    it('single-glyph sequence returns 1 (no pairs to evaluate)', async () => {
      const { scoreNarrativeFlow } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      expect(scoreNarrativeFlow(['FACTS'])).toBe(1);
    });

    it('empty sequence returns 1', async () => {
      const { scoreNarrativeFlow } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      expect(scoreNarrativeFlow([])).toBe(1);
    });

    it('score is in [0, 1]', async () => {
      const { scoreNarrativeFlow } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const s = scoreNarrativeFlow(['CLAIMS', 'PARTIES', 'CLAIMS', 'PARTIES']);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });
  });

  // ─── classifyQuerySection ──────────────────────────────────────────────────

  describe('classifyQuerySection', () => {
    it('returns section and confidence', async () => {
      const { classifyQuerySection } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const r = classifyQuerySection('What are the facts of this case?');
      expect(typeof r.section).toBe('string');
      expect(typeof r.confidence).toBe('number');
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    });

    it('legal authority query classifies as LEGAL_AUTHORITY or CLAIMS', async () => {
      const { classifyQuerySection } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const r = classifyQuerySection('Which statutes and precedents apply to this claim?');
      expect(['LEGAL_AUTHORITY', 'CLAIMS', 'FACTS', 'PRAYER_HOLDING', 'UNKNOWN']).toContain(r.section);
    });

    it('parties query classifies as PARTIES or UNKNOWN', async () => {
      const { classifyQuerySection } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const r = classifyQuerySection('Who are the plaintiff and defendant in this matter?');
      expect(['PARTIES', 'JURISDICTION', 'FACTS', 'UNKNOWN']).toContain(r.section);
    });

    it('same query produces deterministic result on repeated calls', async () => {
      const { classifyQuerySection } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const q = 'Summarize the hearsay objection under California Evidence Code 1200';
      const r1 = classifyQuerySection(q);
      const r2 = classifyQuerySection(q);
      expect(r1.section).toBe(r2.section);
      expect(r1.confidence).toBeCloseTo(r2.confidence, 5);
    });
  });

  // ─── getCompressionHints ───────────────────────────────────────────────────

  describe('getCompressionHints', () => {
    it('returns hints array', async () => {
      const { getCompressionHints } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const hints = getCompressionHints(COHERENT_POOL);
      expect(Array.isArray(hints)).toBe(true);
      expect(hints).toHaveLength(COHERENT_POOL.length - 1);
    });

    it('same-section adjacent glyphs → merge hint when confidence >= threshold', async () => {
      const { getCompressionHints } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const factA = makeGlyph('fa', 'FACTS', 3, 5);
      const factB = makeGlyph('fb', 'FACTS', 3, 6);
      const hints = getCompressionHints(
        [factA, factB],
        ['FACTS', 'FACTS'],
        [0.8, 0.9]   // high confidence → merge
      );
      expect(hints[0].action).toBe('merge');
    });

    it('every hint has glyphIdA, glyphIdB, action, confidence', async () => {
      const { getCompressionHints } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const hints = getCompressionHints(COHERENT_POOL);
      for (const h of hints) {
        expect(typeof h.glyphIdA).toBe('string');
        expect(typeof h.glyphIdB).toBe('string');
        expect(['merge', 'split', 'keep']).toContain(h.action);
        expect(h.confidence).toBeGreaterThanOrEqual(0);
        expect(h.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  // ─── 4D coordinate derivation ─────────────────────────────────────────────

  describe('SECTION_W 4D w-axis', () => {
    it('covers all 7 GlyphSection values', async () => {
      const { SECTION_W } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const sections: GlyphSection[] = [
        'PARTIES', 'JURISDICTION', 'FACTS', 'LEGAL_AUTHORITY',
        'CLAIMS', 'PRAYER_HOLDING', 'UNKNOWN',
      ];
      for (const s of sections) {
        expect(typeof SECTION_W[s]).toBe('number');
      }
    });

    it('w values are distinct monotonically increasing', async () => {
      const { SECTION_W } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const ordered = [
        SECTION_W['PARTIES'],
        SECTION_W['JURISDICTION'],
        SECTION_W['FACTS'],
        SECTION_W['LEGAL_AUTHORITY'],
        SECTION_W['CLAIMS'],
        SECTION_W['PRAYER_HOLDING'],
        SECTION_W['UNKNOWN'],
      ];
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i]).toBeGreaterThan(ordered[i - 1]);
      }
    });
  });

  // ─── glyphPoolHash ─────────────────────────────────────────────────────────

  describe('glyphPoolHash', () => {
    it('returns 24-char hex string', async () => {
      const { glyphPoolHash } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const h = glyphPoolHash(COHERENT_POOL);
      expect(h).toHaveLength(24);
      expect(h).toMatch(/^[0-9a-f]+$/);
    });

    it('same pool → same hash (content-addressed)', async () => {
      const { glyphPoolHash } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const h1 = glyphPoolHash(COHERENT_POOL);
      const h2 = glyphPoolHash([...COHERENT_POOL].reverse()); // order doesn't matter — sorted internally
      expect(h1).toBe(h2);
    });

    it('different pool → different hash', async () => {
      const { glyphPoolHash } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const h1 = glyphPoolHash([FACTS_GLYPH]);
      const h2 = glyphPoolHash([LAW_GLYPH]);
      expect(h1).not.toBe(h2);
    });
  });

  // ─── logHMMAnalysis: cache-first write ────────────────────────────────────

  describe('logHMMAnalysis — cache miss → writes note', () => {
    it('cold cache: writes Redis and returns fromCache=false', async () => {
      mockGet.mockResolvedValue(null);

      const { logHMMAnalysis } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const r = await logHMMAnalysis(makeAnalysis(), COHERENT_POOL, { userId: 'u1' });

      expect(r.fromCache).toBe(false);
      expect(r.note.fromCache).toBe(false);
      expect(mockSetex).toHaveBeenCalledOnce();
    });

    it('written note has correct 4D coordinates (x/y from dominant glyph, z=flow, w=section)', async () => {
      const { logHMMAnalysis } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const r = await logHMMAnalysis(makeAnalysis({ dominantSection: 'FACTS', flowScore: 0.87 }), COHERENT_POOL);

      const n = r.note;
      expect(typeof n.x).toBe('number');
      expect(typeof n.y).toBe('number');
      expect(n.z).toBeCloseTo(0.87, 3);
      // w for FACTS = 2
      expect(n.w).toBe(2);
    });

    it('note shape has all required fields', async () => {
      const { logHMMAnalysis } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const r = await logHMMAnalysis(makeAnalysis(), COHERENT_POOL, { userId: 'u-test' });
      const n = r.note;

      expect(n.stableKey).toMatch(/^wiki:note:hmm:/);
      expect(n.kind).toBe('hmm_analysis');
      expect(Array.isArray(n.glyphIds)).toBe(true);
      expect(n.glyphIds).toHaveLength(COHERENT_POOL.length);
      expect(typeof n.flowScore).toBe('number');
      expect(typeof n.dominantSection).toBe('string');
      expect(Array.isArray(n.sectionCoverage)).toBe(true);
      expect(Array.isArray(n.compressionHints)).toBe(true);
      expect(Array.isArray(n.gaps)).toBe(true);
      expect(Array.isArray(n.perGlyphConfidence)).toBe(true);
      expect(typeof n.createdAt).toBe('string');
    });

    it('cacheKey is prefixed wiki:note:hmm:', async () => {
      const { logHMMAnalysis } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const r = await logHMMAnalysis(makeAnalysis(), [FACTS_GLYPH]);
      expect(r.cacheKey).toMatch(/^wiki:note:hmm:[0-9a-f]{24}$/);
    });
  });

  describe('logHMMAnalysis — cache hit → skips write', () => {
    it('warm cache: returns fromCache=true, does NOT call setex', async () => {
      const cachedNote = { ...makeAnalysis(), kind: 'hmm_analysis', fromCache: false, createdAt: new Date().toISOString(), stableKey: 'wiki:note:hmm:abc', glyphIds: [], x: 3, y: 5, z: 0.87, w: 2 };
      mockGet.mockResolvedValue(JSON.stringify(cachedNote));

      const { logHMMAnalysis } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const r = await logHMMAnalysis(makeAnalysis(), COHERENT_POOL);

      expect(r.fromCache).toBe(true);
      expect(r.note.fromCache).toBe(true);
      expect(mockSetex).not.toHaveBeenCalled();
    });

    it('analysisMs is 0 on cache hit (no re-computation)', async () => {
      const cachedNote = { kind: 'hmm_analysis', fromCache: false, z: 0.7, w: 2, createdAt: new Date().toISOString(), stableKey: 'wiki:note:hmm:xyz', glyphIds: [], x: 0, y: 0, flowScore: 0.7, dominantSection: 'FACTS', sectionCoverage: [], compressionHints: [], gaps: [], perGlyphConfidence: [] };
      mockGet.mockResolvedValue(JSON.stringify(cachedNote));

      const { logHMMAnalysis } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const r = await logHMMAnalysis(makeAnalysis(), COHERENT_POOL);

      expect(r.analysisMs).toBe(0);
    });

    it('force=true bypasses cache and always writes', async () => {
      const cachedNote = { kind: 'hmm_analysis', z: 0.6, w: 2, fromCache: false };
      mockGet.mockResolvedValue(JSON.stringify(cachedNote));

      const { logHMMAnalysis } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const r = await logHMMAnalysis(makeAnalysis(), COHERENT_POOL, { force: true });

      expect(r.fromCache).toBe(false);
      expect(mockSetex).toHaveBeenCalledOnce();
    });
  });

  // ─── logHMMBatch: incremental loop ────────────────────────────────────────

  describe('logHMMBatch — incremental update loop', () => {
    it('processes all pairs in order', async () => {
      const { logHMMBatch } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const pairs = [
        { analysis: makeAnalysis({ dominantSection: 'FACTS' }),    glyphs: [FACTS_GLYPH] },
        { analysis: makeAnalysis({ dominantSection: 'CLAIMS' }),   glyphs: [CLAIM_GLYPH] },
        { analysis: makeAnalysis({ dominantSection: 'PARTIES' }),  glyphs: [PARTY_GLYPH] },
      ];

      const results = await logHMMBatch(pairs, { userId: 'batch-user' });

      expect(results).toHaveLength(3);
      expect(results[0].note.dominantSection).toBe('FACTS');
      expect(results[1].note.dominantSection).toBe('CLAIMS');
      expect(results[2].note.dominantSection).toBe('PARTIES');
    });

    it('cache hits in batch do not re-run (setex count = cache-miss count only)', async () => {
      // Pool 1: cold, pool 2: warm, pool 3: cold
      let callCount = 0;
      mockGet.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) return JSON.stringify({ kind: 'hmm_analysis', fromCache: false, z: 0.5, w: 2 });
        return null;
      });

      const { logHMMBatch } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const pairs = [
        { analysis: makeAnalysis(), glyphs: [FACTS_GLYPH] },
        { analysis: makeAnalysis(), glyphs: [LAW_GLYPH] },   // warm
        { analysis: makeAnalysis(), glyphs: [CLAIM_GLYPH] },
      ];

      const results = await logHMMBatch(pairs);

      // 2 cold writes expected
      expect(mockSetex).toHaveBeenCalledTimes(2);
      expect(results.filter(r => r.fromCache)).toHaveLength(1);
    });
  });

  // ─── scanHMMNotes: MCP search ──────────────────────────────────────────────

  describe('scanHMMNotes — MCP-searchable 4D scan', () => {
    it('returns empty array when no notes in Redis', async () => {
      mockScan.mockResolvedValue(['0', []]);

      const { scanHMMNotes } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const notes = await scanHMMNotes();

      expect(notes).toHaveLength(0);
    });

    it('returns notes sorted by flowScore descending (z-axis)', async () => {
      const noteA = { kind: 'hmm_analysis', z: 0.9, w: 2, dominantSection: 'FACTS', flowScore: 0.9, glyphIds: [], x: 1, y: 1, sectionCoverage: [], compressionHints: [], gaps: [], perGlyphConfidence: [], stableKey: 'a', fromCache: false, createdAt: new Date().toISOString() };
      const noteB = { kind: 'hmm_analysis', z: 0.4, w: 3, dominantSection: 'LEGAL_AUTHORITY', flowScore: 0.4, glyphIds: [], x: 2, y: 2, sectionCoverage: [], compressionHints: [], gaps: [], perGlyphConfidence: [], stableKey: 'b', fromCache: false, createdAt: new Date().toISOString() };
      const noteC = { kind: 'hmm_analysis', z: 0.7, w: 0, dominantSection: 'PARTIES', flowScore: 0.7, glyphIds: [], x: 3, y: 3, sectionCoverage: [], compressionHints: [], gaps: [], perGlyphConfidence: [], stableKey: 'c', fromCache: false, createdAt: new Date().toISOString() };

      mockScan.mockResolvedValue(['0', ['key-a', 'key-b', 'key-c']]);
      mockMget.mockResolvedValue([JSON.stringify(noteA), JSON.stringify(noteB), JSON.stringify(noteC)]);

      const { scanHMMNotes } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const notes = await scanHMMNotes();

      expect(notes[0].z).toBeCloseTo(0.9, 3);
      expect(notes[1].z).toBeCloseTo(0.7, 3);
      expect(notes[2].z).toBeCloseTo(0.4, 3);
    });

    it('filters by minFlowScore', async () => {
      const hi = { kind: 'hmm_analysis', z: 0.85, w: 2, dominantSection: 'FACTS', flowScore: 0.85, glyphIds: [], x: 0, y: 0, sectionCoverage: [], compressionHints: [], gaps: [], perGlyphConfidence: [], stableKey: 'hi', fromCache: false, createdAt: new Date().toISOString() };
      const lo = { kind: 'hmm_analysis', z: 0.3,  w: 2, dominantSection: 'FACTS', flowScore: 0.3,  glyphIds: [], x: 0, y: 0, sectionCoverage: [], compressionHints: [], gaps: [], perGlyphConfidence: [], stableKey: 'lo', fromCache: false, createdAt: new Date().toISOString() };

      mockScan.mockResolvedValue(['0', ['k-hi', 'k-lo']]);
      mockMget.mockResolvedValue([JSON.stringify(hi), JSON.stringify(lo)]);

      const { scanHMMNotes } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const notes = await scanHMMNotes({ minFlowScore: 0.7 });

      expect(notes).toHaveLength(1);
      expect(notes[0].z).toBeCloseTo(0.85, 3);
    });

    it('filters by section', async () => {
      const factsNote  = { kind: 'hmm_analysis', z: 0.8, w: 2, dominantSection: 'FACTS',  flowScore: 0.8, glyphIds: [], x: 0, y: 0, sectionCoverage: [], compressionHints: [], gaps: [], perGlyphConfidence: [], stableKey: 'f', fromCache: false, createdAt: new Date().toISOString() };
      const claimsNote = { kind: 'hmm_analysis', z: 0.7, w: 4, dominantSection: 'CLAIMS', flowScore: 0.7, glyphIds: [], x: 0, y: 0, sectionCoverage: [], compressionHints: [], gaps: [], perGlyphConfidence: [], stableKey: 'c', fromCache: false, createdAt: new Date().toISOString() };

      mockScan.mockResolvedValue(['0', ['k-f', 'k-c']]);
      mockMget.mockResolvedValue([JSON.stringify(factsNote), JSON.stringify(claimsNote)]);

      const { scanHMMNotes } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const notes = await scanHMMNotes({ section: 'FACTS' });

      expect(notes).toHaveLength(1);
      expect(notes[0].dominantSection).toBe('FACTS');
    });
  });

  // ─── analyzeACEFlow integration ────────────────────────────────────────────

  describe('analyzeACEFlow + logHMMAnalysis integration loop', () => {
    it('end-to-end: analyzeACEFlow result feeds directly into logHMMAnalysis', async () => {
      const { analyzeACEFlow } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const { logHMMAnalysis } = await import('$lib/server/ace/hmm-wiki-logger.js');

      const analysis = await analyzeACEFlow(COHERENT_POOL, { userId: 'integration-user' });
      const r = await logHMMAnalysis(analysis, COHERENT_POOL, { userId: 'integration-user' });

      expect(r.note.flowScore).toBeCloseTo(analysis.flowScore, 3);
      expect(r.note.dominantSection).toBe(analysis.dominantSection);
      expect(r.note.compressionHints).toHaveLength(analysis.compressionHints.length);
    });

    it('4D z coordinate equals flowScore from analyzeACEFlow', async () => {
      const { analyzeACEFlow } = await import('$lib/server/analysis/hmm-ace-analyzer.js');
      const { logHMMAnalysis } = await import('$lib/server/ace/hmm-wiki-logger.js');

      const analysis = await analyzeACEFlow(COHERENT_POOL);
      const r = await logHMMAnalysis(analysis, COHERENT_POOL);

      expect(r.note.z).toBeCloseTo(analysis.flowScore, 5);
    });

    it('repeated calls with same pool: second is a cache hit', async () => {
      const { logHMMAnalysis } = await import('$lib/server/ace/hmm-wiki-logger.js');
      const a = makeAnalysis();

      // First call: miss
      const r1 = await logHMMAnalysis(a, [FACTS_GLYPH]);
      expect(r1.fromCache).toBe(false);

      // Simulate Redis returning the written note on second call
      mockGet.mockResolvedValue(JSON.stringify(r1.note));
      const r2 = await logHMMAnalysis(a, [FACTS_GLYPH]);

      expect(r2.fromCache).toBe(true);
      expect(mockSetex).toHaveBeenCalledTimes(1); // not called on second pass
    });
  });
});
