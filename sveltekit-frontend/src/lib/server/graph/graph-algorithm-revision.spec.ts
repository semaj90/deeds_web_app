import { describe, expect, it } from 'vitest';
import { graphAlgorithmRevision } from './graph-algorithm-revision.js';

describe('graph algorithm revisions', () => {
  it('uses concrete revisions for wired adapters', () => {
    expect(graphAlgorithmRevision('cheirank')).toBe('neo4j-gds-cheirank-reverse-pagerank-mutate-v1');
    expect(graphAlgorithmRevision('kcore')).toBe('neo4j-gds-kcore-mutate-v1');
    expect(graphAlgorithmRevision('betweenness')).toBe('neo4j-gds-betweenness-exact-v1');
  });

  it('keeps unsupported personalized PageRank explicitly non-promoted', () => {
    expect(graphAlgorithmRevision('personalized_pagerank')).toBe('unsupported-personalized-pagerank-v1');
  });
});
