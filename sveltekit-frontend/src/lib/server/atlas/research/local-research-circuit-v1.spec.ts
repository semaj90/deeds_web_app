import { describe, expect, it } from 'vitest';
import { createResearchKernelSession } from './research-kernel-contract-v1.js';
import { buildResearchFetchPlanV1, runLocalResearchCircuitV1 } from './local-research-circuit-v1.js';

const session = createResearchKernelSession({ sessionId: 'session:1', candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'sha256:ordinal', workspaceRevision: 'sha256:workspace', budget: { maxRounds: 3, maxSubqueries: 4, maxOperations: 8, maxCards: 4, tokenBudget: 100 } });
const card = (id: string, ordinal: number) => ({ schema: 'atlas.ace-card.v2' as const, cardId: id, cardChecksum: `sha256:${id}`, cardKind: 'SOURCE' as const, candidateOrdinal: ordinal, workspaceRevision: session.workspaceRevision, sourceRevision: 'sha256:source', candidateSnapshotRevision: session.candidateSnapshotRevision, ordinalMapChecksum: session.ordinalMapChecksum, sourceRef: `src/${id}.ts`, evidenceRefs: [`e:${id}`], title: 'redis cache', lod0Identity: `src/${id}.ts`, lod1Structural: null, lod2Extractive: 'redis cache', lod3Semantic: null, lexicalTerms: ['redis', 'cache'], concepts: [], domains: [], tokenEstimate: 4, canonicalAuthority: false as const });

describe('LocalResearchCircuitV1', () => {
  it('reuses bounded operations and stops when coverage is sufficient', async () => {
    const result = await runLocalResearchCircuitV1({ session, query: 'redis cache', querySynthesis: () => ['redis', 'cache'], search: async (request) => ({ candidateOrdinals: [request.normalizedQuery === 'redis' ? 2 : 1], cards: [card(request.normalizedQuery, request.normalizedQuery === 'redis' ? 2 : 1)] }), coverage: (cards) => ({ sufficient: cards.length >= 2, missing: cards.length >= 2 ? [] : ['cache'] }) });
    expect(result.status).toBe('SUCCEEDED');
    expect(result.rounds).toBe(2);
    expect(result.candidateOrdinals).toEqual([1, 2]);
    expect(result.operations).toHaveLength(4);
  });

  it('is deterministic for the same injected search results', async () => {
    const run = () => runLocalResearchCircuitV1({ session, query: 'redis', search: async () => ({ candidateOrdinals: [2], cards: [card('a', 2)] }), coverage: () => ({ sufficient: true, missing: [] }) });
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.checksum).toBe(b.checksum);
  });

  it('coalesces normalized equivalent requests and reuses one fetched payload reference', async () => {
    const calls: string[] = [];
    const result = await runLocalResearchCircuitV1({
      session,
      query: 'redis cache',
      querySynthesis: () => [' redis  cache ', 'redis cache'],
      search: async (request) => {
        calls.push(request.requestId);
        return { candidateOrdinals: [2], cards: [card('shared-card', 2)] };
      },
      coverage: () => ({ sufficient: false, missing: ['more evidence'] }),
    });

    expect(calls).toHaveLength(1);
    expect(result.fetchPlan.requests).toHaveLength(1);
    expect(result.fetchPlan.queryPayloadRefs).toHaveLength(2);
    expect(new Set(result.fetchPlan.queryPayloadRefs.map((ref) => ref.requestId))).toEqual(new Set(calls));
    expect(result.fetchedPayloads).toHaveLength(1);
    expect(result.fetchedPayloads[0]?.cardIds).toEqual(['shared-card']);
  });

  it('does not coalesce request tuples across differing revision coordinates', () => {
    const plan = buildResearchFetchPlanV1([
      { query: 'redis cache', workspaceRevision: 'sha256:workspace', candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'sha256:ordinal' },
      { query: 'redis cache', workspaceRevision: 'sha256:workspace-next', candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'sha256:ordinal' },
      { query: 'redis cache', workspaceRevision: 'sha256:workspace', candidateSnapshotRevision: 'candidate:v2', ordinalMapChecksum: 'sha256:ordinal' },
      { query: 'redis cache', workspaceRevision: 'sha256:workspace', candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'sha256:ordinal-next' },
    ]);

    expect(plan.requests).toHaveLength(4);
    expect(new Set(plan.requests.map((request) => request.requestId)).size).toBe(4);
  });
});
