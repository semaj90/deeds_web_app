// EG2 recipe-scoped batch writer. DRY-RUN is the default and never calls the embedder.
// APPLY requires an exact reviewed manifest digest, the recipe-key migration, and a strict
// TensorRT-RTX worker whose loaded files match a pinned compile receipt (which also names the
// model revision). This script does not apply schema changes.
// APPLY rows stay unaccepted until, after stopping that worker, `--verify-gpu-run=<run.json>` accepts
// the profile it wrote. `--check-worker` runs the same checks on 8 chunks without database writes.
// Usage: npx tsx scripts/atlas/build-eg2-index-batch-v1.mts --manifest=<eligible.ndjson> --manifest-sha256=<sha256> --representation-id=<id> --compile-receipt=<receipt.json> --compile-receipt-sha256=<sha256> [--limit=1000] [--apply|--check-worker --server-model-id=<id>] | --verify-gpu-run=<run.json>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
	parseManifestV1,
	validateCheckpointV1,
	validateEmbeddingResponseV1,
	createRunGuardsV1,
	matchingProfileNamesV1,
	recipeFromCompileReceiptV1,
	sha256Hex,
	validateWorkerHealthV1,
	verifyGpuRunV1,
	validateManifestSourceRowV1,
	validateTokenizeResponseV1,
} from './lib/eg2-reembed-batch-v1.mjs';
import { encodeRetrievalDocument, EMBEDDINGGEMMA_PROMPT_REVISION_V1 } from '../../sveltekit-frontend/src/lib/server/atlas/embedding/embeddinggemma-task-representation-v1.ts';

const require = createRequire(path.resolve('sveltekit-frontend/package.json'));
const { Client } = require('pg');

function flag(name: string): string | undefined {
	const prefix = `--${name}=`;
	const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
	return value?.slice(prefix.length);
}

function requiredFlag(name: string): string {
	const value = flag(name)?.trim();
	if (!value) throw new Error(`EG2_REQUIRED_FLAG --${name}`);
	return value;
}

function loadDatabaseUrl(repoRoot: string): string {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
	const envPath = existsSync(path.join(repoRoot, 'sveltekit-frontend/.env'))
		? path.join(repoRoot, 'sveltekit-frontend/.env')
		: path.join(repoRoot, '.env');
	const line = readFileSync(envPath, 'utf8').split(/\r?\n/).find((item) => /^\s*DATABASE_URL\s*=/.test(item));
	const value = line?.slice(line.indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
	if (!value) throw new Error('DATABASE_URL missing in environment or local .env');
	return value;
}

async function postJson(url: string, body: unknown, timeoutMs = 90_000): Promise<any> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok) throw new Error(`EG2_WORKER_HTTP_${response.status} url=${url}`);
	return response.json();
}

async function getJson(url: string): Promise<any> {
	const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
	if (!response.ok) throw new Error(`EG2_WORKER_HEALTH_HTTP_${response.status}`);
	return response.json();
}

/** Offline step, run after the worker has stopped. Reads local files only; no database or worker. */
function verifyGpuRun(runPath: string) {
	const runBytes = readFileSync(runPath);
	const run = JSON.parse(runBytes.toString('utf8'));
	const directory = path.dirname(String(run.profilePrefix));
	const names = matchingProfileNamesV1(readdirSync(directory), path.basename(String(run.profilePrefix)));
	const proof = verifyGpuRunV1(run, names.map((name: string) => {
		const file = path.join(directory, name);
		return { name, bytes: readFileSync(file), mtimeMs: statSync(file).mtimeMs };
	}));
	const acceptance = {
		schema: 'atlas.eg2-gpu-run-acceptance.v1', status: 'ACCEPTED', verifiedAt: new Date().toISOString(),
		runSha256: sha256Hex(runBytes), workerInstanceId: run.workerInstanceId, mode: run.mode,
		embedRequests: run.embedRequests, insertedRows: run.insertedRows, proof,
	};
	writeFileSync(`${runPath}.acceptance.json`, JSON.stringify(acceptance, null, 2) + '\n', { flag: 'wx' });
	console.log(JSON.stringify(acceptance, null, 2));
}

function assertPreviousRunAccepted(runPath: string) {
	const acceptancePath = `${runPath}.acceptance.json`;
	let accepted = false;
	if (existsSync(runPath) && existsSync(acceptancePath)) {
		const record = JSON.parse(readFileSync(acceptancePath, 'utf8'));
		accepted = record.status === 'ACCEPTED' && record.runSha256 === sha256Hex(readFileSync(runPath));
	}
	if (!accepted) throw new Error(`EG2_PREVIOUS_RUN_NOT_GPU_VERIFIED run=${runPath}`);
}

const verifyRunPath = flag('verify-gpu-run');
if (verifyRunPath) {
	verifyGpuRun(path.resolve(verifyRunPath));
	process.exit(0);
}

const repoRoot = path.resolve('.');
const manifestPath = path.resolve(requiredFlag('manifest'));
const expectedManifestSha256 = requiredFlag('manifest-sha256').toLowerCase();
const representationId = requiredFlag('representation-id');
const recipe = recipeFromCompileReceiptV1(readFileSync(path.resolve(requiredFlag('compile-receipt'))), requiredFlag('compile-receipt-sha256'));
// The graph and weights are compile inputs (the engine embeds them), so check those lineage files here.
for (const [file, expected] of [
	[recipe.sourceGraphPath, recipe.sourceGraphSha256],
	[path.join(path.dirname(recipe.sourceGraphPath), 'model.onnx_data'), recipe.weightsSha256],
] as const) {
	if (sha256Hex(readFileSync(file)) !== expected) throw new Error(`EG2_SOURCE_ARTIFACT_SHA256_MISMATCH file=${file}`);
}
const modelRevision = recipe.modelRevision;
if (flag('model-revision') && flag('model-revision') !== modelRevision) {
	throw new Error(`EG2_MODEL_REVISION_IS_DERIVED expected=${modelRevision}`);
}
const applyWrites = process.argv.includes('--apply');
const checkWorker = process.argv.includes('--check-worker');
if (applyWrites && checkWorker) throw new Error('EG2_APPLY_AND_CHECK_WORKER_ARE_EXCLUSIVE');
const useWorker = applyWrites || checkWorker;
const limit = Number(flag('limit') ?? (checkWorker ? '8' : '1000'));
const batchSize = 8;
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 201587) throw new Error('EG2_LIMIT_INVALID');
if (!/^[a-f0-9]{64}$/.test(expectedManifestSha256)) throw new Error('EG2_MANIFEST_SHA256_INVALID');
const manifestBytes = readFileSync(manifestPath);
const parsedManifest = parseManifestV1(manifestBytes, { expectedSha256: expectedManifestSha256, limit: 201587 });
const identity = { manifestSha256: parsedManifest.manifestSha256, representationId, modelRevision };
const checkpointPath = path.resolve(flag('checkpoint') ?? path.join('.tmp', 'review', 'eg2-checkpoints', `${parsedManifest.manifestSha256.slice(0, 16)}.json`));
const checkpointRoot = path.resolve(repoRoot, '.tmp', 'review', 'eg2-checkpoints');
if (!checkpointPath.startsWith(checkpointRoot + path.sep)) throw new Error('EG2_CHECKPOINT_PATH_OUTSIDE_REVIEW_DIR');
const checkpoint = existsSync(checkpointPath)
	? validateCheckpointV1(JSON.parse(readFileSync(checkpointPath, 'utf8')), identity)
	: { lastId: '' };
if (checkpoint.lastId && !parsedManifest.entries.some((entry: any) => entry.id === checkpoint.lastId)) {
	throw new Error('EG2_CHECKPOINT_LAST_ID_NOT_IN_MANIFEST');
}
const entries = parsedManifest.entries.filter((entry: any) => entry.id > checkpoint.lastId).slice(0, limit);

const embedUrl = (flag('embed-url') ?? process.env.EG2_EMBED_URL ?? 'http://127.0.0.1:18094').replace(/\/+$/, '');
const workerUrl = new URL(embedUrl);
if (workerUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(workerUrl.hostname)) {
	throw new Error('EG2_WORKER_URL_MUST_BE_LOOPBACK_HTTP');
}
const expectedServerModelId = flag('server-model-id');
if (useWorker && !expectedServerModelId) throw new Error('EG2_SERVER_MODEL_ID_REQUIRED');
if (applyWrites && 'gpuRunPath' in checkpoint && checkpoint.gpuRunPath) assertPreviousRunAccepted(String(checkpoint.gpuRunPath));
const databaseUrl = loadDatabaseUrl(repoRoot);
const client = new Client({ connectionString: databaseUrl });
await client.connect();

const counts = { requested: limit, selected: entries.length, sourceMatched: 0, alreadyPresent: 0, inserted: 0, truncated: 0 };
const startedAt = Date.now();
let workerIdentity: ReturnType<typeof validateWorkerHealthV1> | null = null;
let gpuRun: any = null;
let gpuRunPath: string | null = null;

const saveGpuRun = () => writeFileSync(gpuRunPath!, JSON.stringify(gpuRun, null, 2) + '\n');

/** Admit the worker and open the run record before any request, so a crash still leaves it pending. */
async function admitWorker() {
	workerIdentity = validateWorkerHealthV1(await getJson(`${embedUrl}/health`), { expectedModelId: expectedServerModelId!, recipe });
	const prefix = workerIdentity.profilePrefix;
	if (!path.isAbsolute(prefix) || !existsSync(path.dirname(prefix))) throw new Error('EG2_WORKER_PROFILE_PREFIX_MUST_BE_ABSOLUTE_AND_LOCAL');
	if (matchingProfileNamesV1(readdirSync(path.dirname(prefix)), path.basename(prefix)).length > 0) {
		throw new Error('EG2_WORKER_PROFILE_PREFIX_ALREADY_USED start the worker with a new ORT_PROFILE_PREFIX');
	}
	const reference = await getJson(`${referenceUrl}/health`);
	if (reference?.status !== 'ok' || reference.max_tokens !== 512 || typeof reference.model_id !== 'string') {
		throw new Error('EG2_PARITY_REFERENCE_NOT_READY');
	}
	if (reference.model_id === workerIdentity.modelId) throw new Error('EG2_PARITY_REFERENCE_MUST_BE_A_DIFFERENT_MODEL_BUILD');
	referenceModelId = reference.model_id;
	const runDir = path.join(repoRoot, '.tmp', 'review', 'eg2-gpu-runs');
	mkdirSync(runDir, { recursive: true });
	gpuRunPath = path.join(runDir, `${Date.now()}-${workerIdentity.instanceId}.json`);
	gpuRun = {
		schema: 'atlas.eg2-gpu-run.v1', status: 'PENDING_GPU_VERIFICATION', mode: applyWrites ? 'APPLY' : 'CHECK_WORKER',
		startedAt: new Date().toISOString(), workerInstanceId: workerIdentity.instanceId, profilePrefix: prefix,
		manifestSha256: parsedManifest.manifestSha256, representationId, modelRevision, recipe,
		embedRequests: 0, insertedRows: 0, referenceModelId, guardConfig: guards.config,
	};
	writeFileSync(gpuRunPath, JSON.stringify(gpuRun, null, 2) + '\n', { flag: 'wx' });
}

const llamaUrl = (flag('llama-url') ?? 'http://127.0.0.1:8090').replace(/\/+$/, '');
const referenceUrl = (flag('reference-url') ?? 'http://127.0.0.1:8094').replace(/\/+$/, '');
for (const url of [llamaUrl, referenceUrl]) {
	const { protocol, hostname } = new URL(url);
	if (protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) throw new Error(`EG2_GUARD_URL_MUST_BE_LOOPBACK_HTTP url=${url}`);
}
// Thresholds are fixed in the helper; only the endpoints can be pointed elsewhere.
const guards = createRunGuardsV1({
	getSlots: () => getJson(`${llamaUrl}/slots`),
	getFreeMiB: () => Number(execFileSync('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 10_000 }).trim().split(/\r?\n/)[0]),
	referenceEmbed: async (text: string) => (await postJson(`${referenceUrl}/embed`, { texts: [text], dims: [768] }, 180_000)).embeddings?.['768']?.[0],
	sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
});
let referenceModelId: string | null = null;
let guardedBatches = 0;

async function embedOnAdmittedWorker(texts: string[]) {
	const batchIndex = guardedBatches++;
	await guards.beforeBatch(batchIndex);
	const sameWorker = (payload: any) => {
		if (payload.model_id !== workerIdentity!.modelId) throw new Error('EG2_RESPONSE_MODEL_ID_MISMATCH');
		if (payload.instance_id !== workerIdentity!.instanceId) throw new Error('EG2_WORKER_RESTARTED_OR_CHANGED');
	};
	const tokenPayload = await postJson(`${embedUrl}/tokenize`, { texts });
	sameWorker(tokenPayload);
	const tokenInfo = validateTokenizeResponseV1(tokenPayload, texts.length);
	const embedPayload = await postJson(`${embedUrl}/embed`, { texts, dims: [768] });
	sameWorker(embedPayload);
	const vectors = validateEmbeddingResponseV1(embedPayload, texts.length, tokenInfo.wouldTruncate);
	gpuRun.embedRequests += 1;
	saveGpuRun();
	await guards.checkParity(batchIndex, texts, vectors);
	gpuRun.guards = guards.stats;
	saveGpuRun();
	return { tokenInfo, vectors };
}
const fileCache = new Map<string, string>();
let fileCacheBytes = 0;

function assertExactDiskText(relativePath: string, content: string, sourceId: string) {
	const absolutePath = path.resolve(repoRoot, relativePath);
	const relative = path.relative(repoRoot, absolutePath);
	if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new Error(`EG2_SOURCE_PATH_OUTSIDE_WORKSPACE id=${sourceId}`);
	}
	let file = fileCache.get(absolutePath);
	if (file === undefined) {
		file = readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n');
		const bytes = Buffer.byteLength(file, 'utf8');
		if (bytes <= 32 * 1024 * 1024) {
			fileCache.set(absolutePath, file);
			fileCacheBytes += bytes;
			while (fileCacheBytes > 32 * 1024 * 1024) {
				const oldest = fileCache.keys().next().value!;
				fileCacheBytes -= Buffer.byteLength(fileCache.get(oldest) ?? '', 'utf8');
				fileCache.delete(oldest);
			}
		}
	}
	const needle = content.replace(/\r\n/g, '\n').trim();
	if (!needle || !file.includes(needle)) throw new Error(`EG2_EXACT_PATH_TEXT_MISMATCH id=${sourceId}`);
}

async function fetchRows(batch: any[], lock = false) {
	const ids = batch.map((entry) => entry.id);
	const result = await client.query(
		`SELECT c.id::text AS id, c.relative_path, c.domain, c.content_hash, c.content,
		        e.source_id IS NOT NULL AS target_present,
		        to_jsonb(e)->>'input_sha256' AS input_sha256,
		        to_jsonb(e)->>'input_truncated' AS input_truncated,
		        vector_dims(e.embedding) AS vector_dim
		   FROM codebase_chunk_index c
		   LEFT JOIN codebase_chunk_eg2_embeddings e
		     ON e.source_id = c.id AND e.representation_id = $2 AND e.model_revision = $3
		  WHERE c.id::text = ANY($1::text[])
		  ${lock ? 'FOR SHARE OF c' : ''}`,
		[ids, representationId, modelRevision],
	);
	return new Map(result.rows.map((row: any) => [String(row.id), row]));
}

async function validateBatch(batch: any[], rows: Map<string, any>) {
	const prepared = [];
	for (const entry of batch) {
		const row = rows.get(entry.id);
		if (!row) throw new Error(`EG2_SOURCE_ROW_MISSING id=${entry.id}`);
		assertExactDiskText(String(row.relative_path), String(row.content), entry.id);
		const formatted = encodeRetrievalDocument(String(row.content), String(row.relative_path));
		const inputSha256 = createHash('sha256').update(formatted.formattedText, 'utf8').digest('hex');
		validateManifestSourceRowV1(entry, row, inputSha256);
		if (row.target_present && row.input_sha256 !== entry.inputSha256) {
			throw new Error(`EG2_EXISTING_RECIPE_INPUT_DIGEST_MISMATCH id=${entry.id}`);
		}
		if (row.target_present && !['true', 'false'].includes(String(row.input_truncated))) {
			throw new Error(`EG2_EXISTING_RECIPE_TRUNCATION_UNVERIFIED id=${entry.id}`);
		}
		if (row.target_present && row.vector_dim !== 768) {
			throw new Error(`EG2_EXISTING_RECIPE_DIMENSION_MISMATCH id=${entry.id}`);
		}
		prepared.push({ entry, row, text: formatted.formattedText, inputSha256 });
	}
	return prepared;
}

try {
	if (!applyWrites) await client.query('BEGIN READ ONLY');
	if (checkWorker) await admitWorker();
	if (applyWrites && entries.length > 0) {
		const schema = await client.query(
			`SELECT pg_get_constraintdef(oid) AS pk
			   FROM pg_constraint
		  WHERE conrelid='public.codebase_chunk_eg2_embeddings'::regclass AND contype='p'`
		);
		const pk = String(schema.rows[0]?.pk ?? '');
		const requiredColumns = await client.query(
			`SELECT count(*)::int AS n FROM information_schema.columns
			  WHERE table_schema='public' AND table_name='codebase_chunk_eg2_embeddings'
			    AND column_name IN ('input_sha256','input_truncated')`,
		);
		if (!pk.includes('representation_id') || !pk.includes('model_revision') || requiredColumns.rows[0]?.n !== 2) {
			throw new Error(`EG2_RECIPE_PRIMARY_KEY_REQUIRED: pk=${pk}; apply the reviewed migration first`);
		}
		await admitWorker();
	}

	for (let offset = 0; offset < entries.length; offset += batchSize) {
		const batch = entries.slice(offset, offset + batchSize);
		const rows = await fetchRows(batch);
		const prepared = await validateBatch(batch, rows);
		counts.sourceMatched += prepared.length;
		const needsEmbedding = prepared.filter((item) => !item.row.target_present);
		if (checkWorker) {
			const { tokenInfo } = await embedOnAdmittedWorker(prepared.map((item) => item.text));
			counts.truncated += tokenInfo.wouldTruncate.filter(Boolean).length;
			continue;
		}
		if (!applyWrites) {
			counts.alreadyPresent += prepared.length - needsEmbedding.length;
			continue;
		}
		if (needsEmbedding.length === 0) {
			counts.alreadyPresent += prepared.length;
		} else {
			const texts = needsEmbedding.map((item) => item.text);
			const { tokenInfo, vectors } = await embedOnAdmittedWorker(texts);
			counts.truncated += tokenInfo.wouldTruncate.filter(Boolean).length;

			await client.query('BEGIN');
			try {
				const freshRows = await fetchRows(batch, true);
				const fresh = await validateBatch(batch, freshRows);
				const freshById = new Map(fresh.map((item: any) => [item.entry.id, item]));
				const truncationById = new Map(needsEmbedding.map((item, i) => [item.entry.id, tokenInfo.wouldTruncate[i]]));
				for (let i = 0; i < needsEmbedding.length; i += 1) {
					const item = needsEmbedding[i];
					const current = freshById.get(item.entry.id) as any;
					if (current.row.target_present) {
						counts.alreadyPresent += 1;
						continue;
					}
					const literal = `[${vectors[i].join(',')}]`;
					const result = await client.query(
						`INSERT INTO codebase_chunk_eg2_embeddings
						   (source_id, relative_path, domain, content_hash, representation_id, model_revision, embedding, input_sha256, input_truncated)
						 VALUES ($1, $2, $3, $4, $5, $6, $7::halfvec, $8, $9)
						 ON CONFLICT (source_id, representation_id, model_revision) DO NOTHING`,
						[item.entry.id, current.row.relative_path, current.row.domain, current.row.content_hash,
						 representationId, modelRevision, literal, current.inputSha256, tokenInfo.wouldTruncate[i]],
					);
					counts.inserted += result.rowCount ?? 0;
				}
				const readback = await fetchRows(batch, true);
				for (const item of fresh) {
					const row = readback.get(item.entry.id);
					const expectedTruncated = truncationById.get(item.entry.id);
					if (!row?.target_present || row.input_sha256 !== item.entry.inputSha256 || row.vector_dim !== 768 ||
						(expectedTruncated !== undefined && row.input_truncated !== String(expectedTruncated))) {
						throw new Error(`EG2_BATCH_READBACK_MISMATCH id=${item.entry.id}`);
					}
				}
				await client.query('COMMIT');
				gpuRun.insertedRows = counts.inserted;
				saveGpuRun();
			} catch (error) {
				await client.query('ROLLBACK');
				throw error;
			}
		}
		if (applyWrites) {
			mkdirSync(path.dirname(checkpointPath), { recursive: true });
			writeFileSync(checkpointPath, JSON.stringify({ ...identity, lastId: batch.at(-1)!.id, ...(gpuRunPath ? { gpuRunPath } : {}), updatedAt: new Date().toISOString() }) + '\n');
		}
		if ((offset + batch.length) % 128 === 0 || offset + batch.length === entries.length) {
			const elapsed = Date.now() - startedAt;
			console.log(JSON.stringify({ progress: Math.min(offset + batch.length, entries.length), total: entries.length, elapsedMs: elapsed }));
		}
	}
	if (!applyWrites) await client.query('ROLLBACK');
	const receipt = {
		schema: 'atlas.eg2-challenger-index-batch.v2',
		mode: applyWrites ? 'APPLY' : checkWorker ? 'CHECK_WORKER' : 'DRY_RUN',
		acceptanceStatus: gpuRun?.embedRequests > 0 ? 'PENDING_GPU_VERIFICATION' : 'NOT_APPLICABLE',
		gpuRunPath: gpuRunPath ? path.relative(repoRoot, gpuRunPath) : null,
		recipe,
		generatedAt: new Date().toISOString(),
		manifestPath: path.relative(repoRoot, manifestPath),
		manifestSha256: parsedManifest.manifestSha256,
		table: 'codebase_chunk_eg2_embeddings',
		representationId,
		modelRevision,
		worker: workerIdentity,
		guards: gpuRun ? { config: guards.config, stats: guards.stats, referenceModelId } : null,
		promptRevision: EMBEDDINGGEMMA_PROMPT_REVISION_V1,
		batchSize,
		canonicalAuthority: false,
		writesPerformed: applyWrites && counts.inserted > 0,
		counts,
		elapsedMs: Date.now() - startedAt,
	};
	const outDir = path.join(repoRoot, '.tmp', 'review');
	mkdirSync(outDir, { recursive: true });
	const out = path.join(outDir, `eg2-index-batch-${applyWrites ? 'apply' : checkWorker ? 'checkworker' : 'dryrun'}-${Date.now()}.json`);
	writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
	console.log(JSON.stringify({ ...receipt, receipt: path.relative(repoRoot, out) }, null, 2));
} finally {
	await client.end();
}
