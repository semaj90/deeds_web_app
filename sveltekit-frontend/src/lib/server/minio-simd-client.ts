/**
 * MinIO SIMD Sidecar Client — server-only.
 *
 * Proxies evidence/chunk queries to Go minio-simd-service (port 8095)
 * which uses bytedance/sonic SIMD JSON parsing + 16-goroutine parallel fetch.
 *
 * Falls back to direct minio-js client if sidecar is unavailable.
 *
 * ENV:
 *   MINIO_SIMD_ENABLED — "true" to enable (default: "false")
 *   MINIO_SIMD_URL     — sidecar URL (default: http://127.0.0.1:8095)
 */

import { ENV } from '$lib/server/env.server.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SIMDEvidenceItem {
	key: string;
	size: number;
	lastModified: string;
	contentType: string;
	caseId?: string;
	metadata?: Record<string, string>;
}

export interface SIMDChunkItem {
	key: string;
	size: number;
	lastModified: string;
}

export interface SIMDHealthStatus {
	healthy: boolean;
	minioConnected: boolean;
	latencyMs: number;
}

// ── Client ─────────────────────────────────────────────────────────────────

let simdHealthy: boolean | null = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30_000; // 30s

async function checkSIMDHealth(): Promise<boolean> {
	const now = Date.now();
	if (simdHealthy !== null && now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
		return simdHealthy;
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2000);
		const resp = await fetch(`${ENV.MINIO_SIMD_URL}/health`, {
			signal: controller.signal
		});
		clearTimeout(timeout);
		simdHealthy = resp.ok;
	} catch {
		simdHealthy = false;
	}
	lastHealthCheck = now;
	return simdHealthy;
}

/**
 * Get evidence items for a case via SIMD sidecar.
 * Returns null if sidecar is unavailable (caller should fall back).
 */
export async function getEvidenceViaSIMD(
	caseId: string,
	bucket?: string
): Promise<SIMDEvidenceItem[] | null> {
	if (!ENV.MINIO_SIMD_ENABLED) return null;

	const healthy = await checkSIMDHealth();
	if (!healthy) return null;

	try {
		const params = new URLSearchParams({ case_id: caseId });
		if (bucket) params.set('bucket', bucket);

		const resp = await fetch(`${ENV.MINIO_SIMD_URL}/api/evidence?${params}`, {
			signal: AbortSignal.timeout(10_000)
		});

		if (!resp.ok) {
			console.warn(`[minio-simd] Evidence fetch failed: ${resp.status}`);
			return null;
		}

		const data = await resp.json();
		return data.items ?? data;
	} catch (err) {
		console.warn('[minio-simd] Evidence fetch error:', (err as Error).message);
		simdHealthy = false;
		return null;
	}
}

/**
 * Get chunks for a document via SIMD sidecar.
 * Returns null if sidecar is unavailable (caller should fall back).
 */
export async function getChunksViaSIMD(
	docId: string,
	bucket?: string
): Promise<SIMDChunkItem[] | null> {
	if (!ENV.MINIO_SIMD_ENABLED) return null;

	const healthy = await checkSIMDHealth();
	if (!healthy) return null;

	try {
		const params = new URLSearchParams({ doc_id: docId });
		if (bucket) params.set('bucket', bucket);

		const resp = await fetch(`${ENV.MINIO_SIMD_URL}/api/chunks?${params}`, {
			signal: AbortSignal.timeout(10_000)
		});

		if (!resp.ok) return null;

		const data = await resp.json();
		return data.items ?? data;
	} catch (err) {
		console.warn('[minio-simd] Chunks fetch error:', (err as Error).message);
		simdHealthy = false;
		return null;
	}
}

/**
 * Get a parsed manifest via SIMD sidecar.
 * Returns null if sidecar is unavailable.
 */
export async function getManifestViaSIMD(
	key: string,
	bucket?: string
): Promise<Record<string, unknown> | null> {
	if (!ENV.MINIO_SIMD_ENABLED) return null;

	const healthy = await checkSIMDHealth();
	if (!healthy) return null;

	try {
		const params = new URLSearchParams({ key });
		if (bucket) params.set('bucket', bucket);

		const resp = await fetch(`${ENV.MINIO_SIMD_URL}/api/manifest?${params}`, {
			signal: AbortSignal.timeout(5_000)
		});

		if (!resp.ok) return null;
		return await resp.json();
	} catch {
		simdHealthy = false;
		return null;
	}
}

/**
 * Get SIMD sidecar health status for monitoring dashboard.
 */
export async function getSIMDStatus(): Promise<SIMDHealthStatus> {
	if (!ENV.MINIO_SIMD_ENABLED) {
		return { healthy: false, minioConnected: false, latencyMs: -1 };
	}

	const start = Date.now();
	try {
		const resp = await fetch(`${ENV.MINIO_SIMD_URL}/health`, {
			signal: AbortSignal.timeout(3_000)
		});
		const latencyMs = Date.now() - start;

		if (!resp.ok) {
			return { healthy: false, minioConnected: false, latencyMs };
		}

		const data = await resp.json();
		return {
			healthy: true,
			minioConnected: data.minio_connected ?? true,
			latencyMs
		};
	} catch {
		return { healthy: false, minioConnected: false, latencyMs: Date.now() - start };
	}
}