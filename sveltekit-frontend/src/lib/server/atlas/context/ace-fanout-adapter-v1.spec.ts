import { describe, expect, it } from 'vitest';
import { aceEnvelopeToFanoutCandidate } from './ace-fanout-adapter-v1.js';

describe('ACE fan-out adapter', () => {
  it('converts lexical and concept fields into revision-bound evidence', () => {
    const candidate = aceEnvelopeToFanoutCandidate({
      packet_key: 'packet:a', source_ref: 'src/a.ts', source_revision: 'sha256:source',
      extraction_method: 'ace-packet-assembly:v1', lexical_nouns: ['cache'], used_concepts: ['REDIS'],
    }, 3);
    expect(candidate.candidateOrdinal).toBe(3);
    expect(candidate.evidence).toHaveLength(2);
    expect(candidate.evidence.every((entry) => entry.sourceRevision === 'sha256:source')).toBe(true);
  });

  it('does not create evidence from empty lexical values', () => {
    const candidate = aceEnvelopeToFanoutCandidate({ packet_key: 'packet:a', source_ref: 'src/a.ts', source_revision: 'sha256:source', lexical_nouns: ['  ', 'cache'] }, 0);
    expect(candidate.evidence.map((entry) => entry.text)).toEqual(['cache']);
  });
});
