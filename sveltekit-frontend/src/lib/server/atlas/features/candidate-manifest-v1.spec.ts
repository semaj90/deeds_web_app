import { describe, expect, it } from 'vitest';

import { canonicalCandidateV1Schema } from './canonical-candidate-v1.js';
import {
  CANDIDATE_MANIFEST_V1_INVARIANTS,
  decodeCandidateCursorV1,
  materializeCandidateManifestV1,
  paginateCandidateManifestV1,
} from './candidate-manifest-v1.js';

function candidate(index: number, overrides: Record<string, unknown> = {}) {
  return canonicalCandidateV1Schema.parse({
    schema: 'atlas.canonical-candidate.v1',
    candidateOrdinal: index,
    canonicalId: `candidate-${index}`,
    packetKey: `packet-${index}`,
    sourceRef: `src/file-${index}.ts`,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: 'workspace-r1',
    sourceRevision: `source-r${index}`,
    graphRevision: null,
    semanticRevision: 'semantic-r1',
    candidateSnapshotRevision: 'snapshot-r1',
    degradedIdentity: false,
    evidenceRefs: [`evidence-${index}`],
    representationBindings: [],
    ...overrides,
  });
}

describe('CandidateManifestV1', () => {
  it('freezes the supplied post-rerank order and paginates over the same universe', () => {
    const manifest = materializeCandidateManifestV1({
      requestId: 'request-1',
      rankingRevision: 'ranker-r1',
      rankedCandidates: [
        { candidate: candidate(2), finalScore: 0.91 },
        { candidate: candidate(0), finalScore: 0.84 },
        { candidate: candidate(1), finalScore: 0.72 },
      ],
    });

    expect(manifest.orderedCandidates.map((row) => row.candidate.canonicalId)).toEqual([
      'candidate-2',
      'candidate-0',
      'candidate-1',
    ]);
    expect(manifest.canonicalAuthority).toBe(false);
    expect(CANDIDATE_MANIFEST_V1_INVARIANTS.paginationStage).toBe('AFTER_RERANK');

    const first = paginateCandidateManifestV1({ manifest, pageSize: 2 });
    expect(first.rows.map((row) => row.rank)).toEqual([0, 1]);
    expect(first.nextCursor).not.toBeNull();

    const decoded = decodeCandidateCursorV1(first.nextCursor!);
    expect(decoded.candidateSetChecksum).toBe(manifest.candidateSetChecksum);
    expect(decoded.rankingRevision).toBe('ranker-r1');
    expect(decoded.lastCanonicalId).toBe('candidate-0');

    const second = paginateCandidateManifestV1({ manifest, pageSize: 2, cursor: first.nextCursor });
    expect(second.rows.map((row) => row.rank)).toEqual([2]);
    expect(second.nextCursor).toBeNull();
  });

  it('changes the candidate-set checksum when ranking order changes', () => {
    const a = materializeCandidateManifestV1({
      requestId: 'request-a',
      rankingRevision: 'ranker-r1',
      rankedCandidates: [
        { candidate: candidate(0), finalScore: 0.9 },
        { candidate: candidate(1), finalScore: 0.8 },
      ],
    });
    const b = materializeCandidateManifestV1({
      requestId: 'request-b',
      rankingRevision: 'ranker-r1',
      rankedCandidates: [
        { candidate: candidate(1), finalScore: 0.8 },
        { candidate: candidate(0), finalScore: 0.9 },
      ],
    });
    expect(a.candidateSetChecksum).not.toBe(b.candidateSetChecksum);
  });

  it('rejects replaying a cursor against a different ranking revision', () => {
    const original = materializeCandidateManifestV1({
      requestId: 'request-1',
      rankingRevision: 'ranker-r1',
      rankedCandidates: [
        { candidate: candidate(0), finalScore: 0.9 },
        { candidate: candidate(1), finalScore: 0.8 },
      ],
    });
    const page = paginateCandidateManifestV1({ manifest: original, pageSize: 1 });
    const changed = materializeCandidateManifestV1({
      requestId: 'request-1',
      rankingRevision: 'ranker-r2',
      rankedCandidates: [
        { candidate: candidate(0), finalScore: 0.9 },
        { candidate: candidate(1), finalScore: 0.8 },
      ],
    });
    expect(() => paginateCandidateManifestV1({ manifest: changed, pageSize: 1, cursor: page.nextCursor })).toThrow();
  });

  it('rejects mixed candidate snapshot revisions', () => {
    expect(() => materializeCandidateManifestV1({
      requestId: 'request-1',
      rankingRevision: 'ranker-r1',
      rankedCandidates: [
        { candidate: candidate(0), finalScore: 0.9 },
        { candidate: candidate(1, { candidateSnapshotRevision: 'snapshot-r2' }), finalScore: 0.8 },
      ],
    })).toThrow('CANDIDATE_MANIFEST_SNAPSHOT_REVISION_MIXED');
  });

  it('rejects duplicate candidate identity or ordinal', () => {
    expect(() => materializeCandidateManifestV1({
      requestId: 'request-1',
      rankingRevision: 'ranker-r1',
      rankedCandidates: [
        { candidate: candidate(0), finalScore: 0.9 },
        { candidate: candidate(1, { canonicalId: 'candidate-0' }), finalScore: 0.8 },
      ],
    })).toThrow(/CANDIDATE_MANIFEST_CANONICAL_ID_DUPLICATE/);

    expect(() => materializeCandidateManifestV1({
      requestId: 'request-1',
      rankingRevision: 'ranker-r1',
      rankedCandidates: [
        { candidate: candidate(0), finalScore: 0.9 },
        { candidate: candidate(1, { candidateOrdinal: 0 }), finalScore: 0.8 },
      ],
    })).toThrow(/CANDIDATE_MANIFEST_ORDINAL_DUPLICATE/);
  });
});
