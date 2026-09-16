import { describe, expect, it } from 'vitest';
import { buildCandidateManifestV1, decodeCandidateCursorV1, encodeCandidateCursorV1, sliceCandidateManifestPageV1 } from './candidate-manifest-v1.js';

describe('CandidateManifestV1', () => {
  it('freezes deterministic candidate order and checksum', () => {
    const input = { requestId: 'req-1', workspaceRevision: 'sha256:workspace', rankingRevision: 'rank:v1', orderedCandidateIds: ['chunk-a', 'chunk-b'] };
    expect(buildCandidateManifestV1(input)).toEqual(buildCandidateManifestV1(input));
  });

  it('rejects duplicate or empty candidate identities', () => {
    expect(() => buildCandidateManifestV1({ requestId: 'r', workspaceRevision: 'w', rankingRevision: 'v', orderedCandidateIds: ['a', 'a'] })).toThrow(/duplicate/);
    expect(() => buildCandidateManifestV1({ requestId: 'r', workspaceRevision: 'w', rankingRevision: 'v', orderedCandidateIds: [''] })).toThrow(/non-empty/);
  });

  it('round-trips a checksum-bound cursor and rejects another set', () => {
    const manifest = buildCandidateManifestV1({ requestId: 'r', workspaceRevision: 'w', rankingRevision: 'v', orderedCandidateIds: ['a'] });
    const encoded = encodeCandidateCursorV1({ candidateSetChecksum: manifest.candidateSetChecksum, lastScore: 0.5, lastCanonicalChunkId: 'a' });
    expect(decodeCandidateCursorV1(encoded, manifest.candidateSetChecksum).lastCanonicalChunkId).toBe('a');
    expect(() => decodeCandidateCursorV1(encoded, 'sha256:' + '0'.repeat(64))).toThrow(/set mismatch/);
  });

  it('slices pages from frozen order and resumes after the canonical identity', () => {
    const manifest = buildCandidateManifestV1({ requestId: 'r', workspaceRevision: 'w', rankingRevision: 'v', orderedCandidateIds: ['a', 'b', 'c'] });
    const candidates = new Map([['a', { score: 0.9 }], ['b', { score: 0.8 }], ['c', { score: 0.7 }]]);
    const first = sliceCandidateManifestPageV1(manifest, candidates, 2);
    expect(first.candidateIds).toEqual(['a', 'b']);
    expect(first.hasMore).toBe(true);
    expect(sliceCandidateManifestPageV1(manifest, candidates, 2, first.nextCursor).candidateIds).toEqual(['c']);
  });

  it('rejects an incomplete candidate set instead of silently skipping a member', () => {
    const manifest = buildCandidateManifestV1({ requestId: 'r', workspaceRevision: 'w', rankingRevision: 'v', orderedCandidateIds: ['a', 'b'] });
    expect(() => sliceCandidateManifestPageV1(manifest, new Map([['a', { score: 0.9 }]]), 1)).toThrow(/incomplete candidate set/);
  });
});
