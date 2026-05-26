import { describe, expect, it } from 'vitest';

import { buildSummaryCardPromptSection, rankSummaryCardCandidates } from './summary-card-retrieval.js';

describe('rankSummaryCardCandidates', () => {
  it('ranks higher-signal codebase cards first', () => {
    const ranked = rankSummaryCardCandidates('summary card retrieval redis qdrant', [
      {
        cardKey: 'card:low',
        path: 'src/lib/server/analytics/placeholder.ts',
        summaryType: 'file_summary',
        summary: 'General analytics helper.',
        labels: ['analytics'],
        score: 0.12,
        postgresScore: 0.05,
        qdrantScore: 0.04,
      },
      {
        cardKey: 'card:high',
        path: 'src/lib/server/retrieval/summary-card-retrieval.ts',
        summaryType: 'database_touchpoint',
        summary: 'Retrieves summary cards from Redis, Postgres, and Qdrant.',
        labels: ['retrieval', 'redis', 'qdrant'],
        tables: ['summary_cards'],
        routes: ['api/sse/chat'],
        score: 0.4,
        postgresScore: 0.7,
        qdrantScore: 0.83,
      },
    ]);

    expect(ranked[0]?.cardKey).toBe('card:high');
    expect(ranked[0]?.graphNeighbors.length).toBeGreaterThan(0);
  });
});

describe('buildSummaryCardPromptSection', () => {
  it('renders a compact retrieval packet', () => {
    const section = buildSummaryCardPromptSection([
      {
        cardKey: 'card:high',
        path: 'src/lib/server/retrieval/summary-card-retrieval.ts',
        summaryType: 'database_touchpoint',
        summary: 'Retrieves summary cards from Redis, Postgres, and Qdrant.',
        labels: ['retrieval', 'redis', 'qdrant'],
        routes: ['api/sse/chat'],
        tables: ['summary_cards'],
        tools: ['trace.kag_search'],
        dependencies: ['redis', 'postgres', 'qdrant'],
        sourceRefs: ['docs/graph/codebase-map.md'],
        graphNeighbors: ['api/sse/chat', 'summary_cards'],
        score: 0.88,
        qdrantScore: 0.81,
        postgresScore: 0.76,
        redisCacheHit: true,
        source: 'hybrid',
      },
    ]);

    expect(section).toContain('## Summary Cards');
    expect(section).toContain('src/lib/server/retrieval/summary-card-retrieval.ts');
    expect(section).toContain('redis:hit');
  });
});
