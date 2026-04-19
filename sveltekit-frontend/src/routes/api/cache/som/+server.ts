/**
 * WebGPU SOM Cache API — Intelligent error analysis caching
 *
 * Provides self-organizing map cache for NPM error analysis with:
 * - GPU-accelerated PageRank for error prioritization
 * - Error message embeddings via WebGPU compute shaders
 * - LokiJS + IndexedDB + Redis multi-tier caching
 *
 * Wired from: som-webgpu-cache.ts (728 lines, previously orphaned)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { somWebGPUCache } from '$lib/webgpu/som-webgpu-cache';
import { getRedis } from '$lib/server/redis.js';
import { z } from 'zod';

const SOM_CACHE_TTL = 3600; // 1 hour
const SOM_KEY = (k: string) => `som_cache:${k}`;

// ── Validation Schemas ────────────────────────────────────────────────

const analyzeSchema = z.object({
	npmOutput: z.string().min(1, 'NPM output required'),
});

const getCacheSchema = z.object({
	key: z.string().min(1, 'Cache key required'),
});

const storeCacheSchema = z.object({
	key: z.string().min(1, 'Cache key required'),
	data: z.unknown(),
});

// ── GET: Retrieve cached SOM analysis result ──────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	// Auth check
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const key = url.searchParams.get('key');
	if (!key) {
		return json({ error: 'Missing cache key parameter' }, { status: 400 });
	}

	try {
		const raw = await getRedis().get(SOM_KEY(key));
		if (!raw) {
			return json({ success: false, error: 'Cache miss', key }, { status: 404 });
		}
		return json({ success: true, key, data: JSON.parse(raw) });
	} catch (error) {
		console.error('[SOM Cache] GET error:', error);
		return json({ success: false, error: 'Failed to retrieve from SOM cache' }, { status: 500 });
	}
};

// ── POST: Analyze NPM errors with WebGPU SOM ──────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	// Auth check
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validation = analyzeSchema.safeParse(body);
	if (!validation.success) {
		return json(
			{
				error: 'Validation failed',
				details: validation.error.issues,
			},
			{ status: 400 }
		);
	}

	const { npmOutput } = validation.data;

	try {
		// Initialize WebGPU + IndexedDB if not already done
		const initialized = await somWebGPUCache.initialize();

		// Process NPM errors through the SOM cache
		const intelligentTodos = await somWebGPUCache.processNPMCheckErrors(npmOutput);

		return json({
			success: true,
			todos: intelligentTodos,
			count: intelligentTodos.length,
			webgpuAccelerated: initialized,
		});
	} catch (error) {
		console.error('[SOM Cache] Analysis error:', error);
		return json(
      {
        success: false,
        error: 'Failed to analyze NPM errors',
      },
      { status: 500 }
    );
	}
};

// ── PUT: Store result in SOM cache ────────────────────────────────────

export const PUT: RequestHandler = async ({ request, locals }) => {
	// Auth check
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validation = storeCacheSchema.safeParse(body);
	if (!validation.success) {
		return json(
			{
				error: 'Validation failed',
				details: validation.error.issues,
			},
			{ status: 400 }
		);
	}

	const { key, data } = validation.data;
	try {
		await getRedis().set(SOM_KEY(key), JSON.stringify(data), 'EX', SOM_CACHE_TTL);
		return json({ success: true, key, ttl: SOM_CACHE_TTL });
	} catch (error) {
		console.error('[SOM Cache] PUT error:', error);
		return json({ success: false, error: 'Failed to store in SOM cache' }, { status: 500 });
	}
};