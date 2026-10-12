import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateChunkProducerProvenance,
  KNOWN_CONTENT_PRODUCERS,
  KNOWN_LINEAGE_PRODUCERS,
  SCHEMA_V1,
  GATE_NAME,
} from './prove-chunk-producer-provenance-v1.mjs';

describe('ChunkProducerProvenanceV1 Evaluator', () => {
  test('evaluates current source match with unconfirmed producer identity', () => {
    const chunk = {
      id: 'chunk-100',
      relative_path: 'src/lib/server/test.ts',
      content: 'export const a = 1;',
      source_revision: 'sha256:current-rev',
      chunk_source: 'TEXT_FALLBACK',
    };
    const currentText = 'export const a = 1;\nexport const b = 2;\n';

    const res = evaluateChunkProducerProvenance(chunk, currentText, []);

    assert.equal(res.schema, SCHEMA_V1);
    assert.equal(res.gate, GATE_NAME);
    assert.equal(res.exactCurrentSourceMatch, true);
    assert.deepEqual(res.historicalSourceMatches, []);
    assert.equal(res.lineageQualified, true);
    assert.equal(res.producerIdentified, false, 'producerIdentified must remain false');
    assert.equal(res.admissionAuthorized, false);
    assert.equal(res.writesPerformed, false);
    assert.ok(res.possibleContentProducers.includes('scripts/atlas/index-full-repo-for-search.mjs:TEXT_FALLBACK'));
  });

  test('blocks lineage qualification when content matches only historical commit', () => {
    const chunk = {
      id: 'chunk-200',
      relative_path: 'src/lib/server/old.ts',
      content: 'export const legacy = true;',
      source_revision: 'sha256:current-rev',
    };
    const currentText = 'export const modern = true;\n';
    const history = [{ commit: 'f700commit', fileText: 'export const legacy = true;\n' }];

    const res = evaluateChunkProducerProvenance(chunk, currentText, history);

    assert.equal(res.exactCurrentSourceMatch, false);
    assert.deepEqual(res.historicalSourceMatches, ['f700commit']);
    assert.equal(res.lineageQualified, false, 'Lineage must not be qualified for historical match');
    assert.equal(res.producerIdentified, false);
    assert.equal(res.admissionAuthorized, false);
  });
});
