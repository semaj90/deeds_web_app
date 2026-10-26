import { describe, expect, it } from 'vitest';
import { executeAdaptiveDagFetch } from './adaptive-dag-fetch.js';
import type { AceCardV2 } from '../atlas/context/ace-card-selection-v2.js';

const mockCard = (id: string, ordinal: number, sourceRef: string): AceCardV2 => ({
  schema: 'atlas.ace-card.v2',
  cardId: id,
  cardChecksum: `sha256:${id}`,
  cardKind: 'SOURCE',
  candidateOrdinal: ordinal,
  workspaceRevision: 'ws:rev1',
  sourceRevision: 'src:rev1',
  candidateSnapshotRevision: 'snap:rev1',
  ordinalMapChecksum: 'sha256:ordmap',
  sourceRef,
  evidenceRefs: [`ev:${id}`],
  title: `Card ${id}`,
  lod0Identity: sourceRef,
  lod1Structural: null,
  lod2Extractive: `Snippet for ${id}`,
  lod3Semantic: null,
  lexicalTerms: [id],
  concepts: [],
  domains: [],
  tokenEstimate: 10,
  canonicalAuthority: false,
});

describe('adaptive-dag-fetch (DAG-FETCH-01)', () => {
  it('coalesces equivalent normalized queries into a single upstream fetch callback', async () => {
    let callCount = 0;
    const searchCalls: string[] = [];

    const result = await executeAdaptiveDagFetch({
      queries: ['  redis  cache  ', 'redis cache', 'redis   cache'],
      workspaceRevision: 'ws:rev1',
      candidateSnapshotRevision: 'snap:rev1',
      ordinalMapChecksum: 'sha256:ordmap',
      searchFn: async (req) => {
        callCount++;
        searchCalls.push(req.normalizedQuery);
        return {
          candidateOrdinals: [1, 2],
          cards: [
            mockCard('card-1', 1, 'src/redis.ts'),
            mockCard('card-2', 2, 'src/cache.ts'),
          ],
        };
      },
    });

    // Proves coalescing: 3 input queries resulted in only 1 upstream search call
    expect(callCount).toBe(1);
    expect(searchCalls).toEqual(['redis cache']);
    expect(result.uniqueFetchCount).toBe(1);
    expect(result.totalSubqueries).toBe(3);

    // Proves all original queries can read the fetched payload
    expect(result.resultsByQuery.size).toBe(3);
    expect(result.allCards).toHaveLength(2);
    expect(result.allCandidateOrdinals).toEqual([1, 2]);
  });

  it('preserves distinct card identities even when evidence references overlap', async () => {
    const cardA = mockCard('card-A', 10, 'src/module-a.ts');
    const cardB = mockCard('card-B', 11, 'src/module-b.ts');

    const result = await executeAdaptiveDagFetch({
      queries: ['query a', 'query b'],
      workspaceRevision: 'ws:rev1',
      candidateSnapshotRevision: 'snap:rev1',
      ordinalMapChecksum: 'sha256:ordmap',
      searchFn: async (req) => {
        if (req.normalizedQuery === 'query a') {
          return { candidateOrdinals: [10], cards: [cardA] };
        }
        return { candidateOrdinals: [11], cards: [cardB] };
      },
    });

    expect(result.uniqueFetchCount).toBe(2);
    expect(result.allCards.map((c) => c.cardId)).toEqual(['card-A', 'card-B']);
    expect(result.allCandidateOrdinals).toEqual([10, 11]);
  });
});
