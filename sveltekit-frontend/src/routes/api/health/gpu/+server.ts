/**
 * GET /api/health/gpu
 * GPU health check — reports CUDA availability, VRAM usage, temperature, and benchmark.
 *
 * Response includes:
 * - CUDA availability via libtorch addon
 * - Real-time VRAM usage via nvidia-smi
 * - GPU temperature and power draw
 * - Process-level VRAM breakdown
 * - Quick cosine similarity benchmark
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { isCudaAvailable, graphSimilarity } from '$lib/server/gpu/libtorch-bridge.js';
import { getCudaDeviceInfo } from '$lib/server/gpu/cuda-bridge.js';
import { getGpuStats, type GpuStats } from '$lib/server/gpu/gpu-monitor.js';

export const GET: RequestHandler = async () => {
	const cudaAvailable = isCudaAvailable();
	const deviceInfo = await getCudaDeviceInfo();

	// Get real-time GPU stats via nvidia-smi
	let gpuStats: GpuStats | null = null;
	try {
		gpuStats = await getGpuStats();
	} catch {
		gpuStats = null;
	}

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

	// Determine overall health status
	let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
	const warnings: string[] = [];

	if (!cudaAvailable) {
		healthStatus = 'warning';
		warnings.push('CUDA not available - running on CPU');
	}

	if (gpuStats?.available) {
		// VRAM > 90% is warning
		if (gpuStats.memory.usedPercent > 90) {
			healthStatus = 'warning';
			warnings.push(`VRAM usage high: ${gpuStats.memory.usedPercent}%`);
		}
		// Temperature > 80°C is warning, > 90°C is critical
		if (gpuStats.temperatureCelsius > 90) {
			healthStatus = 'critical';
			warnings.push(`GPU temperature critical: ${gpuStats.temperatureCelsius}°C`);
		} else if (gpuStats.temperatureCelsius > 80) {
			healthStatus = 'warning';
			warnings.push(`GPU temperature elevated: ${gpuStats.temperatureCelsius}°C`);
		}
	}

	return json({
		status: healthStatus,
		cudaAvailable,
		addonLoaded: true,
		device: deviceInfo,
		// nvidia-smi stats
		nvidia: gpuStats ? {
			name: gpuStats.name,
			driverVersion: gpuStats.driverVersion,
			memory: gpuStats.memory,
			utilizationPercent: gpuStats.utilizationPercent,
			temperatureCelsius: gpuStats.temperatureCelsius,
			powerWatts: gpuStats.powerWatts,
			processes: gpuStats.processes,
			timestamp: gpuStats.timestamp
		} : null,
		benchmark: benchmarkMs !== null ? {
			operation: '10x768 cosine similarity',
			latencyMs: benchmarkMs,
			source: cudaAvailable ? 'gpu' : 'cpu'
		} : null,
		warnings: warnings.length > 0 ? warnings : undefined
	});
};
