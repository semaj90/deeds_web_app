import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSveltekitDocsTermsV1 } from './sveltekit-docs-terms-v1.mjs';

test('keeps exact identifiers, splits them, and excludes fenced code from prose n-grams', () => {
  const report = buildSveltekitDocsTermsV1({
    rawFiles: [{ path: 'raw/load.md', text: '# Loading data\nPage data uses `$app/state` and `page.data`.\n```ts\nignored prose token\nconst pageData = true\n```\n' }],
    hierarchy: { status: 'HIERARCHY_MAPPED_WITH_COHORT_LIMITS', pages: [{ page: 'load', rawPath: 'raw/load.md', section: 'Core concepts' }] },
  });
  const identifiers = report.identifiersPerPage[0].identifiers.map(item => item.term);
  const ranked = report.topTermsPerPage[0].topTerms.map(item => item.term);
  assert.ok(identifiers.includes('$app/state'));
  assert.ok(identifiers.includes('page.data'));
  assert.ok(identifiers.includes('app'));
  assert.ok(identifiers.includes('state'));
  assert.ok(ranked.includes('page data'));
  assert.ok(!ranked.some(term => term.includes('ignored prose')));
  assert.equal(report.status, 'TERMS_COMPLETE_FOR_PINNED_COHORT');
  assert.equal(report.datastoreWritesCommitted, 0);
});

test('ranks terms deterministically and keeps unmapped pages partial', () => {
  const input = {
    rawFiles: [
      { path: 'raw/a.md', text: '# A\nalpha beta alpha beta' },
      { path: 'raw/b.md', text: '# B\nalpha gamma' },
    ],
    hierarchy: { status: 'HIERARCHY_PARTIAL', pages: [{ page: 'a', rawPath: 'raw/a.md', section: 'Core concepts' }] },
  };
  const first = buildSveltekitDocsTermsV1(input);
  const second = buildSveltekitDocsTermsV1(input);
  assert.equal(first.status, 'TERMS_PARTIAL');
  assert.deepEqual(first.topTermsPerPage, second.topTermsPerPage);
  assert.equal(first.inputChecksum, second.inputChecksum);
});
