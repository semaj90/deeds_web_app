/**
 * GPU Arbiter — VRAM Mutex for TRT-LLM / EmbeddingGemma Exclusive Access
 *
 * RTX 3060 Ti has 8GB VRAM. Ollama uses ~5.2GB when loaded.
 * TRT-LLM and Ollama cannot coexist at full model load.
 * This arbiter manages exclusive GPU lease via Redis.
 *
 * Wired into inference pipeline:
 *   - chat/generation uses llama-server :8090
 *   - /api/chat/stream acquires lease before streaming ✅
 *   - /api/embed acquires lease before embedding ✅
 *   - /api/health/capabilities exposes lease status ✅
 *   - /api/gpu/lease — full CRUD lease management ✅
 *   - /api/gpu-wasm-integration — pipeline telemetry ✅
 */
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import { getOllamaEmbeddingEndpoint } from '$lib/server/utils/ollama-endpoint.js';

export type InferenceBackend = 'ollama' | 'llama-server' | 'tensorrt' | 'cuvs';

interface GpuLease {
	backend: InferenceBackend;
	acquiredAt: number;
	expiresAt: number;
	leaseId?: string;
}

const LEASE_KEY = 'gpu:lease';
const DEFAULT_TTL_SEC = 120; // 2 minutes
const SEMAPHORE_KEY = 'gpu:semaphore';
const MAX_CONCURRENT_GPU_OPS = 2;

const ACQUIRE_GPU_LEASE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
local now = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local lease
if existing then
  local ok, decoded = pcall(cjson.decode, existing)
  if not ok or type(decoded) ~= 'table' or type(decoded.backend) ~= 'string' or type(decoded.acquiredAt) ~= 'number' or type(decoded.expiresAt) ~= 'number' then
    return {-1, ''}
  end
  if decoded.expiresAt > now and (decoded.backend ~= ARGV[1] or (ARGV[1] == 'cuvs' and decoded.leaseId ~= ARGV[2])) then
    return {0, existing}
  end
  local sameOwner = decoded.backend == ARGV[1] and decoded.expiresAt > now and (ARGV[1] ~= 'cuvs' or decoded.leaseId == ARGV[2])
  lease = cjson.encode({backend = ARGV[1], acquiredAt = sameOwner and decoded.acquiredAt or now, expiresAt = now + ttl * 1000, leaseId = sameOwner and decoded.leaseId or ARGV[2]})
else
  lease = cjson.encode({backend = ARGV[1], acquiredAt = now, expiresAt = now + ttl * 1000, leaseId = ARGV[2]})
end
redis.call('SET', KEYS[1], lease, 'EX', ttl)
return {1, lease}
`;

const RELEASE_GPU_LEASE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if not existing then return 1 end
local ok, lease = pcall(cjson.decode, existing)
if not ok or type(lease) ~= 'table' then return -1 end
if lease.backend ~= ARGV[1] or (ARGV[1] == 'cuvs' and lease.leaseId ~= ARGV[2]) then return 0 end
redis.call('DEL', KEYS[1])
return 1
`;

/**
 * Attempt to acquire exclusive GPU lease.
 * Returns the lease if acquired, null if another backend holds it.
 */
export async function acquireGpuLease(
	backend: InferenceBackend,
	ttlSeconds = DEFAULT_TTL_SEC,
	leaseId = randomUUID()
): Promise<GpuLease | null> {
	if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600 || !leaseId) return null;
	try {
		const redis: Redis = getRedis();
		const result = await redis.eval(
			ACQUIRE_GPU_LEASE_SCRIPT,
			1,
			LEASE_KEY,
			backend,
			leaseId,
			Date.now(),
			ttlSeconds
		) as [number, string];
		const [status, payload] = result;
		if (status !== 1) return null;
		const lease: GpuLease = JSON.parse(payload);

		// If switching to TRT-LLM, unload Ollama models first
		if (backend === 'tensorrt') {
			await unloadEmbeddingModel();
		}

		return lease;
	} catch (err) {
		console.error('[GPU Arbiter] Failed to acquire lease:', err);
		return null;
	}
}

/**
 * Release GPU lease for the specified backend.
 */
export async function releaseGpuLease(backend: InferenceBackend, leaseId?: string): Promise<boolean> {
	if (backend === 'cuvs' && !leaseId) return false;
	try {
		const redis: Redis = getRedis();
		const result = await redis.eval(RELEASE_GPU_LEASE_SCRIPT, 1, LEASE_KEY, backend, leaseId ?? '');
		return result === 1;
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
		const redis: Redis = getRedis();
		const existing = await redis.get(LEASE_KEY);
		if (!existing) return null;
		const lease: GpuLease = JSON.parse(existing);
		if (lease.expiresAt <= Date.now()) return null;
		return lease;
	} catch {
		return null;
	}
}

/**
 * Acquire a GPU compute semaphore slot.
 * Limits concurrent GPU operations to MAX_CONCURRENT_GPU_OPS to prevent OOM.
 * Returns a ticket string on success, null if all slots are taken.
 */
export async function acquireGpuSemaphore(timeoutSec = 30): Promise<string | null> {
	try {
		const redis: Redis = getRedis();
		const ticket = `gpu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const count = await redis.scard(SEMAPHORE_KEY);
		if (count >= MAX_CONCURRENT_GPU_OPS) {
			// Clean expired tickets before rejecting
			const members = await redis.smembers(SEMAPHORE_KEY);
			for (const m of members) {
				const ts = parseInt(m.split('-')[1] ?? '0');
				if (Date.now() - ts > timeoutSec * 1000) {
					await redis.srem(SEMAPHORE_KEY, m);
				}
			}
			const refreshed = await redis.scard(SEMAPHORE_KEY);
			if (refreshed >= MAX_CONCURRENT_GPU_OPS) return null;
		}
		await redis.sadd(SEMAPHORE_KEY, ticket);
		await redis.expire(SEMAPHORE_KEY, timeoutSec);
		return ticket;
	} catch {
		return null;
	}
}

/**
 * Release a GPU compute semaphore slot.
 */
export async function releaseGpuSemaphore(ticket: string): Promise<void> {
	try {
		const redis: Redis = getRedis();
		await redis.srem(SEMAPHORE_KEY, ticket);
	} catch {
		// Non-critical
	}
}

/**
 * Get current GPU semaphore status.
 */
export async function getGpuSemaphoreStatus(): Promise<{ active: number; max: number }> {
	try {
		const redis: Redis = getRedis();
		const count = await redis.scard(SEMAPHORE_KEY);
		return { active: count, max: MAX_CONCURRENT_GPU_OPS };
	} catch {
		return { active: 0, max: MAX_CONCURRENT_GPU_OPS };
	}
}

/**
 * Release only the embedding model before another approved GPU executor runs.
 * Chat and generation are owned by llama-server :8090 and are never unloaded
 * through the embedding-only Ollama lane.
 */
async function unloadEmbeddingModel(): Promise<void> {
	const ollamaUrl = getOllamaEmbeddingEndpoint();
	try {
		await fetch(`${ollamaUrl}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: ENV.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest',
				prompt: '',
				keep_alive: 0
			}),
			signal: AbortSignal.timeout(5000)
		});
	} catch (error) {
		console.error('[gpu-arbiter] EmbeddingGemma unload failed:', error);
	}
}
