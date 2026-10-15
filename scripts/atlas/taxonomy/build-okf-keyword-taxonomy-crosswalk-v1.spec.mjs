import assert from 'node:assert/strict';
import test from 'node:test';

import { buildKeywordTaxonomyCrosswalkV1 } from './build-okf-keyword-taxonomy-crosswalk-v1.mjs';

test('crosswalk keeps glossary topics distinct from taxonomy and canonical resolution', () => {
  const input = {
    corpus: {
      canonical_authority: false,
      indexing: { populated: false, searchable: false, qdrant_written: false },
      entries: [{
        id: 'graph-topic',
        terms: ['Graph', 'unknown phrase'],
        evidence_status: 'reference_only',
        source_refs: ['.okf/index.md'],
      }],
    },
    corpusSha256: 'a'.repeat(64),
    schemaSha256: 'b'.repeat(64),
    mapping: {
      mappingRevision: 'sha256:revision',
      admissionsByTerm: new Map([
        ['Graph', { status: 'ADMITTED', classId: 'atlas:GraphDomain' }],
        ['unknown phrase', { status: 'UNMAPPED', classId: null }],
      ]),
    },
  };
  const report = buildKeywordTaxonomyCrosswalkV1(input);
  const replay = buildKeywordTaxonomyCrosswalkV1(input);

  assert.equal(report.status, 'PARTIAL');
  assert.equal(report.counts.termOccurrences, 2);
  assert.equal(report.counts.exactDomainAliasCandidates, 1);
  assert.equal(report.counts.termsWithoutExactDomainAliasMatch, 1);
  assert.equal(report.rows[0].conceptResolution, 'NOT_ATTEMPTED_CORPUS_HAS_NO_CANONICAL_CONCEPT_FIELD');
  assert.equal(report.rows[0].canonicalAuthority, false);
  assert.match(report.snapshotChecksum, /^sha256:[a-f0-9]{64}$/);
  assert.equal(report.snapshotChecksum, replay.snapshotChecksum);
});

test('reference-only corpus cannot be silently promoted by the crosswalk', () => {
  assert.throws(() => buildKeywordTaxonomyCrosswalkV1({
    corpus: {
      canonical_authority: false,
      indexing: { populated: true, searchable: true, qdrant_written: false },
      entries: [],
    },
    corpusSha256: 'a'.repeat(64),
    schemaSha256: 'b'.repeat(64),
    mapping: { mappingRevision: 'rev', admissionsByTerm: new Map() },
  }), /false/);
});
