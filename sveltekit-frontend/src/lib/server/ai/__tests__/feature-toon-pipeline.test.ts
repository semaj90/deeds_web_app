import { describe, expect, it } from 'vitest';
import { buildFeatureLabels } from '../feature-builder.js';
import { rerankFeaturesWithBreakdown } from '../toon.js';

describe('feature label builder', () => {
  it('normalizes trace.results payloads', () => {
    const trace = {
      results: [
        {
          file_path: 'src/a.ts',
          feature: 'chat',
          tags: ['sse', 'stream'],
          summary: 'chat stream handler',
          symbol_name: 'handleQuery',
          lexical_score: 0.41,
        },
      ],
    };

    const out = buildFeatureLabels({ trace });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      path: 'src/a.ts',
      feature: 'chat',
      labels: ['sse', 'stream'],
      summary: 'chat stream handler',
      symbols: ['handleQuery'],
      score: 0.41,
    });
  });

  it('normalizes trace.data payloads and merges linked symbols', () => {
    const trace = {
      data: [
        {
          path: 'src/b.ts',
          tags: ['graph'],
          content: 'graph expansion context',
          score: 0.5,
        },
      ],
    };

    const out = buildFeatureLabels({
      trace,
      symbols: {
        'src/b.ts': ['expandNeighborhood'],
      },
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      path: 'src/b.ts',
      feature: 'graph',
      labels: ['graph'],
      summary: 'graph expansion context',
      symbols: ['expandNeighborhood'],
      score: 0.5,
    });
  });
});

describe('TOON reranker', () => {
  it('returns ranked features with score breakdown', () => {
    const features = [
      {
        path: 'a.ts',
        feature: 'chat',
        labels: ['sse', 'stream'],
        summary: 'chat stream',
        symbols: [],
        score: 0.2,
      },
      {
        path: 'b.ts',
        feature: 'db',
        labels: ['postgres'],
        summary: 'database layer',
        symbols: [],
        score: 0.9,
      },
      {
        path: 'c.ts',
        feature: 'chat',
        labels: ['trace', 'kag'],
        summary: 'trace retrieval for chat',
        symbols: [],
        score: 0.4,
      },
    ];

    const out = rerankFeaturesWithBreakdown('chat stream trace', features);

    expect(out.features.slice(0, 2).map((entry) => entry.path)).toEqual(['c.ts', 'a.ts']);
    expect(out.breakdown).toHaveLength(3);
    expect(out.breakdown[0]).toMatchObject({
      path: 'c.ts',
    });
    expect(typeof out.breakdown[0].baseScore).toBe('number');
    expect(typeof out.breakdown[0].tokenOverlap).toBe('number');
    expect(typeof out.breakdown[0].overlapBoost).toBe('number');
    expect(typeof out.breakdown[0].summaryBoost).toBe('number');
    expect(typeof out.breakdown[0].finalScore).toBe('number');
  });
});
