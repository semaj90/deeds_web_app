import { describe, expect, it } from 'vitest';
import { AceCardV2Schema, selectAceCardsV2 } from './ace-card-selection-v2.js';

const base = { schema: 'atlas.ace-card.v2' as const, cardId: 'card:a', cardChecksum: 'sha256:card', cardKind: 'SOURCE' as const, candidateOrdinal: 0, workspaceRevision: 'sha256:workspace', sourceRevision: 'sha256:source', candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'sha256:ordinal', sourceRef: 'src/a.ts', evidenceRefs: ['e1'], title: 'Redis cache', lod0Identity: 'src/a.ts', lod1Structural: null, lod2Extractive: 'cache', lod3Semantic: null, lexicalTerms: ['redis', 'cache'], concepts: [], domains: ['infrastructure'], tokenEstimate: 5, canonicalAuthority: false as const };

describe('ACE Card Selection V2', () => {
  it('selects revision-eligible cards within the token budget', () => {
    const result = selectAceCardsV2({ cards: [AceCardV2Schema.parse(base)], query: 'redis cache', workspaceRevision: 'sha256:workspace', candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'sha256:ordinal', maxCards: 2, tokenBudget: 5 });
    expect(result.selected).toHaveLength(1);
    expect(result.estimatedTokens).toBe(5);
  });

  it('rejects stale cards before scoring', () => {
    const result = selectAceCardsV2({ cards: [AceCardV2Schema.parse({ ...base, workspaceRevision: 'sha256:old' })], query: 'redis', workspaceRevision: 'sha256:workspace', candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'sha256:ordinal', maxCards: 2, tokenBudget: 10 });
    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('WORKSPACE_REVISION_MISMATCH');
  });
});
