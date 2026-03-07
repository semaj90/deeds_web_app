/**
 * GPU Arbiter — VRAM Mutex for TRT-LLM / Ollama Exclusive Access
 *
 * RTX 3060 Ti has 8GB VRAM. Ollama uses ~5.2GB when loaded.
 * TRT-LLM and Ollama cannot coexist at full model load.
 * This arbiter manages exclusive GPU lease via Redis.
 *
 * Wired into inference pipeline:
 *   - /api/chat acquires lease before Ollama chat ✅
 *   - /api/chat/stream acquires lease before streaming ✅
 *   - /api/embed acquires lease before embedding ✅
 *   - /api/health/capabilities exposes lease status ✅
 *   - /api/gpu/lease — full CRUD lease management ✅
 *   - /api/gpu-wasm-integration — pipeline telemetry ✅
 */
import { redis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';

export type InferenceBackend = 'ollama' | 'tensorrt';

interface GpuLease {
	backend: InferenceBackend;
	acquiredAt: number;
	expiresAt: number;
}

const LEASE_KEY = 'gpu:lease';
const DEFAULT_TTL_SEC = 120; // 2 minutes

/**
 * Attempt to acquire exclusive GPU lease.
 * Returns the lease if acquired, null if another backend holds it.
 */
export async function acquireGpuLease(
	backend: InferenceBackend,
	ttlSeconds = DEFAULT_TTL_SEC
): Promise<GpuLease | null> {
	try {
		const existing = await redis.get(LEASE_KEY);
		if (existing) {
			const lease: GpuLease = JSON.parse(existing);
			// Same backend already holds lease — extend it
			if (lease.backend === backend) {
				const extended: GpuLease = {
					backend,
					acquiredAt: lease.acquiredAt,
					expiresAt: Date.now() + ttlSeconds * 1000
				};
				await redis.set(LEASE_KEY, JSON.stringify(extended), 'EX', ttlSeconds);
				return extended;
			}
			// Different backend holds lease and it hasn't expired
			if (lease.expiresAt > Date.now()) {
				return null;
			}
			// Lease expired — fall through to acquire
		}

		// Acquire new lease
		const lease: GpuLease = {
			backend,
			acquiredAt: Date.now(),
			expiresAt: Date.now() + ttlSeconds * 1000
		};

		// If switching to TRT-LLM, unload Ollama models first
		if (backend === 'tensorrt') {
			await unloadOllamaModels();
		}

		await redis.set(LEASE_KEY, JSON.stringify(lease), 'EX', ttlSeconds);
		return lease;
	} catch (err) {
		console.error('[GPU Arbiter] Failed to acquire lease:', err);
		return null;
	}
}

/**
 * Release GPU lease for the specified backend.
 */
export async function releaseGpuLease(backend: InferenceBackend): Promise<boolean> {
	try {
		const existing = await redis.get(LEASE_KEY);
		if (!existing) return true;

		const lease: GpuLease = JSON.parse(existing);
		if (lease.backend !== backend) return false;

		await redis.del(LEASE_KEY);
		return true;
	} catch (err) {
		console.error('[GPU Arbiter] Failed to release lease:', err);
		return false;
	}
}

/**
 * Get the current GPU lease status without modifying it.
 */
export async function getGpuLeaseStatus(): Promise<GpuLease | null> {
	try {
		const existing = await redis.get(LEASE_KEY);
		if (!existing) return null;
		const lease: GpuLease = JSON.parse(existing);
		if (lease.expiresAt < Date.now()) {
			await redis.del(LEASE_KEY);
			return null;
		}
		return lease;
	} catch {
		return null;
	}
}

/**
 * Tell Ollama to unload all models (free VRAM for TRT-LLM).
 * Uses keep_alive: 0 which signals immediate unload.
 */
async function unloadOllamaModels(): Promise<void> {
	const ollamaUrl = ENV.OLLAMA_BASE_URL;
	try {
		// List loaded models
		const tagsRes = await fetch(`${ollamaUrl}/api/tags`, {
			signal: AbortSignal.timeout(3000)
		});
		if (!tagsRes.ok) return;
		const data = await tagsRes.json();
		const models = (data.models ?? []) as { name: string }[];

		// Unload each model by sending a noop generate with keep_alive: 0
		for (const m of models) {
			await fetch(`${ollamaUrl}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: m.name,
					prompt: '',
					keep_alive: 0
				}),
				signal: AbortSignal.timeout(5000)
			}).catch(() => {});
		}
	} catch {
		// Non-critical — Ollama may not be running
	}
}
