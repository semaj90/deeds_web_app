import { describe, expect, it } from 'vitest';
import {
  normalizeSourceRevisionEvidenceRow,
  resolveSourceRevisionFromEvidence,
  type SourceRevisionEvidenceRowV1,
} from './source-revision-resolver.js';

function row(overrides: Partial<SourceRevisionEvidenceRowV1> = {}): SourceRevisionEvidenceRowV1 {
  return {
    rowId: 'chunk-1',
    sourceRef: 'src/lib/server/example.ts',
    packetKey: 'packet-1',
    sourceRevision: 'git-a',
    sourceRevisionField: 'metadata.source_revision',
    contentHash: 'sha-a',
    updatedAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('source revision resolver', () => {
  it('prefers exact packet identity over a weaker source_ref fallback', () => {
    const result = resolveSourceRevisionFromEvidence({
      candidateId: 'candidate-1',
      packetKey: 'packet-1',
      sourceRef: 'src/lib/server/example.ts',
    }, [
      row({ rowId: 'chunk-exact', sourceRevision: 'git-exact' }),
      row({ rowId: 'chunk-other', packetKey: 'packet-other', sourceRevision: 'git-other' }),
    ]);

    expect(result.status).toBe('EXACT_PACKET_KEY');
    expect(result.sourceRevision).toBe('git-exact');
    expect(result.exactIdentityMatched).toBe(true);
    expect(result.canonicalWritesAllowed).toBe(false);
  });

  it('accepts multiple source_ref rows only when their observed revisions agree', () => {
    const result = resolveSourceRevisionFromEvidence({
      candidateId: 'candidate-1',
      packetKey: null,
      sourceRef: 'src/lib/server/example.ts',
    }, [
      row({ rowId: 'chunk-a', packetKey: null, sourceRevision: 'git-same' }),
      row({ rowId: 'chunk-b', packetKey: null, sourceRevision: 'git-same' }),
    ]);

    expect(result.status).toBe('UNIQUE_SOURCE_REF');
    expect(result.sourceRevision).toBe('git-same');
    expect(result.matchedRowCount).toBe(2);
    expect(result.distinctRevisionCount).toBe(1);
  });

  it('fails closed when source_ref rows disagree on source revision', () => {
    const result = resolveSourceRevisionFromEvidence({
      candidateId: 'candidate-1',
      packetKey: null,
      sourceRef: 'src/lib/server/example.ts',
    }, [
      row({ rowId: 'chunk-a', packetKey: null, sourceRevision: 'git-a' }),
      row({ rowId: 'chunk-b', packetKey: null, sourceRevision: 'git-b' }),
    ]);

    expect(result.status).toBe('AMBIGUOUS');
    expect(result.sourceRevision).toBeNull();
    expect(result.distinctRevisionCount).toBe(2);
  });

  it('does not fall through to source_ref when exact packet identity is unversioned', () => {
    const result = resolveSourceRevisionFromEvidence({
      candidateId: 'candidate-1',
      packetKey: 'packet-1',
      sourceRef: 'src/lib/server/example.ts',
    }, [
      row({ rowId: 'chunk-exact', sourceRevision: null, sourceRevisionField: null }),
      row({ rowId: 'chunk-other', packetKey: 'packet-other', sourceRevision: 'git-fallback' }),
    ]);

    expect(result.status).toBe('UNVERSIONED');
    expect(result.sourceRevision).toBeNull();
    expect(result.exactIdentityMatched).toBe(true);
  });

  it('keeps content hash separate from source revision during normalization', () => {
    const normalized = normalizeSourceRevisionEvidenceRow({
      row_id: 'chunk-1',
      source_ref: 'src/lib/server/example.ts',
      metadata: {
        packet_key: 'packet-1',
        source_revision: 'git-revision-1',
      },
      output_meta: {},
      content_hash: 'sha256-content-1',
      updated_at: new Date('2026-08-19T00:00:00.000Z'),
    });

    expect(normalized?.sourceRevision).toBe('git-revision-1');
    expect(normalized?.contentHash).toBe('sha256-content-1');
    expect(normalized?.sourceRevision).not.toBe(normalized?.contentHash);
  });
});
