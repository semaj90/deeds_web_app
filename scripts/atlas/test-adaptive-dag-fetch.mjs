import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchFetchPlanV1 } from '../../sveltekit-frontend/src/lib/server/atlas/research/local-research-circuit-v1.js';
import { executeAdaptiveDagFetch } from '../../sveltekit-frontend/src/lib/server/retrieval/adaptive-dag-fetch.js';

test('adaptive-dag-fetch (DAG-FETCH-01) coalesces normalized subqueries while preserving distinct cards', async () => {
  const requests = [
    { query: '  redis  cache  ', workspaceRevision: 'ws:rev1', candidateSnapshotRevision: 'snap:rev1', ordinalMapChecksum: 'sha256:ordmap' },
    { query: 'redis cache', workspaceRevision: 'ws:rev1', candidateSnapshotRevision: 'snap:rev1', ordinalMapChecksum: 'sha256:ordmap' },
    { query: 'redis   cache', workspaceRevision: 'ws:rev1', candidateSnapshotRevision: 'snap:rev1', ordinalMapChecksum: 'sha256:ordmap' },
  ];

  const plan = buildResearchFetchPlanV1(requests);

  // Proves coalescing: 3 input queries produce 1 unique request
  assert.equal(plan.requests.length, 1);
  assert.equal(plan.requests[0].normalizedQuery, 'redis cache');
  assert.equal(plan.queryPayloadRefs.length, 3);
  assert.equal(plan.requests[0].sourceQueries.length, 3);

  // Proves distinct revisions do not coalesce
  const diversePlan = buildResearchFetchPlanV1([
    { query: 'redis cache', workspaceRevision: 'ws:rev1', candidateSnapshotRevision: 'snap:rev1', ordinalMapChecksum: 'sha256:ordmap' },
    { query: 'redis cache', workspaceRevision: 'ws:rev2', candidateSnapshotRevision: 'snap:rev1', ordinalMapChecksum: 'sha256:ordmap' },
  ]);
  assert.equal(diversePlan.requests.length, 2);
});

test('executeAdaptiveDagFetch dispatches single upstream search for equivalent aliases', async () => {
  let searchInvocations = 0;
  const mockCard = (id, ord) => ({
    schema: 'atlas.ace-card.v2',
    cardId: id,
    cardChecksum: `sha256:${id}`,
    cardKind: 'SOURCE',
    candidateOrdinal: ord,
    workspaceRevision: 'ws:rev1',
    sourceRevision: 'src:rev1',
    candidateSnapshotRevision: 'snap:rev1',
    ordinalMapChecksum: 'sha256:ordmap',
    sourceRef: `src/${id}.ts`,
    evidenceRefs: [`ev:${id}`],
    title: `Card ${id}`,
    lod0Identity: `src/${id}.ts`,
    lod1Structural: null,
    lod2Extractive: `Snippet ${id}`,
    lod3Semantic: null,
    lexicalTerms: [id],
    concepts: [],
    domains: [],
    tokenEstimate: 5,
    canonicalAuthority: false,
  });

  const result = await executeAdaptiveDagFetch({
    queries: ['  cache  ttl ', 'cache ttl'],
    workspaceRevision: 'ws:rev1',
    candidateSnapshotRevision: 'snap:rev1',
    ordinalMapChecksum: 'sha256:ordmap',
    searchFn: async (req) => {
      searchInvocations++;
      return {
        candidateOrdinals: [42],
        cards: [mockCard('card-ttl', 42)],
      };
    },
  });

  assert.equal(searchInvocations, 1);
  assert.equal(result.uniqueFetchCount, 1);
  assert.equal(result.totalSubqueries, 2);
  assert.equal(result.allCards.length, 1);
  assert.equal(result.allCards[0].cardId, 'card-ttl');
  assert.deepEqual(result.allCandidateOrdinals, [42]);
});

