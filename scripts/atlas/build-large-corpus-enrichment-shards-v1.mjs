#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const censusPath = resolve(repoRoot, 'docs/reports/large-corpus-enrichment-census-v1.json');
const workerCount = Math.max(1, Math.min(4, availableParallelism() - 1));
const shardSize = 5000;

const supportedExtensions = new Set([
	'.c', '.cc', '.cpp', '.cs', '.go', '.h', '.hpp', '.java', '.js', '.jsx',
	'.mjs', '.mts', '.php', '.py', '.rb', '.rs', '.sh', '.sql', '.svelte',
	'.ts', '.tsx', '.vue', '.yaml', '.yml'
]);

function classifyLine({ line, role, ordinal, artifactSha256 }) {
	const input = JSON.parse(line);
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		throw new Error(`record ${ordinal} is not a JSON object`);
	}

	const base = {
		schema: 'atlas.enriched-index-record-local.v1',
		canonicalAuthority: false,
		corpus: role,
		sourceEvidence: { artifactSha256, recordOrdinal: ordinal },
		identity: {
			canonicalId: null,
			packetKey: null,
			sourceIdentityKey: null,
			sourceRef: typeof input.source_ref === 'string' ? input.source_ref : null,
			sourceRevision: null,
			workspaceRevision: null,
			lineageState: 'IDENTITY_UNRESOLVED'
		},
		summary: { text: null, revision: null, state: 'NOT_PRESENT_IN_SOURCE' },
		domain: { class: null, concepts: null, entities: null, state: 'NOT_EVALUATED' },
		community: { communityId: null, clusterId: null, somCell: null, state: 'NOT_EVALUATED' },
		evidenceRefs: [`artifact-sha256:${artifactSha256}#record=${ordinal}`]
	};

	if (role === 'PRIMARY_METADATA_CORPUS') {
		const filePath = typeof input.filePath === 'string' ? input.filePath : null;
		const extension = typeof input.extension === 'string'
			? input.extension.toLowerCase()
			: null;
		const astEligible = Boolean(extension && supportedExtensions.has(extension));
		return {
			...base,
			metadata: {
				stableKey: typeof input.stableKey === 'string' ? input.stableKey : null,
				filePath,
				fileName: typeof input.fileName === 'string' ? input.fileName : null,
				fileKind: extension,
				language: extension,
				contentHash: typeof input.contentHash === 'string' ? input.contentHash : null,
				sizeBytes: Number.isSafeInteger(input.size) ? input.size : null,
				lineCount: Number.isSafeInteger(input.lines) ? input.lines : null,
				keywords: Array.isArray(input.keywords) ? input.keywords : null,
				featureHint: typeof input.feature === 'string' ? input.feature : null
			},
			semantic: { representationId: null, embeddingRef: null, dimensions: null, state: 'NOT_PRESENT_IN_SOURCE' },
			ast: {
				eligibility: astEligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
				state: astEligible ? 'NOT_MATERIALIZED' : 'NOT_APPLICABLE'
			}
		};
	}

	if (role === 'REPRESENTATION_CORPUS') {
		if (!Array.isArray(input.embedding) || input.embedding.length !== 768) {
			throw new Error(`record ${ordinal} does not contain a 768-dimensional embedding`);
		}
		return {
			...base,
			metadata: {
				stableKey: typeof input.stable_key === 'string' ? input.stable_key : null,
				protocols: Array.isArray(input.protocols) ? input.protocols : null
			},
			semantic: {
				representationId: 'semantic_768',
				dimensions: 768,
				state: 'REPRESENTATION_ONLY_UNQUALIFIED',
				embeddingRef: {
					artifactSha256,
					recordOrdinal: ordinal,
					inputId: typeof input.id === 'string' || Number.isSafeInteger(input.id) ? input.id : null
				}
			},
			ast: { eligibility: 'UNASSESSED', state: 'LINEAGE_UNQUALIFIED' }
		};
	}

	throw new Error(`unsupported corpus role: ${role}`);
}

if (!isMainThread) {
	parentPort.on('message', (job) => {
		try {
			parentPort.postMessage({ id: job.id, record: classifyLine(job) });
		} catch (error) {
			parentPort.postMessage({ id: job.id, error: error instanceof Error ? error.message : String(error) });
		}
	});
} else {
	const [{ readFileSync }, { randomUUID }] = await Promise.all([
		import('node:fs'), import('node:crypto')
	]);
	const census = JSON.parse(readFileSync(censusPath, 'utf8'));
	if (census.status !== 'LARGE_CORPUS_ENRICHMENT_CENSUS_PROVEN' || census.selection?.canonicalEnrichmentReady !== false) {
		throw new Error('expected a completed census with canonical enrichment still blocked');
	}

	const runId = new Date().toISOString().replaceAll(':', '').replaceAll('-', '').replace(/\.\d{3}Z$/, 'Z');
	const outputDir = resolve(repoRoot, '.tmp/atlas/large-corpus-enrichment-shards-v1', runId);
	mkdirSync(dirname(outputDir), { recursive: true });
	mkdirSync(outputDir, { recursive: false });

	const workers = Array.from({ length: workerCount }, () => new Worker(new URL(import.meta.url), { workerData: { role: 'worker' } }));
	let nextWorker = 0;
	let nextJobId = 0;
	const pending = new Map();
	for (const worker of workers) {
		worker.on('message', (message) => {
			const job = pending.get(message.id);
			if (!job) return;
			pending.delete(message.id);
			if (message.error) job.reject(new Error(message.error));
			else job.resolve(message.record);
		});
	}

	async function dispatch(payload) {
		const id = nextJobId++;
		const worker = workers[nextWorker++ % workers.length];
		return new Promise((resolveJob, rejectJob) => {
			pending.set(id, { resolve: resolveJob, reject: rejectJob });
			worker.postMessage({ ...payload, id });
		});
	}

	async function buildArtifact(artifact) {
		const absolutePath = resolve(repoRoot, artifact.path);
		const stat = statSync(absolutePath);
		if (stat.size !== artifact.bytes) throw new Error(`input size changed since census: ${artifact.path}`);

		const input = createReadStream(absolutePath);
		const inputHash = createHash('sha256');
		input.on('data', (chunk) => inputHash.update(chunk));
		const reader = createInterface({ input, crlfDelay: Infinity });
		const completed = [];
		let flushOrdinal = 1;
		let recordCount = 0;
		let writtenCount = 0;
		let blankLines = 0;
		let shardNumber = 0;
		let shardCount = 0;
		let shardStream = null;
		let shardHash = null;
		const shards = [];

		async function openShard() {
			shardNumber++;
			shardCount = 0;
			shardHash = createHash('sha256');
			const filename = `${artifact.role.toLowerCase()}-${String(shardNumber).padStart(5, '0')}.ndjson`;
			shardStream = createWriteStream(resolve(outputDir, filename), { flags: 'wx' });
			await once(shardStream, 'open');
			shards.push({ path: filename, firstRecordOrdinal: writtenCount + 1, records: 0, sha256: null });
		}

		async function writeRecord(record) {
			if (!shardStream || shardCount >= shardSize) {
				if (shardStream) {
					shardStream.end();
					await once(shardStream, 'finish');
					shards.at(-1).sha256 = shardHash.digest('hex');
				}
				await openShard();
			}
			const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
			shardHash.update(bytes);
			if (!shardStream.write(bytes)) await once(shardStream, 'drain');
			shardCount++;
			shards.at(-1).records++;
			writtenCount++;
		}

		async function flushReady() {
			while (completed.length && completed[0].ordinal === flushOrdinal) {
				const next = completed.shift();
				await writeRecord(next.record);
				flushOrdinal++;
			}
		}

		let batch = [];
		for await (const line of reader) {
			if (!line.trim()) { blankLines++; continue; }
			recordCount++;
			const ordinal = recordCount;
			batch.push(dispatch({ line, role: artifact.role, ordinal, artifactSha256: artifact.sha256 })
				.then((record) => ({ ordinal, record })));
			if (batch.length >= workerCount * 8) {
				completed.push(...await Promise.all(batch));
				batch = [];
				completed.sort((a, b) => a.ordinal - b.ordinal);
				await flushReady();
			}
		}
		if (batch.length) completed.push(...await Promise.all(batch));
		completed.sort((a, b) => a.ordinal - b.ordinal);
		await flushReady();
		if (shardStream) {
			shardStream.end();
			await once(shardStream, 'finish');
			shards.at(-1).sha256 = shardHash.digest('hex');
		}
		reader.close();
		if (!input.readableEnded) await once(input, 'end');
		const actualSha256 = inputHash.digest('hex');
		if (actualSha256 !== artifact.sha256 || recordCount !== artifact.records || blankLines !== artifact.blankLines) {
			throw new Error(`input no longer matches census: ${artifact.path}`);
		}
		return { inputPath: artifact.path, inputSha256: actualSha256, records: recordCount, blankLines, shardCount: shards.length, shards };
	}

	let results;
	try {
		results = [];
		for (const artifact of census.artifacts) results.push(await buildArtifact(artifact));
	} finally {
		await Promise.all(workers.map((worker) => worker.terminate()));
	}

	const rootMaterial = JSON.stringify(results.map(({ inputPath, inputSha256, records, shards }) => ({
		inputPath, inputSha256, records, shards: shards.map(({ path, records: count, sha256 }) => ({ path, records: count, sha256 }))
	})));
	const manifest = {
		schema: 'atlas.large-corpus-enrichment-shards.v1',
		status: 'LOCAL_SHARDS_SEALED_NONCANONICAL',
		createdAt: new Date().toISOString(),
		canonicalAuthority: false,
		outputDir: outputDir.replace(`${repoRoot}\\`, '').replaceAll('\\', '/'),
		shardRecordsMax: shardSize,
		workerCount,
		rootSha256: createHash('sha256').update(rootMaterial).digest('hex'),
		artifacts: results,
		invariants: {
			inputChecksumsVerified: true,
			identityInferred: false,
			sourceRevisionInferred: false,
			summaryGenerated: false,
			embeddingVectorsCopied: false,
			databaseWrites: 0,
			projectionWrites: 0,
			modelCalls: 0,
			graphifyRuns: 0
		},
		nextRequiredGate: 'CURRENT_SOURCE_IDENTITY_AND_REVISION_JOIN_REQUIRED'
	};
	writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
	console.log(JSON.stringify({ status: manifest.status, outputDir: manifest.outputDir, rootSha256: manifest.rootSha256, workerCount, artifacts: results.map(({ inputPath, records, shardCount }) => ({ inputPath, records, shardCount })), manifest: resolve(outputDir, 'manifest.json') }, null, 2));
}
