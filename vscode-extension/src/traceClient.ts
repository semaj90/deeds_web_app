/**
 * traceClient.ts — HTTP client for TRACE/code-intel backend endpoints.
 * Falls back gracefully when the SvelteKit dev server is not running.
 */

import * as http from 'http';

const BASE = 'http://localhost:5173';
const TIMEOUT_MS = 4000;

export interface ClusterInfo {
	id: string;
	label?: string;
	size: number;
	members: string[];
	g16Warning?: boolean; // missing route-test pairing
}

export interface TraceHealth {
	status: 'ok' | 'degraded' | 'offline';
	indexedChunks: number;
	clusters: number;
	lastIndexed?: string;
}

export interface RetrievalRun {
	id: string;
	query: string;
	clusterKey: string;
	timestamp: string;
	chunks: number;
}

export interface TopologyNode {
	id: string;
	file: string;
	cluster: number;
	x: number;
	y: number;
	pagerank?: number;
}

export interface TopologyNeighbor {
	id: string;
	file: string;
	projectedX: number;
	projectedY: number;
	distance: number;
	somCluster?: number;
}

export interface TopologyNeighborsResult {
	nodeId: string;
	neighbors: TopologyNeighbor[];
	projectedX: number;
	projectedY: number;
	source: 'gpu' | 'cpu-fallback';
	durationMs: number;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<TraceHealth> {
	try {
		const raw = await get<Record<string, unknown>>('/api/code-intel/health');
		return {
			status: raw.status === 'ok' ? 'ok' : 'degraded',
			indexedChunks: (raw.totalChunks as number) ?? 0,
			clusters: (raw.clusters as number) ?? 0,
			lastIndexed: raw.lastIndexed as string | undefined,
		};
	} catch {
		return { status: 'offline', indexedChunks: 0, clusters: 0 };
	}
}

export async function fetchClusters(limit = 50): Promise<ClusterInfo[]> {
	try {
		const rows = await get<ClusterInfo[]>(`/api/code-intel/clusters?limit=${limit}`);
		return Array.isArray(rows) ? rows : [];
	} catch {
		return [];
	}
}

export async function fetchCluster(clusterKey: string): Promise<ClusterInfo | null> {
	try {
		return await get<ClusterInfo>(`/api/code-intel/clusters/${encodeURIComponent(clusterKey)}`);
	} catch {
		return null;
	}
}

export async function fetchRetrievalRuns(limit = 20): Promise<RetrievalRun[]> {
	try {
		const rows = await get<RetrievalRun[]>(`/api/code-intel/retrieval-runs?limit=${limit}`);
		return Array.isArray(rows) ? rows : [];
	} catch {
		return [];
	}
}

export async function fetchTopology(): Promise<TopologyNode[]> {
	try {
		const raw = await get<{ nodes?: TopologyNode[] }>('/api/code-intel/topology');
		return raw.nodes ?? [];
	} catch {
		return [];
	}
}

export async function fetchIndexStats(): Promise<{ totalChunks: number }> {
	try {
		return await get<{ totalChunks: number }>('/api/codebase-index/stats');
	} catch {
		return { totalChunks: 0 };
	}
}

export async function fetchTopologyNeighbors(
	nodeId: string,
	k = 12,
	clusterId?: number,
): Promise<TopologyNeighborsResult | null> {
	try {
		const params = new URLSearchParams({ nodeId, k: String(k) });
		if (clusterId !== undefined) params.set('clusterId', String(clusterId));
		return await get<TopologyNeighborsResult>(`/api/graph/topology-neighbors?${params}`);
	} catch {
		return null;
	}
}

// ── Low-level ─────────────────────────────────────────────────────────────────

function get<T>(path: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const req = http.get(`${BASE}${path}`, { timeout: TIMEOUT_MS }, res => {
			if (res.statusCode === 401) { reject(new Error('auth')); return; }
			let body = '';
			res.on('data', (c: Buffer) => { body += c.toString(); });
			res.on('end', () => {
				try { resolve(JSON.parse(body) as T); }
				catch { reject(new Error('invalid JSON')); }
			});
		});
		req.on('error', reject);
		req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
	});
}
