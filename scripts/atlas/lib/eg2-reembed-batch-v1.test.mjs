import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
	parseManifestV1,
	validateCheckpointV1,
	validateEmbeddingResponseV1,
	validateExecutionProfileV1,
	validateManifestSourceRowV1,
	validateTokenizeResponseV1,
	cosineV1,
	createRunGuardsV1,
	matchingProfileNamesV1,
	recipeFromCompileReceiptV1,
	validateWorkerHealthV1,
	verifyGpuRunV1,
} from './eg2-reembed-batch-v1.mjs';

const entry = {
	id: 'chunk-1',
	relativePath: 'src/a.ts',
	chunkContentHash: 'chunk-hash-1',
	inputSha256: 'a'.repeat(64),
	inputChars: 12,
	truncatedAt512: null,
};
const manifestBytes = Buffer.from(`${JSON.stringify(entry)}\n`, 'utf8');
const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');

test('manifest digest binds parsed entries and rejects duplicate source IDs', () => {
	const parsed = parseManifestV1(manifestBytes, { expectedSha256: manifestSha256, limit: 10 });
	assert.equal(parsed.manifestSha256, manifestSha256);
	assert.deepEqual(parsed.entries, [entry]);
	assert.throws(() => parseManifestV1(manifestBytes, { expectedSha256: '0'.repeat(64), limit: 10 }), /SHA256_MISMATCH/);
	const duplicate = Buffer.from(`${JSON.stringify(entry)}\n${JSON.stringify(entry)}\n`);
	const duplicateHash = createHash('sha256').update(duplicate).digest('hex');
	assert.throws(() => parseManifestV1(duplicate, { expectedSha256: duplicateHash, limit: 10 }), /DUPLICATE_ID/);
});

test('manifest source row is bound to exact ID, path, chunk hash, and prompt digest', () => {
	validateManifestSourceRowV1(entry, { id: 'chunk-1', relative_path: 'src/a.ts', content_hash: 'chunk-hash-1' }, 'a'.repeat(64));
	assert.throws(() => validateManifestSourceRowV1(entry, { id: 'chunk-1', relative_path: 'src/other.ts', content_hash: 'chunk-hash-1' }, 'a'.repeat(64)), /PATH_CHANGED/);
	assert.throws(() => validateManifestSourceRowV1(entry, { id: 'chunk-1', relative_path: 'src/a.ts', content_hash: 'new-hash' }, 'a'.repeat(64)), /HASH_CHANGED/);
	assert.throws(() => validateManifestSourceRowV1(entry, { id: 'chunk-1', relative_path: 'src/a.ts', content_hash: 'chunk-hash-1' }, 'b'.repeat(64)), /INPUT_SHA256_MISMATCH/);
});

test('token counts and embedding truncation flags must agree exactly', () => {
	const tokens = validateTokenizeResponseV1({ model_id: 'eg2', max_tokens: 512, token_counts: [12, 513], would_truncate: [false, true] }, 2);
	assert.deepEqual(tokens.wouldTruncate, [false, true]);
	const vectors = [Array(768).fill(0), Array(768).fill(0)];
	vectors[0][0] = 1;
	vectors[1][1] = 1;
	assert.equal(validateEmbeddingResponseV1({ model_id: 'eg2', count: 2, dims: [768], max_tokens: 512, truncated_count: 1, truncated_indices: [1], embeddings: { '768': vectors } }, 2, tokens.wouldTruncate).length, 2);
	assert.throws(() => validateEmbeddingResponseV1({ model_id: 'eg2', count: 2, dims: [768], max_tokens: 512, truncated_count: 0, truncated_indices: [], embeddings: { '768': vectors } }, 2, tokens.wouldTruncate), /EMBED_RESPONSE_INVALID/);
});

test('resume checkpoint is tied to manifest and representation identity', () => {
	const identity = { manifestSha256, representationId: 'eg2-rtx-v1', modelRevision: 'model-v1' };
	assert.deepEqual(validateCheckpointV1({ ...identity, lastId: 'chunk-1' }, identity), { lastId: 'chunk-1' });
	assert.throws(() => validateCheckpointV1({ ...identity, manifestSha256: '0'.repeat(64), lastId: 'chunk-1' }, identity), /CHECKPOINT_IDENTITY_MISMATCH/);
});

test('execution profile must be checksum-pinned and contain only TensorRT-RTX node events', () => {
	const profile = Buffer.from(JSON.stringify([
		{ cat: 'Node', args: { provider: 'NvTensorRTRTXExecutionProvider' } },
		{ cat: 'Session', args: {} },
	]));
	const sha = createHash('sha256').update(profile).digest('hex');
	assert.deepEqual(validateExecutionProfileV1(profile, sha), {
		profileSha256: sha,
		nodeEvents: 1,
		providerEvents: { NvTensorRTRTXExecutionProvider: 1 },
	});
	assert.throws(() => validateExecutionProfileV1(profile, '0'.repeat(64)), /PROFILE_SHA256_MISMATCH/);
	const mixed = Buffer.from(JSON.stringify([
		{ cat: 'Node', args: { provider: 'NvTensorRTRTXExecutionProvider' } },
		{ cat: 'Node', args: { provider: 'CPUExecutionProvider' } },
	]));
	assert.throws(() => validateExecutionProfileV1(mixed, createHash('sha256').update(mixed).digest('hex')), /NOT_EXCLUSIVE_TENSORRT_RTX/);
});

const TRT = 'NvTensorRTRTXExecutionProvider';
const hex = (c) => c.repeat(64);
const compileReceipt = Buffer.from(JSON.stringify({
	schema: 'atlas.eg2-rtx-ep-context.v1', status: 'PASS', ortVersion: '1.32.0',
	source: { path: 'graph.onnx', sha256: hex('1') }, weightsSha256: hex('2'), tokenizerSha256: hex('3'),
	artifacts: [{ path: 'model_trt_ctx.onnx', sha256: hex('4') }, { path: 'x.engine', sha256: hex('5') }],
}));
const shaOf = (bytes) => createHash('sha256').update(bytes).digest('hex');
const recipe = recipeFromCompileReceiptV1(compileReceipt, shaOf(compileReceipt));
const goodHealth = {
	status: 'ok', model_id: 'eg2', fallback_to_cpu: false, fallback_used: false,
	requested_providers: [TRT], providers: [TRT, 'CPUExecutionProvider'], max_tokens: 512, max_batch: 8,
	ort_version: '1.32.0', instance_id: 'abc', ort_profile_prefix: '/tmp/p/run',
	artifacts: { model_file_sha256: hex('4'), tokenizer_sha256: hex('3'), engines: [{ name: 'x.engine', sha256: hex('5') }] },
};

test('model revision is derived from the pinned compile receipt', () => {
	assert.match(recipe.modelRevision, /^eg2-trt-epcontext@sha256:[a-f0-9]{64}$/);
	assert.throws(() => recipeFromCompileReceiptV1(compileReceipt, hex('0')), /COMPILE_RECEIPT_SHA256_MISMATCH/);
	for (const mutate of [(r) => { r.weightsSha256 = 'x'; }, (r) => { r.artifacts.pop(); }, (r) => { r.status = 'FAIL'; }]) {
		const copy = JSON.parse(compileReceipt); mutate(copy);
		const bytes = Buffer.from(JSON.stringify(copy));
		assert.throws(() => recipeFromCompileReceiptV1(bytes, shaOf(bytes)), /COMPILE_RECEIPT/);
	}
});

test('worker must be strict, profiled and loaded from the recipe files', () => {
	const check = (patch) => validateWorkerHealthV1({ ...goodHealth, ...patch }, { expectedModelId: 'eg2', recipe });
	assert.equal(check({}).instanceId, 'abc');
	const refused = [
		[{ fallback_to_cpu: true }, /CPU_FALLBACK_NOT_DISABLED/],
		[{ fallback_to_cpu: undefined }, /CPU_FALLBACK_NOT_DISABLED/],
		[{ requested_providers: [TRT, 'CPUExecutionProvider'] }, /NOT_ADMITTED/],
		[{ artifacts: null }, /ARTIFACT_HASHES_MISSING/],
		[{ artifacts: { ...goodHealth.artifacts, model_file_sha256: hex('9') } }, /MODEL_FILE_SHA256/],
		[{ artifacts: { ...goodHealth.artifacts, tokenizer_sha256: hex('9') } }, /TOKENIZER_SHA256/],
		[{ artifacts: { ...goodHealth.artifacts, engines: [{ sha256: hex('9') }] } }, /ENGINE_SHA256/],
		[{ artifacts: { ...goodHealth.artifacts, engines: [...goodHealth.artifacts.engines, { sha256: hex('5') }] } }, /ENGINE_SHA256/],
		[{ ort_version: '1.31.0' }, /ORT_VERSION/],
		[{ instance_id: '' }, /INSTANCE_ID/],
		[{ ort_profile_prefix: null }, /PROFILING_NOT_ENABLED/],
	];
	for (const [patch, expected] of refused) assert.throws(() => check(patch), expected);
});

test('a run is accepted only on its own later profile with enough RTX-only events', () => {
	const run = { schema: 'atlas.eg2-gpu-run.v1', workerInstanceId: 'abc', profilePrefix: '/p/run-1',
		startedAt: '2026-11-28T10:00:00.000Z', embedRequests: 3 };
	const after = Date.parse(run.startedAt) + 1000;
	const events = (n, provider = TRT) => Buffer.from(JSON.stringify(Array.from({ length: n }, () => ({ cat: 'Node', args: { provider } }))));
	const profile = (bytes, mtimeMs = after) => ({ name: 'run-1_2026-11-28_02-00-00_001.json', bytes, mtimeMs });
	assert.equal(verifyGpuRunV1(run, [profile(events(3))]).nodeEvents, 3);
	assert.throws(() => verifyGpuRunV1(run, []), /PROFILE_NOT_FOUND/);
	assert.throws(() => verifyGpuRunV1(run, [profile(events(1))]), /TOO_FEW_EVENTS/);
	assert.throws(() => verifyGpuRunV1(run, [profile(events(343), after - 3_600_000)]), /OLDER_THAN_RUN/);
	assert.throws(() => verifyGpuRunV1(run, [profile(events(3)), profile(events(3))]), /AMBIGUOUS/);
	assert.throws(() => verifyGpuRunV1(run, [profile(events(3, 'CPUExecutionProvider'))]), /NOT_EXCLUSIVE/);
	assert.throws(() => verifyGpuRunV1({ ...run, embedRequests: 0 }, [profile(events(3))]), /NO_EMBED_REQUESTS/);
	assert.deepEqual(matchingProfileNamesV1([
		'run-1_2026-11-28_02-00-00_001.json', 'run-10_2026-11-28_02-00-00_001.json',
		'run-1_2026-11-28_02-00-00_001.json.acceptance.json', 'cold-http_2026-11-27_18-41-50_191.json',
	], 'run-1'), ['run-1_2026-11-28_02-00-00_001.json']);
});

test('checkpoint keeps the pending GPU run so a later apply can require acceptance', () => {
	const identity = { manifestSha256: hex('a'), representationId: 'r', modelRevision: 'm' };
	assert.deepEqual(validateCheckpointV1({ ...identity, lastId: 'x', gpuRunPath: '/runs/1.json' }, identity),
		{ lastId: 'x', gpuRunPath: '/runs/1.json' });
});

const unit = (i) => { const v = Array(768).fill(0); v[i] = 1; return v; };
const fakeProbes = (over = {}) => {
	const log = { sleeps: 0, vram: 0, reference: [] };
	return { log, probes: {
		getSlots: async () => [{ is_processing: false }],
		getFreeMiB: async () => { log.vram += 1; return 900; },
		referenceEmbed: async (text) => { log.reference.push(text); return unit(0); },
		sleep: async () => { log.sleeps += 1; },
		...over,
	} };
};

test('guards pause while llama-server is busy and time out if it never frees', async () => {
	const answers = [true, true, false];
	const { probes, log } = fakeProbes({ getSlots: async () => [{ is_processing: answers.shift() }] });
	const guards = createRunGuardsV1(probes);
	await guards.beforeBatch(0);
	assert.equal(log.sleeps, 2);
	assert.equal(guards.stats.busyPauses, 1);
	const stuck = createRunGuardsV1(fakeProbes({ getSlots: async () => [{ is_processing: true }] }).probes, { busyPollMs: 10, maxBusyWaitMs: 30 });
	await assert.rejects(stuck.beforeBatch(0), /LLAMA_BUSY_TIMEOUT/);
});

test('guards fail closed when a probe cannot answer', async () => {
	for (const [over, expected] of [
		[{ getSlots: async () => { throw new Error('ECONNREFUSED'); } }, /SLOTS_UNAVAILABLE/],
		[{ getSlots: async () => [] }, /SLOTS_UNREADABLE/],
		[{ getSlots: async () => [{}] }, /SLOTS_UNREADABLE/],
		[{ getFreeMiB: async () => Number.NaN }, /VRAM_UNREADABLE/],
	]) await assert.rejects(createRunGuardsV1(fakeProbes(over).probes).beforeBatch(0), expected);
});

test('guards enforce the free-VRAM floor on the sampling interval', async () => {
	const { probes, log } = fakeProbes();
	const guards = createRunGuardsV1(probes);
	for (let i = 0; i < 17; i += 1) await guards.beforeBatch(i);
	assert.equal(log.vram, 3);
	await assert.rejects(createRunGuardsV1(fakeProbes({ getFreeMiB: async () => 499 }).probes).beforeBatch(0), /BELOW_FLOOR/);
	await createRunGuardsV1(fakeProbes({ getFreeMiB: async () => 500 }).probes).beforeBatch(0);
});

test('guards check the longest sampled text against the reference and refuse drift', async () => {
	const { probes, log } = fakeProbes();
	const guards = createRunGuardsV1(probes);
	await guards.checkParity(0, ['a', 'longest', 'bb'], [unit(1), unit(0), unit(1)]);
	assert.deepEqual(log.reference, ['longest']);
	await guards.checkParity(1, ['x'], [unit(5)]);
	assert.equal(guards.stats.parityChecks, 1);
	await assert.rejects(guards.checkParity(128, ['x'], [unit(5)]), /PARITY_BELOW_THRESHOLD/);
	await assert.rejects(createRunGuardsV1(fakeProbes({ referenceEmbed: async () => undefined }).probes).checkParity(0, ['x'], [unit(0)]), /REFERENCE_INVALID/);
	assert.ok(Math.abs(cosineV1([1, 1], [2, 2]) - 1) < 1e-12);
});

