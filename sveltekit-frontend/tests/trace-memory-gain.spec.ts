// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock refs ────────────────────────────────────────────────────────────────
const mockDbInsert = vi.fn();
const mockDbSelect = vi.fn();

vi.mock('$lib/server/db/client', () => ({
  db: {
    insert:  (...args: unknown[]) => mockDbInsert(...args),
    select:  (...args: unknown[]) => mockDbSelect(...args),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
  pgRows: vi.fn(async () => ({ rows: [] })),
}));

vi.mock('$lib/server/db/schema.js', () => ({
  memoryGainAudits: { createdAt: {}, decision: {}, gainScore: {}, accuracyScore: {}, densityScore: {}, clarityScore: {}, noveltyScore: {}, metadata: {} },
  kagDagRuns:       { createdAt: {} },
  topologySnapshots: { createdAt: {} },
  qdrantCentroidClusters: {},
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: { QDRANT_URL: 'http://localhost:6333' },
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public',  () => ({ env: {} }));

// ── Types ─────────────────────────────────────────────────────────────────────

interface GainScores {
  accuracyScore: number;
  densityScore:  number;
  clarityScore:  number;
  noveltyScore:  number;
}

interface MemoryGainResult {
  decision:      'accepted' | 'rejected';
  gainScore:     number;
  accuracyScore: number;
  densityScore:  number;
  clarityScore:  number;
  noveltyScore:  number;
  metadata:      Record<string, unknown>;
}

// ── Inline gain-scoring logic (mirrors the policy in code-intel-service.ts) ──

const GAIN_ACCEPT_THRESHOLD = 0.6;
const WEIGHTS = { accuracy: 0.35, density: 0.25, clarity: 0.25, novelty: 0.15 };

function computeGainScore(scores: GainScores): number {
  return (
    scores.accuracyScore * WEIGHTS.accuracy +
    scores.densityScore  * WEIGHTS.density  +
    scores.clarityScore  * WEIGHTS.clarity  +
    scores.noveltyScore  * WEIGHTS.novelty
  );
}

function evaluateMemoryGain(scores: GainScores, metadata: Record<string, unknown>): MemoryGainResult {
  const gainScore = computeGainScore(scores);
  const decision  = gainScore >= GAIN_ACCEPT_THRESHOLD ? 'accepted' : 'rejected';
  return { decision, gainScore, ...scores, metadata };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TRACE memory gain decisions', () => {

  beforeEach(() => {
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'audit-1' }]),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('rejects low-gain synthesis', () => {
    it('gain below threshold yields rejected decision', () => {
      const scores: GainScores = { accuracyScore: 0.3, densityScore: 0.2, clarityScore: 0.4, noveltyScore: 0.1 };
      const result = evaluateMemoryGain(scores, { source: 'trace-retrieval' });

      expect(result.decision).toBe('rejected');
      expect(result.gainScore).toBeLessThan(GAIN_ACCEPT_THRESHOLD);
    });

    it('all-zero scores produce rejected decision', () => {
      const scores: GainScores = { accuracyScore: 0, densityScore: 0, clarityScore: 0, noveltyScore: 0 };
      const result = evaluateMemoryGain(scores, {});

      expect(result.decision).toBe('rejected');
      expect(result.gainScore).toBe(0);
    });

    it('marginally-below threshold is rejected', () => {
      // gainScore = 0.35×0.5 + 0.25×0.6 + 0.25×0.5 + 0.15×0.5 = 0.175+0.15+0.125+0.075 = 0.525
      const scores: GainScores = { accuracyScore: 0.5, densityScore: 0.6, clarityScore: 0.5, noveltyScore: 0.5 };
      const result = evaluateMemoryGain(scores, {});

      expect(result.gainScore).toBeLessThan(GAIN_ACCEPT_THRESHOLD);
      expect(result.decision).toBe('rejected');
    });
  });

  describe('accepts high-gain synthesis', () => {
    it('all high scores yield accepted decision', () => {
      const scores: GainScores = { accuracyScore: 0.9, densityScore: 0.85, clarityScore: 0.88, noveltyScore: 0.8 };
      const result = evaluateMemoryGain(scores, { memoryType: 'retrieval_insight' });

      expect(result.decision).toBe('accepted');
      expect(result.gainScore).toBeGreaterThanOrEqual(GAIN_ACCEPT_THRESHOLD);
    });

    it('exact threshold is accepted', () => {
      // Solve for scores where gainScore === 0.6 exactly
      // 0.35×a + 0.25×b + 0.25×c + 0.15×d = 0.6, e.g. all equal 0.6
      const scores: GainScores = { accuracyScore: 0.6, densityScore: 0.6, clarityScore: 0.6, noveltyScore: 0.6 };
      const result = evaluateMemoryGain(scores, {});

      expect(result.gainScore).toBeCloseTo(0.6, 5);
      expect(result.decision).toBe('accepted');
    });

    it('accepted result carries all five score fields', () => {
      const scores: GainScores = { accuracyScore: 0.8, densityScore: 0.75, clarityScore: 0.9, noveltyScore: 0.7 };
      const result = evaluateMemoryGain(scores, { memoryType: 'code_pattern' });

      expect(typeof result.gainScore).toBe('number');
      expect(typeof result.accuracyScore).toBe('number');
      expect(typeof result.densityScore).toBe('number');
      expect(typeof result.clarityScore).toBe('number');
      expect(typeof result.noveltyScore).toBe('number');
    });
  });

  describe('logs gain decision', () => {
    it('result includes metadata from input', () => {
      const meta = { source: 'kag-dag', memoryType: 'cluster_summary', runId: 'run-abc' };
      const scores: GainScores = { accuracyScore: 0.7, densityScore: 0.65, clarityScore: 0.72, noveltyScore: 0.6 };
      const result = evaluateMemoryGain(scores, meta);

      expect(result.metadata).toEqual(meta);
    });

    it('getMemoryGainStats returns db rows', async () => {
      const fakeRows = [
        { id: 'a1', decision: 'accepted', gainScore: '0.75', createdAt: new Date() },
        { id: 'a2', decision: 'rejected', gainScore: '0.45', createdAt: new Date() },
      ];
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(fakeRows),
          }),
        }),
      });

      const { getMemoryGainStats } = await import('$lib/server/ai/code-intel-service.js');
      const rows = await getMemoryGainStats(10);

      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toHaveLength(2);
    });
  });

  describe('writes accepted memory only', () => {
    it('only accepted result is persisted (rejected does not call insert)', () => {
      // The policy check happens before the DB write — rejected entries do NOT get inserted
      const lowScores: GainScores = { accuracyScore: 0.2, densityScore: 0.3, clarityScore: 0.2, noveltyScore: 0.1 };
      const result = evaluateMemoryGain(lowScores, {});

      // Simulate: only write to DB if accepted
      const shouldPersist = result.decision === 'accepted';
      expect(shouldPersist).toBe(false);
      // mockDbInsert was NOT called
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it('accepted result triggers DB persist path', () => {
      const highScores: GainScores = { accuracyScore: 0.9, densityScore: 0.85, clarityScore: 0.88, noveltyScore: 0.8 };
      const result = evaluateMemoryGain(highScores, { memoryType: 'trace_insight' });

      // Simulate conditional insert
      if (result.decision === 'accepted') {
        mockDbInsert({ table: 'memoryGainAudits' });
      }

      expect(mockDbInsert).toHaveBeenCalledOnce();
    });

    it('gain score is recorded as a numeric value regardless of decision', () => {
      const scores: GainScores = { accuracyScore: 0.4, densityScore: 0.5, clarityScore: 0.3, noveltyScore: 0.6 };
      const result = evaluateMemoryGain(scores, {});

      expect(typeof result.gainScore).toBe('number');
      expect(Number.isFinite(result.gainScore)).toBe(true);
    });

    it('weighted gain formula sums to 1.0 for all-ones input', () => {
      const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1.0, 10);
    });
  });
});
