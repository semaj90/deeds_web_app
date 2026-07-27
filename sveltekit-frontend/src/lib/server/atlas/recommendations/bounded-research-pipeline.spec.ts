import { describe, expect, it } from 'vitest';
import {
  buildResearchEvidenceBundle,
  recommendationCategory,
  selectBoundedRecommendations,
} from './bounded-research-pipeline.js';

describe('bounded research pipeline', () => {
  it('prefers one item from each category before filling the remaining visible slots', () => {
    const items = [
      { title: 'Validation proof', score: 0.96, explanationTokens: ['smoke', 'gate'], type: 'review' },
      { title: 'Integration bridge', score: 0.94, explanationTokens: ['route', 'adapter'], type: 'system' },
      { title: 'Performance lane', score: 0.92, explanationTokens: ['gpu', 'latency'], type: 'system' },
      { title: 'Research worker', score: 0.90, explanationTokens: ['citation', 'source'], type: 'research' },
      { title: 'General follow-up', score: 0.88, explanationTokens: ['misc'], type: 'review' },
      { title: 'Overflow candidate', score: 0.87, explanationTokens: ['misc'], type: 'review' },
    ];

    const selection = selectBoundedRecommendations(items, 4);

    expect(selection.ready).toHaveLength(4);
    expect(selection.potential).toHaveLength(2);
    expect(selection.categorySummary.validation).toBe(1);
    expect(selection.categorySummary.integration).toBe(1);
    expect(selection.categorySummary.performance).toBe(1);
    expect(selection.categorySummary.research).toBe(1);
  });

  it('builds an evidence bundle with an explicit evidence state', () => {
    const bundle = buildResearchEvidenceBundle({
      query: 'bounded recommendation pipeline',
      research: {
        plan: 'bounded',
        answer: 'summary',
        artifacts: ['source:1'],
        activeClusterIds: ['cluster:1'],
        contextPacket: { jobId: 'job-1' },
      },
      evidenceState: 'ACTIVE_DEGRADED',
    });

    expect(bundle.evidenceState).toBe('ACTIVE_DEGRADED');
    expect(bundle.query).toBe('bounded recommendation pipeline');
    expect(bundle.sourceRefs).toEqual(['source:1']);
    expect(bundle.activeClusterIds).toEqual(['cluster:1']);
    expect(bundle.sourceSnapshotSha256).toHaveLength(64);
  });

  it('classifies recommendation text into a category', () => {
    expect(recommendationCategory({ title: 'Run smoke test', score: 0.8, type: 'review' })).toBe('validation');
    expect(recommendationCategory({ title: 'Wire adapter', score: 0.8, type: 'system' })).toBe('integration');
    expect(recommendationCategory({ title: 'GPU rerank', score: 0.8, type: 'system' })).toBe('performance');
    expect(recommendationCategory({ title: 'Collect citations', score: 0.8, type: 'research' })).toBe('research');
  });
});
