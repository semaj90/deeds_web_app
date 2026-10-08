import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildEngineeringAcquisitionManifestV1 } from './build-engineering-acquisition-manifest.mjs';

const catalogPath = new URL('../../docs/.okf/dev/library-docs-manifest-v1.json', import.meta.url);

test('converts the reviewed catalog to exact-host, bounded, non-canonical fetch sources', async () => {
	const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
	const manifest = buildEngineeringAcquisitionManifestV1(catalog, {
		outputRoot: 'C:/temp/engineering-acquisition-test',
		fetcher: 'FIRECRAWL_V2',
		maximumPagesPerSource: 2,
	});
	assert.equal(manifest.sources.length, catalog.sources.length);
	assert.equal(manifest.workspace_revision, 'UNBOUND_EXTERNAL_SOURCE_CATALOG');
	assert.ok(manifest.sources.every((source) => source.maximum_depth === 0 && source.follow_sitemap === false));
	assert.ok(manifest.sources.every((source) => source.maximum_pages <= 2 && source.pages.length <= 2));
	assert.ok(manifest.sources.every((source) => source.allowed_domains.every((domain) => !domain.startsWith('*.'))));
	assert.ok(manifest.sources.every((source) => source.pages.every((url) => source.allowed_domains.includes(new URL(url).hostname))));
	assert.ok(manifest.sources.every((source) => source.default_fetcher === 'FIRECRAWL_V2'));
	assert.deepEqual(manifest.sources, buildEngineeringAcquisitionManifestV1(catalog, {
		outputRoot: 'C:/temp/engineering-acquisition-test',
		fetcher: 'FIRECRAWL_V2',
		maximumPagesPerSource: 2,
	}).sources);
});

test('rejects non-primary catalogs and non-HTTPS sources', () => {
	const base = {
		schema: 'atlas.library-docs-source-manifest.v1',
		canonicalAuthority: false,
		revision: 'catalog-test',
		rules: { officialSourcesOnly: true },
		sources: [{ id: 'sample', urls: ['http://example.test/docs'], languages: ['python'], priority: 'P1' }],
	};
	assert.throws(() => buildEngineeringAcquisitionManifestV1(base, { outputRoot: 'C:/temp/out' }), /HTTPS_REQUIRED/);
	assert.throws(() => buildEngineeringAcquisitionManifestV1({ ...base, rules: { officialSourcesOnly: false } }, { outputRoot: 'C:/temp/out' }), /NOT_REVIEWED_PRIMARY_ONLY/);
});
