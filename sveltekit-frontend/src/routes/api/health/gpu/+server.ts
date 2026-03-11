/**
 * GET /api/health/gpu
 * GPU health check — reports CUDA availability, addon status, and benchmark.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { isCudaAvailable, graphSimilarity } from '$lib/server/gpu/libtorch-bridge.js';
import { getCudaDeviceInfo } from '$lib/server/gpu/cuda-bridge.js';

export const GET: RequestHandler = async () => {
	const cudaAvailable = isCudaAvailable();
	const deviceInfo = await getCudaDeviceInfo();

	// Quick benchmark: 10x768 similarity
	let benchmarkMs: number | null = null;
	try {
		const testData = Array.from({ length: 10 }, () =>
			Array.from({ length: 768 }, () => Math.random())
		);
		const t0 = performance.now();
		await graphSimilarity(testData);
		benchmarkMs = Math.round((performance.now() - t0) * 100) / 100;
	} catch {
		benchmarkMs = null;
	}

	return json({
		status: cudaAvailable ? 'gpu_active' : 'cpu_fallback',
		cudaAvailable,
		addonLoaded: true,
		device: deviceInfo,
		benchmark: benchmarkMs !== null ? {
			operation: '10x768 cosine similarity',
			latencyMs: benchmarkMs,
			source: cudaAvailable ? 'gpu' : 'cpu'
		} : null
	});
};
