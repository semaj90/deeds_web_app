import { describe, expect, it } from 'vitest';
import { buildLexicalFingerprintV1 } from './lexical-fingerprint-v1.js';

const identity = {
  candidateRef: 'candidate:42',
  sourceRef: 'src/retrieval.ts',
  sourceRevision: 'sha256:' + '1'.repeat(64),
  workspaceRevision: 'sha256:' + '2'.repeat(64),
  lexicalFeatureRevision: 'lexical:v1',
  corpusSnapshotChecksum: 'a'.repeat(64),
};

describe('LexicalFingerprintV1', () => {
  it('sorts and deduplicates derived term statistics deterministically', () => {
    const fingerprint = buildLexicalFingerprintV1({
      ...identity,
      statistics: [
        { term: 'Search', documentFrequency: 3, corpusFrequency: 5 },
        { term: ' search ', documentFrequency: 3, corpusFrequency: 5 },
        { term: 'runtime', documentFrequency: 4, corpusFrequency: 4 },
      ],
    });

    expect(fingerprint.topLexemes).toEqual([
      { term: 'runtime', documentFrequency: 4, corpusFrequency: 4 },
      { term: 'search', documentFrequency: 3, corpusFrequency: 5 },
    ]);
    expect(fingerprint.statisticsAvailable).toBe(true);
    expect(fingerprint.canonicalAuthority).toBe(false);
    expect(fingerprint.writesPerformed).toBe(false);
  });

  it('does not fabricate statistics when the source is unavailable', () => {
    const fingerprint = buildLexicalFingerprintV1(identity);

    expect(fingerprint.topLexemes).toEqual([]);
    expect(fingerprint.statisticsAvailable).toBe(false);
  });

  it('changes when the existing candidate or corpus identity changes', () => {
    const first = buildLexicalFingerprintV1({ ...identity, statistics: [] });
    const changed = buildLexicalFingerprintV1({ ...identity, candidateRef: 'candidate:43', statistics: [] });

    expect(first.checksum).not.toBe(changed.checksum);
  });
});
