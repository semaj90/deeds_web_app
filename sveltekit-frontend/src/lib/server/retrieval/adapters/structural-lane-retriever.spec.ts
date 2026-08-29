import { describe, expect, it } from 'vitest';
import { structuralLaneHitsToCandidates } from './structural-lane-retriever.js';

const hit = (overrides: Partial<Parameters<typeof structuralLaneHitsToCandidates>[0][number]> = {}) => ({
  observationId: 'obs-1', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', byteStart: 1, byteEnd: 5,
  candidateOrdinal: 2, canonicalId: 'candidate-2', packetKey: 'packet-2', identityStatus: 'RESOLVED_EXACT' as const,
  structuralRank: 1, confidence: 1, matchReason: ['NODE_KIND'],
  astGraphRevision: null, compilerSemanticGraphRevision: null,
  patternId: 'pattern-1', patternRevision: 'pattern:v1', scoreClass: 'EXACT_PATTERN' as const, ...overrides,
});

describe('structural lane retriever bridge', () => {
  it('projects exact identities into the existing ast lane', () => {
    const candidates = structuralLaneHitsToCandidates([hit()], 'sha256:workspace');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ lane: 'ast', packetKey: 'packet-2', rank: 1, workspaceRevision: 'sha256:workspace' });
    expect(candidates[0]?.metadata).toMatchObject({ score_class: 'EXACT_PATTERN', pattern_revision: 'pattern:v1' });
  });

  it('drops unresolved identities and deduplicates packet keys deterministically', () => {
    const candidates = structuralLaneHitsToCandidates([
      hit({ observationId: 'obs-2', structuralRank: 2 }),
      hit({ observationId: 'obs-bad', identityStatus: 'AMBIGUOUS_SOURCE' }),
      hit({ observationId: 'obs-3', packetKey: 'packet-3', canonicalId: 'candidate-3', candidateOrdinal: 3, structuralRank: 3 }),
    ], 'sha256:workspace');
    expect(candidates.map((candidate) => candidate.packetKey)).toEqual(['packet-2', 'packet-3']);
  });
});
