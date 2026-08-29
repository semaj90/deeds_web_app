/**
 * Server-Side ONNX Runtime Session Factory
 *
 * Uses onnxruntime-node for server-side inference with CUDA → CPU fallback.
 * Sessions are memoized by file path — calling getServerOnnxSession twice
 * with the same path returns the same InferenceSession.
 *
 * Usage:
 *   import { getServerOnnxSession, runEmbedding } from '$lib/server/ai/onnx-server.js';
 *   const session = await getServerOnnxSession('embeddinggemma');
 *   const embedding = await runEmbedding('some text');
 */

import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { validateSemantic768OutputV1 } from '../atlas/embedding/embedding-runtime-v1.js';

// onnxruntime-node types
type InferenceSession = import('onnxruntime-node').InferenceSession;
type Tensor = import('onnxruntime-node').Tensor;

/** Known model IDs and their on-disk paths (relative to project root) */
const MODEL_PATHS: Record<string, string[]> = {
	embeddinggemma: [
		'static/embeddinggemma_300m_onnx/model.onnx',
		'static/models/embeddinggemma_300m_onnx/model.onnx',
		// Canonical local model storage (repo-root models/, gitignored — models/.gitignore
		// excludes *.onnx). Found live 2026-08-30: the QInt8 quantized export already exists
		// here (304MB), just never listed as a candidate — every prior candidate started with
		// 'static/', so it was silently never found.
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

/** Session cache: modelId → { session, provider, loadTimeMs } */
const sessionCache = new Map<string, Promise<SessionInfo>>();

interface SessionInfo {
	session: InferenceSession;
	provider: string;
	modelPath: string;
	modelChecksum: string;
	representationId: 'semantic_768';
	representationRevision: string;
	loadTimeMs: number;
}

const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_MAX_TOKENS = 512;
const EMBEDDING_REPRESENTATION_ID = 'semantic_768' as const;
let tokenizerCache: Promise<any> | null = null;
let embeddingRunQueue: Promise<void> = Promise.resolve();

function sha256Bytes(bytes: Uint8Array): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function ensureEmbeddingTokenizer(modelDir: string): Promise<any> {
	if (tokenizerCache) return tokenizerCache;
	tokenizerCache = (async () => {
		const transformers = await import('@huggingface/transformers');
		transformers.env.allowLocalModels = true;
		transformers.env.allowRemoteModels = false;
		// Derived from the resolved model.onnx's own directory rather than a separately
		// hardcoded path — the model and its tokenizer.json/tokenizer_config.json always ship
		// together in this repo's model directories, so a single source of truth for "where is
		// this model" can't silently drift from "where is its tokenizer" the way the previous
		// hardcoded 'static/embeddinggemma_300m_onnx' path did (found live 2026-08-30: the real
		// model lives under repo-root models/, not static/).
		return transformers.AutoTokenizer.from_pretrained(modelDir, { local_files_only: true });
	})();
	try {
		return await tokenizerCache;
	} catch (error) {
		tokenizerCache = null;
		throw new Error(`EMBEDDINGGEMMA_TOKENIZER_UNAVAILABLE:${(error as Error).message}`);
	}
}

/** Lazy-loaded onnxruntime-node module */
let ortNode: typeof import('onnxruntime-node') | null = null;

async function ensureOrt(): Promise<typeof import('onnxruntime-node')> {
	if (ortNode) return ortNode;
	ortNode = await import('onnxruntime-node');
	return ortNode;
}

/**
 * Resolve model file path on disk.
 * Checks known paths relative to the sveltekit-frontend/ directory.
 */
function resolveModelPath(modelId: string): string {
	const candidates = MODEL_PATHS[modelId];
	if (!candidates) {
		// Treat as a direct file path
		if (existsSync(modelId)) return modelId;
		throw new Error(`[ONNX-Server] Unknown model "${modelId}" and file not found`);
	}

	// Try sveltekit-frontend/ relative paths
	const baseDir = resolve(process.cwd());
	for (const candidate of candidates) {
		const full = resolve(baseDir, candidate);
		if (existsSync(full)) return full;
	}

	// Also try from project root (one level up)
	const projectRoot = resolve(baseDir, '..');
	for (const candidate of candidates) {
		const full = resolve(projectRoot, candidate);
		if (existsSync(full)) return full;
	}

	throw new Error(
		`[ONNX-Server] Model "${modelId}" not found. Checked:\n` +
		candidates.map(c => `  - ${resolve(baseDir, c)}`).join('\n')
	);
}

/**
 * Get available execution providers in priority order.
 *
 * DirectML (Windows, D3D12) → CUDA → CPU when EMBEDDING_BACKEND=onnx_directml —
 * DirectML runs through a separate driver/allocator path from CUDA, so it
 * doesn't compete with a llama.cpp CUDA context (e.g. TurboQuant on :8090)
 * for the same VRAM heap. Otherwise: CUDA → CPU (legacy default).
 */
function getServerProviders(): string[] {
	const providers: string[] = [];

	const wantDirectML = process.env.EMBEDDING_BACKEND === 'onnx_directml' && process.platform === 'win32';
	if (wantDirectML) {
		providers.push('dml');
	}

	// Check CUDA availability via environment hint
	const hasCuda = process.env.CUDA_VISIBLE_DEVICES !== '-1' &&
		(process.env.ONNX_USE_CUDA === '1' || process.env.CUDA_VISIBLE_DEVICES !== undefined);

	if (hasCuda && !wantDirectML) {
		providers.push('cuda');
	}
	providers.push('cpu');
	return providers;
}

/**
 * Create or retrieve a memoized InferenceSession for the given model.
 *
 * @param modelId - Known model ID ('embeddinggemma', 'gemma270m', 'yolov8') or absolute file path
 * @param preferredEps - Override execution provider priority (default: CUDA → CPU)
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
	const strictDirectML = process.env.EMBEDDING_BACKEND === 'onnx_directml' && process.env.ONNX_ALLOW_CPU_FALLBACK !== '1';
	const eps = strictDirectML ? requestedEps.filter((ep) => ep === 'dml') : requestedEps;

	console.info(`[ONNX-Server] Loading model: ${modelId} (${modelPath})`);
	console.info(`[ONNX-Server] Trying providers: ${eps.join(' → ')}`);

	const startTime = performance.now();

	// Read model into buffer
	const modelBuffer = readFileSync(modelPath);
	const modelChecksum = sha256Bytes(modelBuffer);

	let lastError: Error | null = null;
	for (const ep of eps) {
		if (strictDirectML && ep !== 'dml') continue;
		try {
			const session = await ort.InferenceSession.create(
				modelBuffer.buffer as ArrayBuffer,
				{
					executionProviders: [ep as any],
					graphOptimizationLevel: 'all',
					enableMemPattern: ep === 'dml' ? false : undefined,
					executionMode: ep === 'dml' ? 'sequential' : undefined,
				}
			);

			const loadTimeMs = Math.round(performance.now() - startTime);
			const label = ep === 'cuda' ? 'CUDA (GPU)' : ep === 'dml' ? 'DirectML (GPU)' : ep.toUpperCase();
			console.info(`[ONNX-Server] ${modelId} loaded with ${label} in ${loadTimeMs}ms`);
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
 *
 * @param text - Input text to embed
 * @returns 768-dimensional embedding vector, or null if model unavailable
 */
export async function runEmbedding(text: string): Promise<number[] | null> {
	try {
		const ort = await ensureOrt();
		const { session, representationId, modelPath } = await getServerOnnxSession('embeddinggemma');
		if (representationId !== EMBEDDING_REPRESENTATION_ID) {
			throw new Error('ONNX_REPRESENTATION_ID_MISMATCH');
		}

		// Simple tokenization: convert text to token IDs
		// embeddinggemma expects input_ids and attention_mask
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

		const run = embeddingRunQueue.then(() => session.run(feeds));
		embeddingRunQueue = run.then(() => undefined, () => undefined);
		const results = await run;

		// Extract embedding from output (usually 'last_hidden_state' or 'sentence_embedding')
		const outputName = session.outputNames.find((name) => /sentence|embedding/i.test(name)) ?? session.outputNames[0];
		const output = results[outputName];
		if (!output) return null;

		const data = output.data as Float32Array;

		// Mean pooling if output is [1, seq_len, hidden_dim]
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
				for (let j = 0; j < hiddenDim; j++) {
					pooled[j] /= validTokens;
				}
			}

			// L2 normalize
			let norm = 0;
			for (let j = 0; j < hiddenDim; j++) norm += pooled[j] * pooled[j];
			norm = Math.sqrt(norm);
			if (norm > 0) {
				for (let j = 0; j < hiddenDim; j++) pooled[j] /= norm;
			}

			if (hiddenDim !== EMBEDDING_DIMENSIONS || pooled.some((value) => !Number.isFinite(value))) {
				throw new Error(`ONNX_EMBEDDING_OUTPUT_INVALID:${hiddenDim}`);
			}
			return Array.from(pooled);
		}

		// Prefer the model's pooled sentence embedding when it is exposed. This avoids
		// transferring and re-pooling the full [batch, sequence, hidden] tensor.
		if (dims.length !== 2 || Number(dims[1]) !== EMBEDDING_DIMENSIONS || data.length !== EMBEDDING_DIMENSIONS) {
			throw new Error(`ONNX_EMBEDDING_DIMENSION_MISMATCH:${dims.join('x')}`);
		}
		return Array.from(validateSemantic768OutputV1(data));
	} catch (err) {
		console.warn('[ONNX-Server] Embedding failed:', (err as Error).message);
		return null;
	}
}

/**
 * Run generic inference on any loaded ONNX model.
 */
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

/** Check if a session is loaded */
export function isModelLoaded(modelId: string): boolean {
	return sessionCache.has(modelId);
}

/** Get info about all loaded sessions */
export async function getLoadedModels(): Promise<Array<{
	modelId: string;
	provider: string;
	modelPath: string;
	loadTimeMs: number;
}>> {
	const models: Array<{ modelId: string; provider: string; modelPath: string; loadTimeMs: number }> = [];
	for (const [modelId, promise] of sessionCache.entries()) {
		try {
			const info = await promise;
			models.push({ modelId, provider: info.provider, modelPath: info.modelPath, loadTimeMs: info.loadTimeMs });
		} catch {
			// Session failed to load
		}
	}
	return models.map(({ modelId, provider, modelPath, loadTimeMs }) => ({
		modelId, provider, modelPath, loadTimeMs,
	}));
}

/** Clear all cached sessions */
export function clearServerSessionCache(): void {
	sessionCache.clear();
	ortNode = null;
}
