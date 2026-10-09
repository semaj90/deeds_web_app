import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { buildDocumentationCrawlAllowlistV1 } from './documentation-crawl-allowlist-v1.mjs';

const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
function fixture() {
  const demands = [
    { sourceId: 'high', relevanceScore: 0.9, officialUrls: ['https://docs.example/high/'] },
    { sourceId: 'not-in-manifest', relevanceScore: 0.8, officialUrls: ['https://docs.example/missing/'] },
    { sourceId: 'partial', relevanceScore: 0.7, officialUrls: ['https://docs.example/allowed/', 'https://docs.example/unlisted/'] },
  ];
  return {
    demandPlan: {
      schema: 'atlas.documentation-demand.v1', status: 'READ_ONLY_DETERMINISTIC_FETCH_PLAN',
      canonicalAuthority: false, fetchPerformed: false, datastoreWritesPerformed: false,
      demands, demandChecksum: digest(demands),
    },
    crawlerManifest: {
      schema: 'okf.dev.manifest.v1', sources: [
        { source_id: 'high', title: 'High', kind: 'docs', domain_class: 'documentation', focus_tags: [], pages: ['https://docs.example/high/', 'https://docs.example/extra/'] },
        { source_id: 'partial', title: 'Partial', kind: 'docs', domain_class: 'documentation', focus_tags: [], pages: ['https://docs.example/allowed/'] },
      ],
    },
  };
}

test('keeps ranked crawler entries and only exact URLs already in both owners', () => {
  const output = buildDocumentationCrawlAllowlistV1(fixture());
  assert.deepEqual(output.sources.map((source) => source.source_id), ['high', 'partial']);
  assert.deepEqual(output.sources[0].pages, ['https://docs.example/high/']);
  assert.deepEqual(output.sources[1].pages, ['https://docs.example/allowed/']);
  assert.equal(output.atlasDocumentationDemand.skipped[0].reason, 'SOURCE_NOT_IN_CRAWLER_MANIFEST');
  assert.equal(output.atlasDocumentationDemand.fetchPerformed, false);
  assert.equal(output.atlasDocumentationDemand.datastoreWritesPerformed, false);
  assert.equal(output.atlasDocumentationDemand.canonicalAuthority, false);
});

test('is deterministic and honors a bounded source cap', () => {
  const input = fixture();
  const first = buildDocumentationCrawlAllowlistV1({ ...input, maxSources: 1 });
  const second = buildDocumentationCrawlAllowlistV1({ ...input, maxSources: 1 });
  assert.equal(digest(first), digest(second));
  assert.deepEqual(first.sources.map((source) => source.source_id), ['high']);
  assert.ok(first.atlasDocumentationDemand.skipped.some((item) => item.reason === 'MAX_SOURCE_LIMIT_REACHED'));
});

test('selects only missing catalog URLs and skips fully indexed sources', () => {
  const input = fixture();
  input.demandPlan.demands.unshift(
    {
      sourceId: 'already-covered', relevanceScore: 1, fetchStatus: 'ALREADY_INDEXED',
      officialUrls: ['https://docs.example/covered/'], indexedDocumentation: { missingUrls: [] },
    },
    {
      sourceId: 'partial-current', relevanceScore: 0.95, fetchStatus: 'PLANNED_MISSING_URLS',
      officialUrls: ['https://docs.example/covered/', 'https://docs.example/needed/'],
      indexedDocumentation: { missingUrls: ['https://docs.example/needed/'] },
    },
  );
  input.demandPlan.demandChecksum = digest(input.demandPlan.demands);
  input.crawlerManifest.sources.unshift(
    { source_id: 'already-covered', title: 'Covered', kind: 'docs', domain_class: 'documentation', focus_tags: [], pages: ['https://docs.example/covered/'] },
    { source_id: 'partial-current', title: 'Partial current', kind: 'docs', domain_class: 'documentation', focus_tags: [], pages: ['https://docs.example/covered/', 'https://docs.example/needed/'] },
  );
  const output = buildDocumentationCrawlAllowlistV1(input);
  const selectedPartial = output.sources.find((source) => source.source_id === 'partial-current');
  assert.deepEqual(selectedPartial.pages, ['https://docs.example/needed/']);
  assert.ok(output.atlasDocumentationDemand.skipped.some((item) => item.sourceId === 'already-covered' && item.reason === 'NO_MISSING_CATALOG_URLS'));
});

test('matches missing URLs with the planner exact trailing-slash normalization', () => {
  const input = fixture();
  input.demandPlan.demands = [{
    sourceId: 'partial-current', relevanceScore: 0.8, fetchStatus: 'PLANNED_MISSING_URLS',
    officialUrls: ['https://docs.example/page/'],
    indexedDocumentation: { missingUrls: ['https://docs.example/page'] },
  }];
  input.demandPlan.demandChecksum = digest(input.demandPlan.demands);
  input.crawlerManifest.sources = [{
    source_id: 'partial-current', title: 'Partial current', kind: 'docs', domain_class: 'documentation', focus_tags: [],
    pages: ['https://docs.example/page/'],
  }];
  const output = buildDocumentationCrawlAllowlistV1(input);
  assert.deepEqual(output.sources[0].pages, ['https://docs.example/page/']);
});

test('rejects a modified demand plan and duplicate crawler IDs', () => {
  const input = fixture();
  input.demandPlan.demands[0].relevanceScore = 0.99;
  assert.throws(() => buildDocumentationCrawlAllowlistV1(input), /DOCUMENTATION_DEMAND_CHECKSUM_MISMATCH/);
  const duplicate = fixture();
  duplicate.crawlerManifest.sources.push(duplicate.crawlerManifest.sources[0]);
  assert.throws(() => buildDocumentationCrawlAllowlistV1(duplicate), /DUPLICATE_CRAWLER_SOURCE/);
});
