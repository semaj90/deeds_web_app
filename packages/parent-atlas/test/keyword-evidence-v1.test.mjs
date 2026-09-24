import assert from 'node:assert/strict';
import test from 'node:test';
import { planKeywordEvidenceV1 } from '../dist/core/keyword-evidence-v1.js';

test('keyword evidence planning is deterministic and returns bounded executor inputs', () => {
  const query = 'BitFrost warming cache identity src/cache/keys.ts';
  const first = planKeywordEvidenceV1(query);
  const replay = planKeywordEvidenceV1(query);
  assert.deepEqual(first, replay);
  assert.equal(first.schema, 'atlas.keyword-evidence.v1');
  assert.ok(first.identifierTerms.includes('BitFrost'));
  assert.ok(first.pathTerms.includes('src/cache/keys.ts'));
  assert.deepEqual(first.rgQuery, { mode: 'fixed-strings', terms: first.exactTerms });
  assert.equal(first.astGrepQuery.plan.query, query);
  assert.equal(first.canonicalAuthority, false);
  assert.equal(first.writesPerformed, false);
});

test('keyword evidence rejects blank input and caps exact terms', () => {
  assert.throws(() => planKeywordEvidenceV1('  '), /KEYWORD_EVIDENCE_QUERY_EMPTY/);
  const query = Array.from({ length: 80 }, (_, index) => `term${index}`).join(' ');
  const evidence = planKeywordEvidenceV1(query);
  assert.equal(evidence.exactTerms.length, 50);
  assert.equal(evidence.rgQuery.terms.length, 50);
});
