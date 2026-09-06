import { describe, expect, it } from 'vitest';
import { buildQueryFingerprintV1 } from './query-fingerprint-v1.js';

describe('QueryFingerprintV1', () => {
  it('is deterministic across request IDs and observation times', () => {
    const first = buildQueryFingerprintV1({
      requestId: 'request-a', query: '  TurboVec   double vote ', normalizerRevision: 'normalizer:v1',
      corpusRevision: 'corpus:v1', observedAt: '2026-09-06T12:00:00.000Z',
    });
    const replay = buildQueryFingerprintV1({
      requestId: 'request-b', query: 'TurboVec double vote', normalizerRevision: 'normalizer:v1',
      corpusRevision: 'corpus:v1', observedAt: '2026-09-06T13:00:00.000Z',
    });

    expect(first.queryChecksum).toBe(replay.queryChecksum);
    expect(first.trigramFingerprint).toBe(replay.trigramFingerprint);
    expect(first.checksum).toBe(replay.checksum);
    expect(first.normalizedQuery).toBe('turbovec double vote');
    expect(first.observedAt).not.toBe(replay.observedAt);
  });

  it('makes missing rare-term statistics explicit', () => {
    const fingerprint = buildQueryFingerprintV1({
      requestId: 'request-c', query: 'semantic retrieval', normalizerRevision: 'normalizer:v1',
      rareLexemesAvailable: false,
    });

    expect(fingerprint.rareLexemes).toEqual([]);
    expect(fingerprint.rareLexemesAvailable).toBe(false);
  });

  it('binds corpus and normalizer revisions into the derived checksum', () => {
    const base = buildQueryFingerprintV1({ requestId: 'request-d', query: 'search', normalizerRevision: 'normalizer:v1', corpusRevision: 'corpus:v1' });
    const changed = buildQueryFingerprintV1({ requestId: 'request-d', query: 'search', normalizerRevision: 'normalizer:v2', corpusRevision: 'corpus:v1' });

    expect(base.checksum).not.toBe(changed.checksum);
  });
});
