/**
 * Server-Side ONNX Runtime Session Factory
 *
 * embeddinggemma execution policy when EMBEDDING_BACKEND=onnx_directml:
 *   DirectML (Windows/D3D12) -> CPU ONNX Runtime -> caller-owned network cascade.
 *
 * The caller-owned cascade is important: this module returns null when local
 * ONNX inference cannot produce a valid vector; /api/embed then falls through
 * to embedText(), whose existing transport chain can reach Ollama. This module
 * never silently returns a synthetic or zero vector.
 */

import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { cpus } from 'os';
import { validateSemantic768OutputV1 } from '../atlas/embedding/embedding-runtime-v1.js';

// onnxruntime-node types
type InferenceSession = import('onnxruntime-node').InferenceSession;
type Tensor = import('onnxruntime-node').Tensor;

/** Known model IDs and their on-disk paths (relative to project root). */
const MODEL_PATHS: Record<string, string[]> = {
	embeddinggemma: [
		// Historical/static locations remain valid for older workstations.
		'static/embeddinggemma_300m_onnx/model.onnx',
		'static/models/embeddinggemma_300m_onnx/model.onnx',
		// Canonical local model storage. repo-root models/.gitignore excludes
		// *.onnx, so the ~300 MB weight stays workstation-local while tokenizer
		// metadata may remain tracked/discoverable.
		'models/embeddinggemma_300m_onnx/model.onnx',
	],
	gemma270m: [
		'static/gemma3_270m_onnx/gemma3_270m_w8a16.onnx',
		'static/gemma3_270m_onnx/gemma3_client_quantized.onnx',
	],
	yolov8: [
		'models/yolov8n.onnx',
	],
};

/** Session cache: modelId -> one successfully-created execution-provider session. */
const sessionCache = new Map<string, Promise<SessionInfo>>();

interface SessionInfo {
	session: InferenceSession;
	provider: string;
	modelPath: string;
	modelChecksum: string;
	representationId: 'semantic_768';
	representationRevision: string;
	loadTimeMs: number;
	cpuThreads: { intraOpNumThreads: number; interOpNumThreads: number } | null;
}

const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_MAX_TOKENS = 512;
const EMBEDDING_REPRESENTATION_ID = 'semantic_768' as const;
let tokenizerCache: Promise<any> | null = null;
let embeddingRunQueue: Promise<void> = Promise.resolve();

function sha256Bytes(bytes: Uint8Array): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function positiveIntEnv(name: string, fallback: number, max = 64): number {
	const parsed = Number.parseInt(String(process.env[name] ?? ''), 10);
	if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

/**
 * ONNX Runtime owns the CPU worker pool. We deliberately do not create N Node
 * worker_threads each loading a ~300 MB model, which would duplicate model
 * memory and tokenizer state. Intra-op workers parallelize kernels inside one
 * session; inter-op remains 1 by default for predictable dev latency.
 */
function getCpuThreadOptions(): { intraOpNumThreads: number; interOpNumThreads: number } {
	const logical = Math.max(1, cpus().length);
	const defaultIntra = Math.max(1, Math.min(4, logical));
	return {
		intraOpNumThreads: positiveIntEnv('ONNX_CPU_INTRA_OP_THREADS', defaultIntra, logical),
		interOpNumThreads: positiveIntEnv('ONNX_CPU_INTER_OP_THREADS', 1, logical),
	};
}

async function ensureEmbeddingTokenizer(modelDir: string): Promise<any> {
	if (tokenizerCache) return tokenizerCache;
	tokenizerCache = (async () => {
		const transformers = await import('@huggingface/transformers');
		transformers.env.allowLocalModels = true;
		transformers.env.allowRemoteModels = false;
		return transformers.AutoTokenizer.from_pretrained(modelDir, { local_files_only: true });
	})();
	try {
		return await tokenizerCache;
	} catch (error) {
		tokenizerCache = null;
		throw new Error(`EMBEDDINGGEMMA_TOKENIZER_UNAVAILABLE:${(error as Error).message}`);
	}
}

/** Lazy-loaded onnxruntime-node module. */
let ortNode: typeof import('onnxruntime-node') | null = null;

async function ensureOrt(): Promise<typeof import('onnxruntime-node')> {
	if (ortNode) return ortNode;
	ortNode = await import('onnxruntime-node');
	return ortNode;
}

/** Resolve a local model without assuming weights are tracked by Git. */
function resolveModelPath(modelId: string): string {
	const candidates = MODEL_PATHS[modelId];
	if (!candidates) {
		if (existsSync(modelId)) return modelId;
		throw new Error(`[ONNX-Server] Unknown model "${modelId}" and file not found`);
	}

	const baseDir = resolve(process.cwd());
	for (const candidate of candidates) {
		const full = resolve(baseDir, candidate);
		if (existsSync(full)) return full;
	}

	const projectRoot = resolve(baseDir, '..');
	for (const candidate of candidates) {
		const full = resolve(projectRoot, candidate);
		if (existsSync(full)) return full;
	}

	throw new Error(
		`[ONNX-Server] Model "${modelId}" not found. Checked:\n` +
		candidates.flatMap((candidate) => [resolve(baseDir, candidate), resolve(projectRoot, candidate)])
			.map((candidate) => `  - ${candidate}`)
			.join('\n')
	);
}

/**
 * Provider order for the local in-process lane.
 *
 * DirectML mode intentionally does not try CUDA: Ornith/llama.cpp already owns
 * the CUDA synthesis lane on :8090 and an additional CUDA context is exactly
 * the contention this DirectML path is meant to avoid. CPU is the bounded
 * local fallback. Other callers retain legacy CUDA -> CPU behavior.
 */
function getServerProviders(): string[] {
	const wantDirectML = process.env.EMBEDDING_BACKEND === 'onnx_directml' && process.platform === 'win32';
	if (wantDirectML) return ['dml', 'cpu'];

	const hasCuda = process.env.CUDA_VISIBLE_DEVICES !== '-1' &&
		(process.env.ONNX_USE_CUDA === '1' || process.env.CUDA_VISIBLE_DEVICES !== undefined);
	return hasCuda ? ['cuda', 'cpu'] : ['cpu'];
}

/**
 * Create or retrieve a memoized InferenceSession for the given model.
 *
 * Set ONNX_STRICT_DIRECTML=1 (or legacy ONNX_ALLOW_CPU_FALLBACK=0) only for a
 * diagnostic that must prove DirectML specifically. Routine dev:gpu behavior
 * is DirectML -> CPU, then the caller can fall back to Ollama.
 */
export async function getServerOnnxSession(
	modelId: string,
	preferredEps?: string[]
): Promise<SessionInfo> {
	const cached = sessionCache.get(modelId);
	if (cached) return cached;

	const promise = _createServerSession(modelId, preferredEps);
	sessionCache.set(modelId, promise);
	promise.catch(() => sessionCache.delete(modelId));
	return promise;
}

async function _createServerSession(
	modelId: string,
	preferredEps?: string[]
): Promise<SessionInfo> {
	const ort = await ensureOrt();
	const modelPath = resolveModelPath(modelId);
	const requestedEps = preferredEps ?? getServerProviders();
	const directMlMode = process.env.EMBEDDING_BACKEND === 'onnx_directml';
	const strictDirectML = directMlMode && (
		process.env.ONNX_STRICT_DIRECTML === '1' || process.env.ONNX_ALLOW_CPU_FALLBACK === '0'
	);
	const eps = strictDirectML ? requestedEps.filter((ep) => ep === 'dml') : requestedEps;
	const cpuThreads = getCpuThreadOptions();

	if (eps.length === 0) {
		throw new Error('[ONNX-Server] No execution provider remains after strict provider filtering');
	}

	console.info(`[ONNX-Server] Loading model: ${modelId} (${modelPath})`);
	console.info(`[ONNX-Server] Trying providers: ${eps.join(' → ')}`);

	const startTime = performance.now();
	const modelBuffer = readFileSync(modelPath);
	const modelChecksum = sha256Bytes(modelBuffer);

	let lastError: Error | null = null;
	for (const ep of eps) {
		try {
			const options: import('onnxruntime-node').InferenceSession.SessionOptions = {
				executionProviders: [ep as any],
				graphOptimizationLevel: 'all',
			};
			if (ep === 'dml') {
				options.enableMemPattern = false;
				options.executionMode = 'sequential';
			} else if (ep === 'cpu') {
				options.intraOpNumThreads = cpuThreads.intraOpNumThreads;
				options.interOpNumThreads = cpuThreads.interOpNumThreads;
				options.executionMode = cpuThreads.interOpNumThreads > 1 ? 'parallel' : 'sequential';
			}

			const session = await ort.InferenceSession.create(
				modelBuffer.buffer as ArrayBuffer,
				options,
			);

			const loadTimeMs = Math.round(performance.now() - startTime);
			const label = ep === 'cuda' ? 'CUDA (GPU)' : ep === 'dml' ? 'DirectML (GPU)' : 'CPU';
			console.info(`[ONNX-Server] ${modelId} loaded with ${label} in ${loadTimeMs}ms`);
			if (ep === 'cpu') {
				console.info(`[ONNX-Server] CPU workers: intra-op=${cpuThreads.intraOpNumThreads}, inter-op=${cpuThreads.interOpNumThreads}`);
			}
			console.info(`[ONNX-Server] Inputs: ${session.inputNames.join(', ')}`);
			console.info(`[ONNX-Server] Outputs: ${session.outputNames.join(', ')}`);

			return {
				session,
				provider: ep,
				modelPath,
				modelChecksum,
				representationId: EMBEDDING_REPRESENTATION_ID,
				representationRevision: `${EMBEDDING_REPRESENTATION_ID}:${modelChecksum}`,
				loadTimeMs,
				cpuThreads: ep === 'cpu' ? cpuThreads : null,
			};
		} catch (err) {
			console.warn(`[ONNX-Server] Provider "${ep}" failed for ${modelId}:`, (err as Error).message);
			lastError = err as Error;
		}
	}

	throw new Error(
		`[ONNX-Server] All providers failed for ${modelId}: ${lastError?.message}`
	);
}

/**
 * Generate a 768-dim embedding using the server-side embeddinggemma ONNX model.
 * Returns null when local inference is unavailable so the caller can continue
 * to the network/Ollama cascade.
 */
export async function runEmbedding(text: string): Promise<number[] | null> {
	try {
		const ort = await ensureOrt();
		const { session, representationId, modelPath } = await getServerOnnxSession('embeddinggemma');
		if (representationId !== EMBEDDING_REPRESENTATION_ID) {
			throw new Error('ONNX_REPRESENTATION_ID_MISMATCH');
		}

		const inputNames = session.inputNames;
		const tokenizer = await ensureEmbeddingTokenizer(dirname(modelPath));
		const tokenized = await tokenizer(text, {
			return_tensors: 'np',
			padding: true,
			truncation: true,
			max_length: EMBEDDING_MAX_TOKENS,
		});
		const encoded = {
			inputIds: Array.from(tokenized.input_ids.data as ArrayLike<number>, Number),
			attentionMask: Array.from(tokenized.attention_mask.data as ArrayLike<number>, Number),
			tokenTypeIds: tokenized.token_type_ids
				? Array.from(tokenized.token_type_ids.data as ArrayLike<number>, Number)
				: undefined,
		};
		if (encoded.inputIds.length === 0 || encoded.inputIds.length > EMBEDDING_MAX_TOKENS) {
			throw new Error('ONNX_TOKEN_SEQUENCE_INVALID');
		}

		const feeds: Record<string, Tensor> = {};
		if (inputNames.includes('input_ids')) {
			feeds['input_ids'] = new ort.Tensor('int64', BigInt64Array.from(encoded.inputIds.map(BigInt)), [1, encoded.inputIds.length]);
		}
		if (inputNames.includes('attention_mask')) {
			feeds['attention_mask'] = new ort.Tensor('int64', BigInt64Array.from(encoded.attentionMask.map(BigInt)), [1, encoded.attentionMask.length]);
		}
		if (inputNames.includes('token_type_ids')) {
			feeds['token_type_ids'] = new ort.Tensor(
				'int64',
				BigInt64Array.from((encoded.tokenTypeIds ?? encoded.inputIds.map(() => 0)).map(BigInt)),
				[1, encoded.inputIds.length]
			);
		}

		// Keep one session.run in flight at a time. CPU still uses ORT's bounded
		// intra-op worker pool internally; this avoids multiplying ~300 MB model
		// pressure with JS worker/session duplication and keeps DML predictable.
		const run = embeddingRunQueue.then(() => session.run(feeds));
		embeddingRunQueue = run.then(() => undefined, () => undefined);
		const results = await run;

		const outputName = session.outputNames.find((name) => /sentence|embedding/i.test(name)) ?? session.outputNames[0];
		const output = results[outputName];
		if (!output) return null;
		const data = output.data as Float32Array;
		const dims = output.dims;

		if (dims.length === 3) {
			const seqLen = Number(dims[1]);
			const hiddenDim = Number(dims[2]);
			const pooled = new Float32Array(hiddenDim);
			let validTokens = 0;

			for (let i = 0; i < seqLen; i++) {
				if (encoded.attentionMask[i] === 1) {
					for (let j = 0; j < hiddenDim; j++) {
						pooled[j] += data[i * hiddenDim + j];
					}
					validTokens++;
				}
			}

			if (validTokens > 0) {
				for (let j = 0; j < hiddenDim; j++) pooled[j] /= validTokens;
			}

			let norm = 0;
			for (let j = 0; j < hiddenDim; j++) norm += pooled[j] * pooled[j];
			norm = Math.sqrt(norm);
			if (norm > 0) {
				for (let j = 0; j < hiddenDim; j++) pooled[j] /= norm;
			}

			if (hiddenDim !== EMBEDDING_DIMENSIONS || pooled.some((value) => !Number.isFinite(value))) {
				throw new Error(`ONNX_EMBEDDING_OUTPUT_INVALID:${hiddenDim}`);
			}
			return Array.from(validateSemantic768OutputV1(pooled));
		}

		if (dims.length !== 2 || Number(dims[1]) !== EMBEDDING_DIMENSIONS || data.length !== EMBEDDING_DIMENSIONS) {
			throw new Error(`ONNX_EMBEDDING_DIMENSION_MISMATCH:${dims.join('x')}`);
		}
		return Array.from(validateSemantic768OutputV1(data));
	} catch (err) {
		console.warn('[ONNX-Server] Local embedding failed; caller may use network fallback:', (err as Error).message);
		return null;
	}
}

/** Run generic inference on any loaded ONNX model. */
export async function runInference(
	modelId: string,
	feeds: Record<string, { data: number[] | Float32Array; dims: number[]; type?: string }>
): Promise<Record<string, { data: Float32Array; dims: readonly number[] }>> {
	const ort = await ensureOrt();
	const { session } = await getServerOnnxSession(modelId);

	const tensorFeeds: Record<string, Tensor> = {};
	for (const [name, feed] of Object.entries(feeds)) {
		const type = feed.type ?? 'float32';
		const data = feed.data instanceof Float32Array ? feed.data : new Float32Array(feed.data);
		tensorFeeds[name] = new ort.Tensor(type as any, data, feed.dims);
	}

	const results = await session.run(tensorFeeds);
	const output: Record<string, { data: Float32Array; dims: readonly number[] }> = {};
	for (const [name, tensor] of Object.entries(results)) {
		output[name] = {
			data: tensor.data as Float32Array,
			dims: tensor.dims as readonly number[],
		};
	}
	return output;
}

/** Check if a session is loaded. */
export function isModelLoaded(modelId: string): boolean {
	return sessionCache.has(modelId);
}

/** Get info about all loaded sessions. */
export async function getLoadedModels(): Promise<Array<{
	modelId: string;
	provider: string;
	modelPath: string;
	loadTimeMs: number;
	cpuThreads: { intraOpNumThreads: number; interOpNumThreads: number } | null;
}>> {
	const models: Array<{
		modelId: string;
		provider: string;
		modelPath: string;
		loadTimeMs: number;
		cpuThreads: { intraOpNumThreads: number; interOpNumThreads: number } | null;
	}> = [];
	for (const [modelId, promise] of sessionCache.entries()) {
		try {
			const info = await promise;
			models.push({
				modelId,
				provider: info.provider,
				modelPath: info.modelPath,
				loadTimeMs: info.loadTimeMs,
				cpuThreads: info.cpuThreads,
			});
		} catch {
			// Failed sessions are evicted by getServerOnnxSession().
		}
	}
	return models;
}

/** Clear all cached sessions. */
export function clearServerSessionCache(): void {
	sessionCache.clear();
	tokenizerCache = null;
	ortNode = null;
	embeddingRunQueue = Promise.resolve();
}
