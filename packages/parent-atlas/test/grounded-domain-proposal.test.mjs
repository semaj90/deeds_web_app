import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedDomainCandidates } from '../dist/core/grounded-domain-proposal.js';

const observation = (overrides = {}) => ({
  extraction_id: 'langextract:abc',
  source_ref: 'src/lib/retrieval.ts',
  source_revision: 'source:r1',
  extraction_class: 'CODE_SYMBOL',
  extraction_text: 'retrieveCandidates',
  char_interval: { start_pos: 10, end_pos: 28 },
  alignment_status: 'match_exact',
  alignment_exact: true,
  attributes: {},
  confidence: 0.9,
  extractor_revision: 'langextract:r1',
  canonical_authority: false,
  ...overrides,
});

test('grounded observations become review-required domain candidates', () => {
  const result = buildGroundedDomainCandidates({
    observations: [observation()],
    extractionClassToDomain: new Map([['CODE_SYMBOL', 'software.retrieval']]),
    taxonomyRevision: 'okf-taxonomy:r1',
    producerRevision: 'adapter:r1',
    evidenceRefPrefix: 'evidence',
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].domainId, 'software.retrieval');
  assert.equal(result[0].status, 'REVIEW_REQUIRED');
  assert.equal(result[0].canonicalAuthority, false);
  assert.deepEqual(result[0].charInterval, { start_pos: 10, end_pos: 28 });
});

test('unmapped or non-exact observations are not promoted to candidates', () => {
  const result = buildGroundedDomainCandidates({
    observations: [
      observation({ alignment_exact: false, alignment_status: 'match_fuzzy' }),
      observation({ extraction_class: 'UNKNOWN' }),
    ],
    extractionClassToDomain: new Map([['CODE_SYMBOL', 'software.retrieval']]),
    taxonomyRevision: 'okf-taxonomy:r1',
    producerRevision: 'adapter:r1',
    evidenceRefPrefix: 'evidence',
  });

  assert.deepEqual(result, []);
});
