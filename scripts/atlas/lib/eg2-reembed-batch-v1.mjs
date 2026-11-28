import { createHash } from 'node:crypto';

export function sha256Hex(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

export function parseManifestV1(bytes, { expectedSha256, limit }) {
	if (!/^[a-f0-9]{64}$/i.test(String(expectedSha256 ?? ''))) {
		throw new Error('EG2_MANIFEST_SHA256_REQUIRED');
	}
	const manifestSha256 = sha256Hex(bytes);
	if (manifestSha256 !== String(expectedSha256).toLowerCase()) {
		throw new Error('EG2_MANIFEST_SHA256_MISMATCH');
	}
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 201587) {
		throw new Error('EG2_MANIFEST_LIMIT_INVALID');
	}
	const lines = Buffer.isBuffer(bytes) ? bytes.toString('utf8').split(/\r?\n/) : String(bytes).split(/\r?\n/);
	const entries = [];
	const ids = new Set();
	let previousId = '';
	for (const [index, line] of lines.entries()) {
		if (!line.trim()) continue;
		let item;
		try {
			item = JSON.parse(line);
		} catch {
			throw new Error(`EG2_MANIFEST_JSON_INVALID line=${index + 1}`);
		}
		if (
			typeof item.id !== 'string' || !item.id ||
			typeof item.relativePath !== 'string' || !item.relativePath ||
			typeof item.chunkContentHash !== 'string' || !item.chunkContentHash ||
			!/^[a-f0-9]{64}$/i.test(String(item.inputSha256 ?? ''))
		) {
			throw new Error(`EG2_MANIFEST_ENTRY_INVALID line=${index + 1}`);
		}
		if (ids.has(item.id)) throw new Error(`EG2_MANIFEST_DUPLICATE_ID id=${item.id}`);
		if (previousId && item.id <= previousId) throw new Error(`EG2_MANIFEST_NOT_STRICTLY_SORTED line=${index + 1}`);
		ids.add(item.id);
		previousId = item.id;
		if (entries.length < limit) entries.push(item);
	}
	if (entries.length === 0) throw new Error('EG2_MANIFEST_EMPTY');
	return { manifestSha256, entries };
}

export function validateManifestSourceRowV1(entry, row, formattedInputSha256) {
	if (!row) throw new Error(`EG2_SOURCE_ROW_MISSING id=${entry.id}`);
	if (String(row.id) !== entry.id) throw new Error(`EG2_SOURCE_ID_MISMATCH id=${entry.id}`);
	if (String(row.relative_path) !== entry.relativePath) throw new Error(`EG2_SOURCE_PATH_CHANGED id=${entry.id}`);
	if (String(row.content_hash ?? '') !== entry.chunkContentHash) {
		throw new Error(`EG2_SOURCE_HASH_CHANGED id=${entry.id}`);
	}
	if (formattedInputSha256 !== entry.inputSha256) {
		throw new Error(`EG2_INPUT_SHA256_MISMATCH id=${entry.id}`);
	}
}

export function validateTokenizeResponseV1(payload, count) {
	if (
		!payload || typeof payload.model_id !== 'string' || !payload.model_id ||
		payload.max_tokens !== 512 ||
		!Array.isArray(payload.token_counts) || payload.token_counts.length !== count ||
		!Array.isArray(payload.would_truncate) || payload.would_truncate.length !== count
	) throw new Error('EG2_TOKENIZE_RESPONSE_INVALID');
	for (let i = 0; i < count; i += 1) {
		if (!Number.isSafeInteger(payload.token_counts[i]) || payload.token_counts[i] < 0 ||
			typeof payload.would_truncate[i] !== 'boolean' ||
			payload.would_truncate[i] !== (payload.token_counts[i] > payload.max_tokens)) {
			throw new Error(`EG2_TOKENIZE_ITEM_INVALID index=${i}`);
		}
	}
	return { modelId: payload.model_id, tokenCounts: payload.token_counts, wouldTruncate: payload.would_truncate };
}

export function validateEmbeddingResponseV1(payload, count, expectedTruncation) {
	if (
		!payload || typeof payload.model_id !== 'string' ||
		payload.count !== count || payload.max_tokens !== 512 ||
		!Array.isArray(payload.dims) || payload.dims.length !== 1 || payload.dims[0] !== 768 ||
		!Array.isArray(payload.truncated_indices) ||
		payload.truncated_count !== payload.truncated_indices.length ||
		payload.truncated_count !== expectedTruncation.filter(Boolean).length
	) throw new Error('EG2_EMBED_RESPONSE_INVALID');
	const actualTruncated = new Set(payload.truncated_indices);
	if (actualTruncated.size !== payload.truncated_indices.length ||
		payload.truncated_indices.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= count)) {
		throw new Error('EG2_EMBED_TRUNCATION_INDICES_INVALID');
	}
	for (let i = 0; i < count; i += 1) {
		if (actualTruncated.has(i) !== expectedTruncation[i]) {
			throw new Error(`EG2_EMBED_TRUNCATION_MISMATCH index=${i}`);
		}
	}
	const vectors = payload.embeddings?.['768'];
	if (!Array.isArray(vectors) || vectors.length !== count) throw new Error('EG2_EMBED_VECTORS_MISSING');
	return vectors.map((vector, index) => {
		if (!Array.isArray(vector) || vector.length !== 768 ||
			vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
			throw new Error(`EG2_EMBED_VECTOR_INVALID index=${index}`);
		}
		const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
		if (!Number.isFinite(norm) || norm < 0.98 || norm > 1.02) {
			throw new Error(`EG2_EMBED_VECTOR_NOT_UNIT_NORMALIZED index=${index}`);
		}
		return vector;
	});
}

export function validateCheckpointV1(checkpoint, identity) {
	if (!checkpoint) return { lastId: '' };
	if (checkpoint.manifestSha256 !== identity.manifestSha256 ||
		checkpoint.representationId !== identity.representationId ||
		checkpoint.modelRevision !== identity.modelRevision ||
		typeof checkpoint.lastId !== 'string') {
		throw new Error('EG2_CHECKPOINT_IDENTITY_MISMATCH');
	}
	return {
		lastId: checkpoint.lastId,
		...(typeof checkpoint.gpuRunPath === 'string' ? { gpuRunPath: checkpoint.gpuRunPath } : {}),
	};
}

export function validateExecutionProfileV1(bytes, expectedSha256) {
	if (!/^[a-f0-9]{64}$/i.test(String(expectedSha256 ?? ''))) {
		throw new Error('EG2_GPU_PROFILE_SHA256_REQUIRED');
	}
	const profileSha256 = sha256Hex(bytes);
	if (profileSha256 !== String(expectedSha256).toLowerCase()) {
		throw new Error('EG2_GPU_PROFILE_SHA256_MISMATCH');
	}
	let events;
	try {
		events = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes));
	} catch {
		throw new Error('EG2_GPU_PROFILE_JSON_INVALID');
	}
	if (!Array.isArray(events)) throw new Error('EG2_GPU_PROFILE_EVENTS_INVALID');
	const nodeEvents = events.filter((event) => event?.cat === 'Node');
	const providers = nodeEvents.map((event) => event?.args?.provider).filter((provider) => typeof provider === 'string');
	const counts = Object.fromEntries([...new Set(providers)].map((provider) => [provider, providers.filter((item) => item === provider).length]));
	if (!nodeEvents.length || providers.length !== nodeEvents.length ||
		(counts.NvTensorRTRTXExecutionProvider ?? 0) < 1 ||
		Object.keys(counts).some((provider) => provider !== 'NvTensorRTRTXExecutionProvider')) {
		throw new Error(`EG2_GPU_PROFILE_NOT_EXCLUSIVE_TENSORRT_RTX nodeEvents=${nodeEvents.length} providers=${JSON.stringify(counts)}`);
	}
	return { profileSha256, nodeEvents: nodeEvents.length, providerEvents: counts };
}

const TRT_EP = 'NvTensorRTRTXExecutionProvider';
const SHA256_HEX = /^[a-f0-9]{64}$/;

/** The recipe (and so the stored model revision) comes only from a checksum-pinned passing compile receipt. */
export function recipeFromCompileReceiptV1(bytes, expectedSha256) {
	const receiptSha256 = sha256Hex(bytes);
	if (receiptSha256 !== String(expectedSha256 ?? '').toLowerCase()) throw new Error('EG2_COMPILE_RECEIPT_SHA256_MISMATCH');
	const receipt = JSON.parse(Buffer.from(bytes).toString('utf8'));
	if (receipt.schema !== 'atlas.eg2-rtx-ep-context.v1' || receipt.status !== 'PASS') {
		throw new Error('EG2_COMPILE_RECEIPT_NOT_PASSING');
	}
	const artifacts = Array.isArray(receipt.artifacts) ? receipt.artifacts : [];
	const context = artifacts.filter((a) => a.path === 'model_trt_ctx.onnx');
	const engines = artifacts.filter((a) => String(a.path).endsWith('.engine'));
	const fields = {
		sourceGraphSha256: receipt.source?.sha256,
		weightsSha256: receipt.weightsSha256,
		tokenizerSha256: receipt.tokenizerSha256,
		contextModelSha256: context.length === 1 ? context[0].sha256 : undefined,
		engineSha256: engines.length === 1 ? engines[0].sha256 : undefined,
	};
	for (const [name, value] of Object.entries(fields)) {
		if (!SHA256_HEX.test(String(value ?? ''))) throw new Error(`EG2_COMPILE_RECEIPT_FIELD_INVALID ${name}`);
	}
	if (typeof receipt.source?.path !== 'string' || typeof receipt.ortVersion !== 'string') {
		throw new Error('EG2_COMPILE_RECEIPT_FIELD_INVALID source.path/ortVersion');
	}
	return {
		...fields,
		sourceGraphPath: receipt.source.path,
		ortVersion: receipt.ortVersion,
		receiptSha256,
		modelRevision: `eg2-trt-epcontext@sha256:${sha256Hex(JSON.stringify(fields))}`,
	};
}

export function validateWorkerHealthV1(health, { expectedModelId, recipe }) {
	if (health?.status !== 'ok' || !expectedModelId || health.model_id !== expectedModelId) {
		throw new Error('EG2_WORKER_MODEL_IDENTITY_UNVERIFIED');
	}
	if (health.fallback_to_cpu !== false) throw new Error('EG2_WORKER_CPU_FALLBACK_NOT_DISABLED');
	const requested = Array.isArray(health.requested_providers) ? health.requested_providers : [];
	const providers = Array.isArray(health.providers) ? health.providers : [];
	// ORT lists CPU in session providers even in strict mode, so only the requested list must be exclusive.
	if (requested.length !== 1 || requested[0] !== TRT_EP || providers[0] !== TRT_EP || health.fallback_used !== false) {
		throw new Error('EG2_WORKER_TENSORRT_RTX_NOT_ADMITTED');
	}
	if (health.max_tokens !== 512 || !(health.max_batch >= 8)) throw new Error('EG2_WORKER_LIMITS_UNEXPECTED');
	if (health.ort_version !== recipe.ortVersion) throw new Error('EG2_WORKER_ORT_VERSION_MISMATCH');
	const artifacts = health.artifacts;
	if (!artifacts) throw new Error('EG2_WORKER_ARTIFACT_HASHES_MISSING set GEMMA2_REPORT_ARTIFACT_HASHES=1');
	if (artifacts.model_file_sha256 !== recipe.contextModelSha256) throw new Error('EG2_WORKER_MODEL_FILE_SHA256_MISMATCH');
	if (artifacts.tokenizer_sha256 !== recipe.tokenizerSha256) throw new Error('EG2_WORKER_TOKENIZER_SHA256_MISMATCH');
	if (artifacts.engines?.length !== 1 || artifacts.engines[0].sha256 !== recipe.engineSha256) {
		throw new Error('EG2_WORKER_ENGINE_SHA256_MISMATCH');
	}
	if (typeof health.instance_id !== 'string' || !health.instance_id) throw new Error('EG2_WORKER_INSTANCE_ID_MISSING');
	if (typeof health.ort_profile_prefix !== 'string' || !health.ort_profile_prefix) {
		throw new Error('EG2_WORKER_PROFILING_NOT_ENABLED');
	}
	return {
		modelId: health.model_id,
		instanceId: health.instance_id,
		profilePrefix: health.ort_profile_prefix,
		requestedProviders: requested,
		providers,
		artifacts,
	};
}

/** ORT names a profile `<prefix>_<date>_<time>_<ms>.json` when the session ends. */
export function matchingProfileNamesV1(names, prefixBase) {
	return names.filter((name) => name.startsWith(`${prefixBase}_`) &&
		/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_\d+\.json$/.test(name.slice(prefixBase.length + 1)));
}

/** Accept a run only on the single profile its own worker wrote after the run started. */
export function verifyGpuRunV1(run, profiles) {
	if (run?.schema !== 'atlas.eg2-gpu-run.v1' || !run.workerInstanceId || !run.profilePrefix) {
		throw new Error('EG2_GPU_RUN_RECORD_INVALID');
	}
	if (!Number.isSafeInteger(run.embedRequests) || run.embedRequests < 1) throw new Error('EG2_GPU_RUN_HAS_NO_EMBED_REQUESTS');
	if (profiles.length === 0) throw new Error('EG2_GPU_PROFILE_NOT_FOUND stop the worker so it writes its profile');
	if (profiles.length !== 1) throw new Error(`EG2_GPU_PROFILE_AMBIGUOUS count=${profiles.length}`);
	const [profile] = profiles;
	if (!(profile.mtimeMs >= Date.parse(run.startedAt))) throw new Error('EG2_GPU_PROFILE_OLDER_THAN_RUN');
	const proof = validateExecutionProfileV1(profile.bytes, sha256Hex(profile.bytes));
	if (proof.nodeEvents < run.embedRequests) {
		throw new Error(`EG2_GPU_PROFILE_TOO_FEW_EVENTS events=${proof.nodeEvents} requests=${run.embedRequests}`);
	}
	return { ...proof, profileName: profile.name };
}

export const RUN_GUARD_DEFAULTS_V1 = Object.freeze({
	minFreeMiB: 500,
	vramEveryBatches: 8, // spawning nvidia-smi for every batch would cost a large share of throughput
	parityEveryBatches: 128, // about every 1,024 chunks
	parityMinCosine: 0.999,
	busyPollMs: 5_000,
	maxBusyWaitMs: 15 * 60_000,
});

export function cosineV1(a, b) {
	let dot = 0, normA = 0, normB = 0;
	for (let i = 0; i < a.length; i += 1) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / Math.sqrt(normA * normB);
}

/**
 * Run-time gates for a worker run. Every probe that cannot answer is a failure, never a pass.
 * `beforeBatch` pauses while llama-server is busy and enforces the free-VRAM floor.
 * `checkParity` compares one vector per sampled batch with an independent reference, before any insert.
 */
export function createRunGuardsV1(probes, options = {}) {
	const config = { ...RUN_GUARD_DEFAULTS_V1, ...options };
	const stats = { busyPauses: 0, busyPausedMs: 0, vramChecks: 0, minFreeMiBSeen: null, parityChecks: 0, minParityCosine: null };

	async function isBusy() {
		let slots;
		try {
			slots = await probes.getSlots();
		} catch (error) {
			throw new Error(`EG2_LLAMA_SLOTS_UNAVAILABLE ${error.message}`);
		}
		if (!Array.isArray(slots) || slots.length === 0 || slots.some((slot) => typeof slot?.is_processing !== 'boolean')) {
			throw new Error('EG2_LLAMA_SLOTS_UNREADABLE');
		}
		return slots.some((slot) => slot.is_processing);
	}

	return {
		config,
		stats,
		async beforeBatch(index) {
			if (await isBusy()) {
				stats.busyPauses += 1;
				let waited = 0;
				do {
					if (waited >= config.maxBusyWaitMs) throw new Error(`EG2_LLAMA_BUSY_TIMEOUT waitedMs=${waited}`);
					await probes.sleep(config.busyPollMs);
					waited += config.busyPollMs;
					stats.busyPausedMs += config.busyPollMs;
				} while (await isBusy());
			}
			if (index % config.vramEveryBatches === 0) {
				const free = await probes.getFreeMiB();
				if (!Number.isFinite(free)) throw new Error('EG2_FREE_VRAM_UNREADABLE');
				stats.vramChecks += 1;
				stats.minFreeMiBSeen = stats.minFreeMiBSeen === null ? free : Math.min(stats.minFreeMiBSeen, free);
				if (free < config.minFreeMiB) throw new Error(`EG2_FREE_VRAM_BELOW_FLOOR free=${free} floor=${config.minFreeMiB}`);
			}
		},
		async checkParity(index, texts, vectors) {
			if (index % config.parityEveryBatches !== 0) return;
			// The longest text in the batch is the likeliest to expose truncation or precision differences.
			const pick = texts.reduce((best, text, i) => (text.length > texts[best].length ? i : best), 0);
			const reference = await probes.referenceEmbed(texts[pick]);
			if (!Array.isArray(reference) || reference.length !== 768 || reference.some((v) => !Number.isFinite(v))) {
				throw new Error('EG2_PARITY_REFERENCE_INVALID');
			}
			const cosine = cosineV1(vectors[pick], reference);
			stats.parityChecks += 1;
			stats.minParityCosine = stats.minParityCosine === null ? cosine : Math.min(stats.minParityCosine, cosine);
			if (!(cosine >= config.parityMinCosine)) {
				throw new Error(`EG2_PARITY_BELOW_THRESHOLD cosine=${cosine} min=${config.parityMinCosine} batch=${index}`);
			}
		},
	};
}
