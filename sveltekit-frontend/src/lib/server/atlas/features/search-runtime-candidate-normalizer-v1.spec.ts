// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Candidate } from '../../retrieval/search-runtime.js';
import { normalizeSearchRuntimeCandidatesV1 } from './search-runtime-candidate-normalizer-v1.js';

const WS = `sha256:${'a'.repeat(64)}`;
const SRC = `sha256:${'b'.repeat(64)}`;
const base = { candidateSnapshotRevision: `sha256:${'c'.repeat(64)}`, producerRevision: 'test-producer-v1', workspaceRevision: WS };

function cand(id: string, extra: Partial<Candidate> = {}): Candidate {
  return { id, packetKey: `packet:${id}`, sourceRef: `src/${id}.ts`, summary: '', content: '', score: 1, scoreSource: 'qdrant_768', ...extra } as Candidate;
}

describe('normalizeSearchRuntimeCandidatesV1 (FEAT-LIVE-01 identity slice)', () => {
  it('fails closed and reports availability when no candidate carries revisions', () => {
    const r = normalizeSearchRuntimeCandidatesV1({ ...base, candidates: [cand('a'), cand('b')] });
    expect(r.failClosed).toBe(true);
    expect(r.ordinalMap).toBeNull();
    expect(r.accepted).toBe(0);
    expect(r.rejected).toHaveLength(2);
    expect(r.rejected[0].reasons).toEqual(expect.arrayContaining(['MISSING_WORKSPACE_REVISION', 'MISSING_SOURCE_REVISION']));
    expect(r.revisionAvailability.workspaceRevision).toBe(0);
    expect(r.revisionAvailability.packetKey).toBe(2);
    expect(r.writesPerformed).toBe(false);
    expect(r.promotionAllowed).toBe(false);
    expect(r.representationState).toBe('HISTORICAL_UNFROZEN');
  });

  it('assigns deterministic ordinals by canonical id for revision-qualified candidates', () => {
    const r = normalizeSearchRuntimeCandidatesV1({
      ...base,
      candidates: [cand('z', { workspaceRevision: WS, sourceRevision: SRC }), cand('m', { workspaceRevision: WS, sourceRevision: SRC })],
    });
    expect(r.failClosed).toBe(false);
    expect(r.ordinalMapError).toBeNull();
    expect(r.ordinalMap?.rowCount).toBe(2);
    expect(r.ordinalMap?.candidates.map((c) => c.canonicalId)).toEqual(['packet:m', 'packet:z']);
    expect(r.ordinalMap?.candidates.map((c) => c.candidateOrdinal)).toEqual([0, 1]);
  });

  it('rejects a workspace revision mismatch and duplicate identities instead of coercing them', () => {
    const other = `sha256:${'d'.repeat(64)}`;
    const r = normalizeSearchRuntimeCandidatesV1({
      ...base,
      candidates: [
        cand('a', { workspaceRevision: WS, sourceRevision: SRC }),
        cand('a2', { packetKey: 'packet:a', workspaceRevision: WS, sourceRevision: SRC }),
        cand('b', { workspaceRevision: other, sourceRevision: SRC }),
      ],
    });
    expect(r.accepted).toBe(1);
    expect(r.rejected.find((x) => x.id === 'a2')?.reasons).toContain('DUPLICATE_CANONICAL_ID');
    expect(r.rejected.find((x) => x.id === 'b')?.reasons).toContain('WORKSPACE_REVISION_MISMATCH');
  });

  it('marks source_ref-only identity as degraded rather than strong', () => {
    const r = normalizeSearchRuntimeCandidatesV1({
      ...base,
      candidates: [cand('x', { packetKey: '' as unknown as string, workspaceRevision: WS, sourceRevision: SRC })],
    });
    expect(r.identityDegradedCount).toBe(1);
    expect(r.ordinalMap?.candidates[0].degradedIdentity).toBe(true);
  });
});
