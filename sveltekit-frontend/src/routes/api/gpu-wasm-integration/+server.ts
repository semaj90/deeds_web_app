/**
 * POST /api/gpu-wasm-integration — Unified GPU/WASM pipeline status
 *
 * Polled by scripts/watch-gpu-wasm.mjs every 15s to keep the pipeline warm.
 * Reports: GPU lease, WGSL shaders, Ollama models, WASM binaries, task queue, Qdrant vectors.
 *
 * Actions:
 *   "status"  — Full status report (default)
 *   "health"  — Lightweight health check
 *   "shaders" — Full WGSL shader source + binding layouts
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getGpuLeaseStatus } from '$lib/server/inference/gpu-arbiter.js';
import { ENV } from '$lib/server/env.server.js';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { checkQdrantHealth } from '$lib/server/vector/qdrant-health.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { SHADER_REGISTRY, type ShaderSpec } from '$lib/gpu/shader-registry.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const ORT_DIR = resolve('static/ort');
const WASM_BINARIES = [
	'ort-wasm-simd-threaded.wasm',
	'ort-wasm-simd-threaded.jsep.wasm',
	'ort-wasm-simd-threaded.asyncify.wasm'
] as const;

const MODEL_DIRS = {
	gemma270m: resolve('static/gemma3_270m_onnx'),
	embeddinggemma: resolve('static/embeddinggemma_300m_onnx')
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function safeFetch<T>(url: string, timeoutMs = 3000, fallback: T): Promise<T> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
		if (!res.ok) return fallback;
		return (await res.json()) as T;
	} catch {
		return fallback;
	}
}

/** Fetch Ollama running models + available models */
async function fetchOllamaStatus() {
	const base = ENV.OLLAMA_BASE_URL;
	interface OllamaModel {
		name: string;
		size?: number;
		details?: { parameter_size?: string; quantization_level?: string; family?: string };
	}
	interface OllamaRunning extends OllamaModel {
		size_vram?: number;
		expires_at?: string;
	}

	const [running, available] = await Promise.all([
		safeFetch<{ models: OllamaRunning[] }>(`${base}/api/ps`, 3000, { models: [] }),
		safeFetch<{ models: OllamaModel[] }>(`${base}/api/tags`, 3000, { models: [] })
	]);

	const runningModels = (running.models ?? []).map((m) => ({
		name: m.name,
		sizeVram: m.size_vram ?? null,
		expiresAt: m.expires_at ?? null,
		parameters: m.details?.parameter_size ?? null,
		quantization: m.details?.quantization_level ?? null
	}));

	const availableModels = (available.models ?? []).map((m) => ({
		name: m.name,
		sizeBytes: m.size ?? null,
		family: m.details?.family ?? null,
		parameters: m.details?.parameter_size ?? null,
		quantization: m.details?.quantization_level ?? null
	}));

	const totalVram = runningModels.reduce((sum, m) => sum + (m.sizeVram ?? 0), 0);

	return {
		connected: available.models.length > 0 || running.models.length > 0,
		runningModels,
		availableModels,
		vram: { usedBytes: totalVram, usedMB: Math.round(totalVram / 1024 / 1024), totalMB: 8192 }
	};
}

/** Verify WASM/ONNX binaries on disk */
function checkWasmBinaries() {
	const binaries = WASM_BINARIES.map((name) => {
		const p = resolve(ORT_DIR, name);
		const exists = existsSync(p);
		let sizeBytes: number | null = null;
		if (exists) {
			try {
				sizeBytes = statSync(p).size;
			} catch {
				/* noop */
			}
		}
		return {
			name,
			exists,
			sizeBytes,
			sizeMB: sizeBytes ? Math.round((sizeBytes / 1024 / 1024) * 10) / 10 : null
		};
	});

	const models = Object.entries(MODEL_DIRS).map(([name, dir]) => ({
		name,
		path: dir.replace(/\\/g, '/'),
		exists: existsSync(dir)
	}));

	return {
		allBinariesPresent: binaries.every((b) => b.exists),
		binaries,
		servePath: '/ort/',
		models,
		allModelsPresent: models.every((m) => m.exists)
	};
}

/** Fetch GPU task queue stats via internal SvelteKit fetch */
async function fetchQueueStats(fetcher: typeof fetch) {
	try {
		const res = await fetcher('/api/gpu/queue', { signal: AbortSignal.timeout(2000) });
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

/** Fetch Qdrant vector collection health */
async function fetchQdrantStats() {
	try {
		const health = await checkQdrantHealth(qdrant.client, { timeout: 3000 });
		return {
			healthy: health.healthy,
			totalVectors: health.totalVectors,
			collections: health.collections.map((c) => ({
				name: c.name,
				exists: c.exists,
				vectorCount: c.vectorCount ?? 0,
				schemaValid: c.schemaValid ?? false
			})),
			missingCollections: health.missingCollections,
			latencyMs: health.latencyMs
		};
	} catch {
		return {
			healthy: false,
			totalVectors: 0,
			collections: [],
			missingCollections: [],
			latencyMs: -1
		};
	}
}

/** Shader summary (metadata only, no WGSL source) */
function getShaderSummary() {
	return SHADER_REGISTRY.map((s) => ({
		id: s.id,
		name: s.name,
		description: s.description,
		workgroupSize: s.workgroupSize,
		bindingCount: s.bindings.length,
		vectorDim: s.vectorDim,
		cudaMirror: s.cudaMirror ?? null,
		specRef: s.specRef ?? null,
		sourceLines: s.source.trim().split('\n').length
	}));
}

/** Full shader specs with WGSL source + binding layouts */
function getShadersFull(): ShaderSpec[] {
	return SHADER_REGISTRY;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

const gpuWasmActionSchema = z.object({
	action: z.enum(['status', 'health', 'shaders']).optional().default('status'),
});

export const POST: RequestHandler = async ({ request, fetch: skFetch, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const body = await request.json().catch(() => ({}));
	const parsed = gpuWasmActionSchema.safeParse(body);
	if (!parsed.success) {
		return json({ status: 'error', error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}
	const action = parsed.data.action;

	// Lightweight health check
	if (action === 'health') {
		const lease = await getGpuLeaseStatus().catch(() => null);
		return json({ status: 'ok', gpuFree: !lease, timestamp: Date.now() });
	}

	// Full shader source + binding layouts
	if (action === 'shaders') {
		return json({
			status: 'ok',
			timestamp: Date.now(),
			shaders: getShadersFull()
		});
	}

	// Full status report — all subsystems in parallel
	const [lease, ollama, queueStats, qdrantStats] = await Promise.all([
		getGpuLeaseStatus().catch(() => null),
		fetchOllamaStatus(),
		fetchQueueStats(skFetch),
		fetchQdrantStats()
	]);

	const wasmStatus = checkWasmBinaries();

	return json({
		status: 'ok',
		timestamp: Date.now(),
		gpu: {
			lease: lease
				? {
						backend: lease.backend,
						acquiredAt: lease.acquiredAt,
						expiresAt: lease.expiresAt,
						remainingMs: Math.max(0, lease.expiresAt - Date.now())
					}
				: null,
			free: !lease,
			shaders: getShaderSummary(),
			fallbackChain: ['webgpu', 'wasm-simd', 'cpu']
		},
		ollama,
		wasm: wasmStatus,
		queue: queueStats
			? {
					depth: queueStats.queueDepth,
					active: queueStats.active,
					priorityCounts: queueStats.priorityCounts,
					stats: queueStats.stats
				}
			: {
					depth: 0,
					active: null,
					priorityCounts: { emergency: 0, high: 0, medium: 0, low: 0 },
					stats: { totalSubmitted: 0, totalProcessed: 0, totalErrors: 0 }
				},
		qdrant: qdrantStats,
		endpoints: {
			lease: '/api/gpu/lease',
			queue: '/api/gpu/queue',
			shaders: '/api/gpu-wasm-integration (action: "shaders")',
			cacheStats: '/api/cache/stats',
			health: '/api/health/capabilities',
			qdrantHealth: '/api/health/qdrant'
		}
	});
};

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const [lease, ollama] = await Promise.all([
		getGpuLeaseStatus().catch(() => null),
		fetchOllamaStatus()
	]);

	return json({
		status: 'ok',
		gpuFree: !lease,
		ollamaConnected: ollama.connected,
		runningModels: ollama.runningModels.length,
		vramUsedMB: ollama.vram.usedMB,
		shaderCount: SHADER_REGISTRY.length,
		shaders: getShaderSummary(),
		timestamp: Date.now()
	});
};
