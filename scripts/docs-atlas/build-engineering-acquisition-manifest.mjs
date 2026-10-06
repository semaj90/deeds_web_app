#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultCatalog = resolve(scriptDirectory, '../../docs/.okf/dev/library-docs-manifest-v1.json');

function stableJson(value) {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

export function buildEngineeringAcquisitionManifestV1(catalog, {
	outputRoot,
	fetcher = 'BEAUTIFULSOUP_HTTP',
	maximumPagesPerSource = 8,
} = {}) {
	if (!catalog || catalog.schema !== 'atlas.library-docs-source-manifest.v1') {
		throw new Error('ENGINEERING_SOURCE_CATALOG_SCHEMA_INVALID');
	}
	if (catalog.canonicalAuthority !== false || catalog.rules?.officialSourcesOnly !== true) {
		throw new Error('ENGINEERING_SOURCE_CATALOG_NOT_REVIEWED_PRIMARY_ONLY');
	}
	if (!outputRoot || !Number.isInteger(maximumPagesPerSource) || maximumPagesPerSource < 1) {
		throw new Error('OUTPUT_ROOT_AND_POSITIVE_PAGE_BOUND_REQUIRED');
	}
	if (!['BEAUTIFULSOUP_HTTP', 'FIRECRAWL_V2'].includes(fetcher)) {
		throw new Error('UNSUPPORTED_FETCHER');
	}
	const seen = new Set();
	const sources = catalog.sources.map((source) => {
		if (!source.id || seen.has(source.id) || !Array.isArray(source.urls) || source.urls.length === 0) {
			throw new Error(`INVALID_OR_DUPLICATE_SOURCE:${source.id ?? 'unknown'}`);
		}
		seen.add(source.id);
		const urls = [...new Set(source.urls)].slice(0, maximumPagesPerSource);
		const parsed = urls.map((value) => {
			const url = new URL(value);
			if (url.protocol !== 'https:') throw new Error(`HTTPS_REQUIRED:${source.id}`);
			return url;
		});
		const allowedDomains = [...new Set(parsed.map((url) => url.hostname.toLowerCase()))].sort();
		const baseUrls = [...new Set(parsed.map((url) => `${url.origin}/`))].sort();
		const sourceDigest = sha256(stableJson({ catalogRevision: catalog.revision, source }));
		return {
			source_id: source.id,
			source_revision: `sha256:${sourceDigest}`,
			title: source.id,
			base_urls: baseUrls,
			allowed_domains: allowedDomains,
			authority_class: 'OFFICIAL_PRIMARY',
			default_fetcher: fetcher,
			output_namespace: `docs/.okf/engineering-acquisition/${source.id}`,
			maximum_pages: urls.length,
			maximum_depth: 0,
			follow_sitemap: false,
			pages: parsed.map((url) => url.href),
		};
	});
	const manifestDigest = sha256(stableJson({ catalogRevision: catalog.revision, sources }));
	return {
		manifest_revision: `engineering-acquisition-v1-${manifestDigest.slice(0, 16)}`,
		workspace_revision: 'UNBOUND_EXTERNAL_SOURCE_CATALOG',
		source_snapshot_revision: catalog.revision,
		producer_revision: 'build-engineering-acquisition-manifest-v1',
		output_root: outputRoot,
		embedding: { url: 'http://127.0.0.1:8081', model: 'embeddinggemma-300m-f16.gguf' },
		qdrant: { url: 'http://127.0.0.1:6333', collection: 'external_programming_docs_768' },
		features: { low_rank: 64, kmeans_clusters: 64, som: { rows: 20, columns: 20 } },
		sources,
	};
}

function parseArgs(argv) {
	const options = { catalog: defaultCatalog, fetcher: 'BEAUTIFULSOUP_HTTP', maximumPagesPerSource: 8 };
	for (let index = 0; index < argv.length; index += 1) {
		const key = argv[index];
		if (key === '--help') return { help: true };
		const value = argv[index + 1];
		if (!value || value.startsWith('--')) throw new Error(`VALUE_REQUIRED:${key}`);
		if (key === '--catalog') options.catalog = resolve(value);
		else if (key === '--output') options.output = resolve(value);
		else if (key === '--output-root') options.outputRoot = resolve(value);
		else if (key === '--fetcher') options.fetcher = value;
		else if (key === '--maximum-pages-per-source') options.maximumPagesPerSource = Number(value);
		else throw new Error(`UNKNOWN_ARGUMENT:${key}`);
		index += 1;
	}
	if (!options.output || !options.outputRoot) throw new Error('--output and --output-root are required');
	return options;
}

async function main(argv) {
	const options = parseArgs(argv);
	if (options.help) {
		process.stdout.write('Build a bounded fetch manifest from the reviewed library-docs catalog.\n--catalog PATH --output PATH --output-root PATH [--fetcher BEAUTIFULSOUP_HTTP|FIRECRAWL_V2] [--maximum-pages-per-source N]\n');
		return 0;
	}
	const catalog = JSON.parse(await readFile(options.catalog, 'utf8'));
	const manifest = buildEngineeringAcquisitionManifestV1(catalog, options);
	await writeFile(options.output, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
	process.stdout.write(`${JSON.stringify({
		manifest: options.output,
		manifestRevision: manifest.manifest_revision,
		sourceCount: manifest.sources.length,
		pageLimit: manifest.sources.reduce((sum, source) => sum + source.maximum_pages, 0),
		fetcher: options.fetcher,
		outputRoot: manifest.output_root,
		canonicalAuthority: false,
		fetchPerformed: false,
		writesPerformed: false,
	}, null, 2)}\n`);
	return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
		process.stderr.write(`${error.message}\n`);
		process.exitCode = 1;
	});
}
