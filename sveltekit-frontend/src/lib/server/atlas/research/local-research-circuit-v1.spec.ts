import { describe, expect, it } from 'vitest';
import { createResearchKernelSession } from './research-kernel-contract-v1.js';
import { runLocalResearchCircuitV1 } from './local-research-circuit-v1.js';

const session = createResearchKernelSession({ sessionId: 'session:1', candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'sha256:ordinal', workspaceRevision: 'sha256:workspace', budget: { maxRounds: 3, maxSubqueries: 4, maxOperations: 8, maxCards: 4, tokenBudget: 100 } });
const card = (id: string, ordinal: number) => ({ schema: 'atlas.ace-card.v2' as const, cardId: id, cardChecksum: `sha256:${id}`, cardKind: 'SOURCE' as const, candidateOrdinal: ordinal, workspaceRevision: session.workspaceRevision, sourceRevision: 'sha256:source', candidateSnapshotRevision: session.candidateSnapshotRevision, ordinalMapChecksum: session.ordinalMapChecksum, sourceRef: `src/${id}.ts`, evidenceRefs: [`e:${id}`], title: 'redis cache', lod0Identity: `src/${id}.ts`, lod1Structural: null, lod2Extractive: 'redis cache', lod3Semantic: null, lexicalTerms: ['redis', 'cache'], concepts: [], domains: [], tokenEstimate: 4, canonicalAuthority: false as const });

describe('LocalResearchCircuitV1', () => {
  it('reuses bounded operations and stops when coverage is sufficient', async () => {
    const result = await runLocalResearchCircuitV1({ session, query: 'redis cache', querySynthesis: () => ['redis', 'cache'], search: async (subquery) => ({ candidateOrdinals: [subquery === 'redis' ? 2 : 1], cards: [card(subquery, subquery === 'redis' ? 2 : 1)] }), coverage: (cards) => ({ sufficient: cards.length >= 2, missing: cards.length >= 2 ? [] : ['cache'] }) });
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
});
