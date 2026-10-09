import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOkfDevSourceManifestV1,
  orderOkfDevFetchersV1,
} from './okf-dev-source-manifest-adapter-v1.mjs';

const versionedSource = {
  source_id: 'oaklib',
  source_revision: 'oaklib-docs-r1',
  title: 'OAKlib docs',
  base_urls: ['https://docs.example.org/'],
  allowed_domains: ['example.org'],
  authority_class: 'OFFICIAL_PRIMARY',
  default_fetcher: 'BEAUTIFULSOUP_HTTP',
  output_namespace: 'docs/.okf/oaklib',
  maximum_pages: 2,
  maximum_depth: 0,
  pages: ['https://docs.example.org/guide', 'https://sub.example.org/api'],
  provider: 'Example Org',
  product: 'oaklib',
  version_qualification: 'CURRENT_UPSTREAM',
  language: 'python',
  publisher: 'Example Org',
};

test('normalizes version-qualified source metadata without losing lineage', () => {
  const [source] = normalizeOkfDevSourceManifestV1({
    manifest_revision: 'docs-r4',
    sources: [versionedSource],
  });
  assert.equal(source.source_revision, 'oaklib-docs-r1');
  assert.equal(source.kind, 'official_docs');
  assert.equal(source.domain_class, 'documentation');
  assert.deepEqual(source.focus_tags, []);
  assert.equal(source.preferred_fetcher, 'BEAUTIFULSOUP_HTTP');
  assert.equal(source.source_metadata.manifest_revision, 'docs-r4');
  assert.equal(source.source_metadata.output_namespace, 'docs/.okf/oaklib');
  assert.equal(source.source_metadata.version_qualification, 'CURRENT_UPSTREAM');
});

test('rejects a page outside the source domain allowlist', () => {
  assert.throws(() => normalizeOkfDevSourceManifestV1({
    manifest_revision: 'docs-r4',
    sources: [{ ...versionedSource, pages: ['https://other.example.net/page'] }],
  }), /SOURCE_MANIFEST_URL_OUTSIDE_POLICY/);
});

test('rejects pages beyond the reviewed per-source cap', () => {
  assert.throws(() => normalizeOkfDevSourceManifestV1({
    manifest_revision: 'docs-r4',
    sources: [{ ...versionedSource, maximum_pages: 1 }],
  }), /SOURCE_MANIFEST_PAGE_LIMIT_EXCEEDED/);
});

test('rejects duplicate canonical page URLs and unsupported fetchers', () => {
  assert.throws(() => normalizeOkfDevSourceManifestV1({
    manifest_revision: 'docs-r4',
    sources: [{ ...versionedSource, pages: ['https://docs.example.org/guide', 'https://docs.example.org/guide'] }],
  }), /SOURCE_MANIFEST_DUPLICATE_PAGE/);
  assert.throws(() => normalizeOkfDevSourceManifestV1({
    manifest_revision: 'docs-r4',
    sources: [{ ...versionedSource, default_fetcher: 'UNREVIEWED_CRAWLER' }],
  }), /SOURCE_MANIFEST_UNSUPPORTED_FETCHER/);
});

test('retains legacy manifest inputs and places the preferred fetcher first', () => {
  const legacy = { source_id: 'zod', title: 'Zod', kind: 'official_docs', domain_class: 'tool', focus_tags: [], pages: ['https://zod.dev/'] };
  assert.equal(normalizeOkfDevSourceManifestV1({ sources: [legacy] })[0], legacy);
  assert.deepEqual(orderOkfDevFetchersV1('BEAUTIFULSOUP_HTTP'), [
    'BEAUTIFULSOUP_HTTP', 'FIRECRAWL', 'HTTP_FALLBACK',
  ]);
  assert.deepEqual(orderOkfDevFetchersV1(), ['FIRECRAWL', 'BEAUTIFULSOUP_HTTP', 'HTTP_FALLBACK']);
});
