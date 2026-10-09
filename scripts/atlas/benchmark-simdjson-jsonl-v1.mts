import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
	clearSimdjsonCache,
	getSimdStats,
	isSimdJsonAvailable,
} from '../../sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.js';
import { parseNdjsonTypedEvidenceStream } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/simdjson-typed-evidence-bridge.js';

type ParsedBackend = 'SIMDJSON_NAPI' | 'V8_JSON_PARSE' | 'CACHE';

const root = resolve(import.meta.dirname, '../..');
const records = parseRecordCount(process.argv[2]);
const scratch = resolve(root, '.tmp/atlas/simdjson-jsonl-benchmark-v1');
const inputPath = resolve(scratch, 'fixture.jsonl');
const reportPath = resolve(scratch, `receipt-${new Date().toISOString().replace(/[-:.]/g, '')}.json`);
const addonAvailable = isSimdJsonAvailable();
const payloadSchema = z.object({
	recordId: z.string(),
	kind: z.enum(['ENTITY', 'RELATION', 'EVIDENCE']),
	label: z.string(),
	ordinal: z.number().int(),
	flags: z.object({ eligible: z.boolean(), proposalOnly: z.boolean(), canonicalAuthority: z.literal(false) }).strict(),
	values: z.array(z.number()),
	padding: z.string(),
}).strict();

mkdirSync(scratch, { recursive: true });
writeFileSync(inputPath, buildFixture(records), 'utf8');

const fixtureMetrics = await scanFixtureMetrics();
const baseline = await measure('V8_JSON_PARSE_BASELINE', 'V8');
clearSimdjsonCache();
const statsBeforeBridgeRuns = getSimdStats();
const coldCache = await measure('BRIDGE_COLD_CACHE', 'BRIDGE');
const coldStats = getSimdStats();
const warmCache = await measure('BRIDGE_WARM_CACHE', 'BRIDGE');
const warmStats = getSimdStats();

const semanticParity = baseline.semanticChecksum === coldCache.semanticChecksum &&
	coldCache.semanticChecksum === warmCache.semanticChecksum;
const parseFailureParity = baseline.parseFailures === coldCache.parseFailures &&
	coldCache.parseFailures === warmCache.parseFailures;
const nativePathExercised = coldCache.backendCounts.SIMDJSON_NAPI > 0;

const receipt = {
	schema: 'atlas.simdjson-jsonl-benchmark-receipt.v1',
	status: semanticParity && parseFailureParity && nativePathExercised ? 'FIXTURE_PARITY_PROVEN' : 'DIAGNOSTIC_ONLY',
	proofScope: 'bounded generated JSONL fixture through incremental typed-evidence stream owner',
	parser: {
		addonAvailable,
		implementation: 'simdjson N-API validation/minification followed by V8 JSON.parse',
		parserReuse: 'native thread-local parser in the existing C++ addon',
		cachePolicy: 'cold pass clears bridge LRU; warm pass replays identical records',
	},
	fixture: {
		inputPath: relativeToRoot(inputPath),
		recordTarget: records,
		inputBytes: fixtureMetrics.inputBytes,
		validRecords: baseline.validRecords,
		malformedRecords: baseline.parseFailures,
		minRecordBytes: fixtureMetrics.minRecordBytes,
		maxRecordBytes: fixtureMetrics.maxRecordBytes,
	},
	runs: [baseline, coldCache, warmCache],
	parity: {
		semanticChecksum: baseline.semanticChecksum,
		semanticParity,
		parseFailureParity,
		expectedMalformedRecordRejected: baseline.parseFailures === 1,
		nativePathExercised,
		coldCacheStats: selectStats(coldStats, statsBeforeBridgeRuns),
		warmCacheStats: selectStats(warmStats, coldStats),
	},
	memoryMeasurement: {
		peakRss: 'sampled process.memoryUsage().rss every 64 records; process-wide, not isolated allocation accounting',
		heapDelta: 'heapUsed after run minus before run; GC is not forced',
		allocationCount: null,
		allocationCountReason: 'Node/V8 allocation count is not exposed by this bounded runner',
	},
	limitations: [
		'No production data, stores, model calls, or services are used.',
		'The legacy string-based API still buffers/splits its input; this benchmark exercises the new incremental byte-stream API.',
		'Warm-cache throughput measures the existing LRU hit path, not native parser throughput.',
		'No throughput threshold is used as an admission decision.',
	],
	writesPerformed: false,
	canonicalAuthority: false,
};

writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...receipt, reportPath: relativeToRoot(reportPath) }, null, 2));

async function measure(
	name: string,
	mode: 'V8' | 'BRIDGE',
): Promise<{
	name: string;
	backendCounts: Record<ParsedBackend, number>;
	validRecords: number;
	parseFailures: number;
	inputBytes: number;
	minRecordBytes: number;
	maxRecordBytes: number;
	durationMs: number;
	bytesPerSecond: number;
	recordsPerSecond: number;
	heapDeltaBytes: number;
	peakSampledRssBytes: number;
	semanticChecksum: string;
}> {
	const backendCounts: Record<ParsedBackend, number> = { SIMDJSON_NAPI: 0, V8_JSON_PARSE: 0, CACHE: 0 };
	const semantic = createHash('sha256');
	const memoryBefore = process.memoryUsage();
	let peakSampledRssBytes = memoryBefore.rss;
	let validRecords = 0;
	let parseFailures = 0;
	let processedRecords = 0;
	const inputBytes = statSync(inputPath).size;
	const started = process.hrtime.bigint();
	const addAccepted = (value: unknown, backend?: ParsedBackend) => {
		if (backend) backendCounts[backend]++;
		semantic.update(canonicalJson(value)).update('\n');
		validRecords++;
	};
	const addRejected = (backend?: ParsedBackend) => {
		if (backend) backendCounts[backend]++;
		parseFailures++;
	};
	const sampleMemory = () => {
		processedRecords++;
		if (processedRecords % 64 === 0) peakSampledRssBytes = Math.max(peakSampledRssBytes, process.memoryUsage().rss);
	};

	if (mode === 'V8') {
		const lines = createInterface({ input: createReadStream(inputPath, { encoding: 'utf8' }), crlfDelay: Infinity });
		for await (const line of lines) {
			if (!line.trim()) continue;
			try {
				addAccepted(payloadSchema.parse(JSON.parse(line)));
			} catch {
				addRejected();
			}
			sampleMemory();
		}
	} else {
		for await (const row of parseNdjsonTypedEvidenceStream({
			artifactRef: 'artifact:fixture:simdjson-jsonl',
			artifactRevision: 'sha256:' + 'a'.repeat(64),
			chunks: createReadStream(inputPath),
			payloadSchema,
			payloadSchemaId: 'atlas.simdjson-jsonl-benchmark-record.v1',
		})) {
			if (row.status === 'ACCEPTED') addAccepted(row.payload, row.backend);
			else addRejected(row.backend);
			sampleMemory();
		}
	}

	const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
	const seconds = durationMs / 1_000;
	const memoryAfter = process.memoryUsage();
	return {
		name,
		backendCounts,
		validRecords,
		parseFailures,
		inputBytes,
		minRecordBytes: fixtureMetrics.minRecordBytes,
		maxRecordBytes: fixtureMetrics.maxRecordBytes,
		durationMs: round(durationMs),
		bytesPerSecond: Math.round(inputBytes / Math.max(seconds, 0.000001)),
		recordsPerSecond: Math.round((validRecords + parseFailures) / Math.max(seconds, 0.000001)),
		heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
		peakSampledRssBytes,
		semanticChecksum: semantic.digest('hex'),
	};
}

async function scanFixtureMetrics(): Promise<{ inputBytes: number; minRecordBytes: number; maxRecordBytes: number }> {
	let minRecordBytes = Number.POSITIVE_INFINITY;
	let maxRecordBytes = 0;
	const lines = createInterface({ input: createReadStream(inputPath, { encoding: 'utf8' }), crlfDelay: Infinity });
	for await (const line of lines) {
		if (!line.trim()) continue;
		const bytes = Buffer.byteLength(line, 'utf8');
		minRecordBytes = Math.min(minRecordBytes, bytes);
		maxRecordBytes = Math.max(maxRecordBytes, bytes);
	}
	return { inputBytes: statSync(inputPath).size, minRecordBytes, maxRecordBytes };
}

function buildFixture(count: number): string {
	const lines = Array.from({ length: count }, (_, index) => JSON.stringify({
		recordId: `fixture-${String(index).padStart(6, '0')}`,
		kind: index % 3 === 0 ? 'ENTITY' : index % 3 === 1 ? 'RELATION' : 'EVIDENCE',
		label: `Unicode fixture ${index}: café — 東京 — 🧪`,
		ordinal: index,
		flags: { eligible: index % 2 === 0, proposalOnly: true, canonicalAuthority: false },
		values: Array.from({ length: 48 }, (_, item) => Number(((index + 1) * (item + 3) / 17).toFixed(6))),
		padding: `bounded-jsonl-fixture-${index}-`.padEnd(1150, 'x'),
	}));
	lines.push('{"recordId":"intentionally-malformed"');
	return `${lines.join('\n')}\n`;
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value && typeof value === 'object') {
		const object = value as Record<string, unknown>;
		return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

function selectStats(
	stats: ReturnType<typeof getSimdStats>,
	prior: ReturnType<typeof getSimdStats>,
) {
	return {
		hits: stats.hits - prior.hits,
		misses: stats.misses - prior.misses,
		nativeParses: stats.nativeParses - prior.nativeParses,
		fallbackParses: stats.fallbackParses - prior.fallbackParses,
		totalBytesParsed: stats.totalBytesParsed - prior.totalBytesParsed,
		cacheSize: stats.cacheSize,
	};
}

function parseRecordCount(raw: string | undefined): number {
	const count = raw === undefined ? 256 : Number(raw);
	if (!Number.isInteger(count) || count < 16 || count > 4096) {
		throw new RangeError('record count must be an integer from 16 through 4096');
	}
	return count;
}

function relativeToRoot(path: string): string {
	return path.slice(root.length + 1).replaceAll('\\', '/');
}

function round(value: number): number {
	return Number(value.toFixed(3));
}
