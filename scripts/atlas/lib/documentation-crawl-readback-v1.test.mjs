import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { verifyDocumentationCrawlReadbackV1 } from './documentation-crawl-readback-v1.mjs';
import { buildDocumentationCrawlAllowlistV1 } from './documentation-crawl-allowlist-v1.mjs';

const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
function fixture() {
  const demands = [{ sourceId: 'docs', relevanceScore: 1, officialUrls: ['https://docs.example/'] }];
  const allowlist = buildDocumentationCrawlAllowlistV1({
    demandPlan: { schema: 'atlas.documentation-demand.v1', status: 'READ_ONLY_DETERMINISTIC_FETCH_PLAN', canonicalAuthority: false, fetchPerformed: false, datastoreWritesPerformed: false, demands, demandChecksum: digest(demands) },
    crawlerManifest: { sources: [{ source_id: 'docs', title: 'Docs', kind: 'docs', domain_class: 'documentation', focus_tags: [], pages: ['https://docs.example/'] }] },
  });
  const markdownBytes = Buffer.from('# docs\n', 'utf8');
  const entry = { schema_version: 'okf.dev.corpus.v1', source_id: 'docs', source_ref: 'docs:index', url: 'https://docs.example/', content_hash: crypto.createHash('sha256').update(markdownBytes).digest('hex'), markdown_path: '.tmp/atlas/docs/raw/index.md' };
  const sidecar = { ...entry, raw_path: entry.markdown_path };
  return { allowlist, entries: [entry], markdownBytes, sidecar };
}

test('independently binds fetched corpus row, sidecar and exact markdown bytes', async () => {
  const value = fixture();
  const result = await verifyDocumentationCrawlReadbackV1({ ...value, readArtifacts: async () => ({ markdownBytes: value.markdownBytes, sidecar: value.sidecar }) });
  assert.equal(result.status, 'ALLOWLIST_READBACK_MATCH');
  assert.equal(result.readbackPageCount, 1);
  assert.equal(result.missingPages.length, 0);
  assert.equal(result.canonicalAuthority, false);
});

test('fails closed on a fetched URL or markdown content outside the verified bindings', async () => {
  const outside = fixture();
  outside.entries[0].url = 'https://unlisted.example/';
  await assert.rejects(() => verifyDocumentationCrawlReadbackV1({ ...outside, readArtifacts: async () => ({ markdownBytes: outside.markdownBytes, sidecar: outside.sidecar }) }), /CRAWL_ENTRY_OUTSIDE_ALLOWLIST/);
  const stale = fixture();
  await assert.rejects(() => verifyDocumentationCrawlReadbackV1({ ...stale, readArtifacts: async () => ({ markdownBytes: Buffer.from('changed'), sidecar: stale.sidecar }) }), /CRAWL_MARKDOWN_CHECKSUM_MISMATCH/);
});

test('reports incomplete page coverage without inventing pages', async () => {
  const value = fixture();
  value.allowlist.sources[0].pages.push('https://docs.example/another/');
  value.allowlist.atlasDocumentationDemand.selectedSources[0].pages.push('https://docs.example/another/');
  value.allowlist.atlasDocumentationDemand.selectedSources[0].sourceChecksum = digest(value.allowlist.sources[0]);
  const { checksum, ...body } = value.allowlist.atlasDocumentationDemand;
  value.allowlist.atlasDocumentationDemand.checksum = digest(body);
  const result = await verifyDocumentationCrawlReadbackV1({ ...value, readArtifacts: async () => ({ markdownBytes: value.markdownBytes, sidecar: value.sidecar }) });
  assert.equal(result.status, 'PARTIAL_ALLOWED_PAGE_READBACK');
  assert.deepEqual(result.missingPages, [{ sourceId: 'docs', url: 'https://docs.example/another/' }]);
});

test('rejects allowlist source mutation even when the readback URL still appears valid', async () => {
  const value = fixture();
  value.allowlist.sources[0].pages.push('https://unlisted.example/');
  await assert.rejects(() => verifyDocumentationCrawlReadbackV1({ ...value, readArtifacts: async () => ({ markdownBytes: value.markdownBytes, sidecar: value.sidecar }) }), /CRAWL_ALLOWLIST_SOURCE_BINDING_MISMATCH/);
});
