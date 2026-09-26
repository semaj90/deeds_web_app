#!/usr/bin/env node

/**
 * Read-only streamed census for the two large Parent Atlas JSONL candidates.
 * This classifies artifacts; it does not infer identity, summarize, embed,
 * contact a model, or write to a datastore.
 */
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outPath = resolve(repoRoot, 'docs/reports/large-corpus-enrichment-census-v1.json');
const inputs = [
	{ path: '.tmp/mapreduce-full-v5.ndjson', role: 'PRIMARY_METADATA_CORPUS' },
	{ path: 'sveltekit-frontend/tmp/codebase_chunks_768-embeddings.ndjson', role: 'REPRESENTATION_CORPUS' }
];

const fieldNames = [
	'packet_key', 'packetKey', 'canonical_id', 'stableKey', 'stable_key', 'id',
	'source_ref', 'sourceRef', 'filePath', 'contentHash', 'source_revision',
	'workspace_revision', 'summary', 'summary_text', 'packet_context', 'embedding'
];
const uniquenessFields = ['stableKey', 'stable_key', 'id', 'source_ref', 'sourceRef', 'packet_key', 'packetKey'];

function identityToken(value) {
	if (typeof value === 'string') return value.length ? `string:${value}` : null;
	if (typeof value === 'number' && Number.isFinite(value)) return `number:${value}`;
	return null;
}

async function census(input) {
	const absolutePath = resolve(repoRoot, input.path);
	const fileStat = statSync(absolutePath);
	const stream = createReadStream(absolutePath);
	const digest = createHash('sha256');
	stream.on('data', (buffer) => digest.update(buffer));
	const streamEnded = once(stream, 'end');
	const reader = createInterface({ input: stream, crlfDelay: Infinity });
	const fieldPresent = Object.fromEntries(fieldNames.map((name) => [name, 0]));
	const unique = Object.fromEntries(uniquenessFields.map((name) => [name, new Set()]));
	const duplicateRows = Object.fromEntries(uniquenessFields.map((name) => [name, 0]));
	const schemaShapes = new Map();
	const embeddingDimensions = new Map();
	let records = 0;
	let blankLines = 0;
	let malformedLines = 0;
	let nonObjectRecords = 0;

	for await (const line of reader) {
		if (!line.trim()) {
			blankLines++;
			continue;
		}
		let record;
		try {
			record = JSON.parse(line);
		} catch {
			malformedLines++;
			continue;
		}
		records++;
		if (!record || typeof record !== 'object' || Array.isArray(record)) {
			nonObjectRecords++;
			continue;
		}

		const keys = Object.keys(record).sort();
		const shape = keys.join('|');
		schemaShapes.set(shape, (schemaShapes.get(shape) ?? 0) + 1);
		for (const name of fieldNames) {
			if (Object.hasOwn(record, name) && record[name] !== null && record[name] !== '') {
				fieldPresent[name]++;
			}
		}
		for (const name of uniquenessFields) {
			const token = identityToken(record[name]);
			if (!token) continue;
			if (unique[name].has(token)) duplicateRows[name]++;
			else unique[name].add(token);
		}
		if (Array.isArray(record.embedding)) {
			const dimension = record.embedding.length;
			embeddingDimensions.set(dimension, (embeddingDimensions.get(dimension) ?? 0) + 1);
		}
	}
	await streamEnded;

	const schemaFingerprints = [...schemaShapes]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([shape, count]) => ({
			sha256: createHash('sha256').update(shape).digest('hex'),
			fieldCount: shape ? shape.split('|').length : 0,
			count
		}));

	return {
		path: input.path,
		role: input.role,
		bytes: fileStat.size,
		modifiedAtUtc: fileStat.mtime.toISOString(),
		sha256: digest.digest('hex'),
		records,
		blankLines,
		malformedLines,
		nonObjectRecords,
		fieldPresent,
		uniqueValues: Object.fromEntries(uniquenessFields.map((name) => [name, unique[name].size])),
		duplicateRows,
		embeddingDimensionCounts: Object.fromEntries([...embeddingDimensions].sort((a, b) => a[0] - b[0])),
		schemaFingerprints
	};
}

const artifacts = await Promise.all(inputs.map(census));
const report = {
	schema: 'atlas.large-corpus-enrichment-census.v1',
	status: 'LARGE_CORPUS_ENRICHMENT_CENSUS_PROVEN',
	generatedAt: new Date().toISOString(),
	mode: 'READ_ONLY_STREAMING_CENSUS',
	artifacts,
	selection: {
		primaryMetadataCorpus: '.tmp/mapreduce-full-v5.ndjson',
		representationCorpus: 'sveltekit-frontend/tmp/codebase_chunks_768-embeddings.ndjson',
		canonicalEnrichmentReady: false,
		blocker: 'CURRENT_SOURCE_IDENTITY_AND_REVISION_JOIN_REQUIRED',
		reason: 'Neither artifact carries source_revision or workspace_revision. The metadata corpus also has no packet_key, source_ref, or summary; the embedding corpus is representation-only and contains repeated source_ref values.'
	},
	execution: {
		readOnly: true,
		parallelArtifactScans: true,
		modelCalls: 0,
		postgresWrites: 0,
		qdrantWrites: 0,
		neo4jWrites: 0,
		valkeyWrites: 0,
		graphifyRuns: 0
	}
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath: outPath, status: report.status, artifacts }, null, 2));
