import type { PageServerLoad } from './$types';

interface ServiceHealth {
	name: string;
	status: 'healthy' | 'unhealthy' | 'unknown';
	latencyMs?: number;
	details?: string;
}

interface QdrantCollection {
	name: string;
	pointsCount: number;
	vectorSize: number;
	status: string;
}

interface IndexingStatus {
	codebase: { pointCount: number; vectorSize: number } | null;
	errors: { pointCount: number; vectorSize: number } | null;
}

async function checkServiceHealth(
	name: string,
	url: string,
	timeout = 3000
): Promise<ServiceHealth> {
	const start = Date.now();
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);
		const res = await fetch(url, { signal: controller.signal });
		clearTimeout(timer);
		return {
			name,
			status: res.ok ? 'healthy' : 'unhealthy',
			latencyMs: Date.now() - start,
			details: `HTTP ${res.status}`
		};
	} catch (e) {
		return {
			name,
			status: 'unhealthy',
			latencyMs: Date.now() - start,
			details: e instanceof Error ? e.message : 'Connection failed'
		};
	}
}

function extractVectorSize(result: Record<string, unknown>): number {
	const vectors = (result?.config as Record<string, unknown>)?.params as Record<string, unknown> | undefined;
	const size = (vectors?.vectors as Record<string, unknown>)?.size;
	return typeof size === 'number' ? size : 0;
}

async function getQdrantCollections(): Promise<{
	collections: QdrantCollection[];
	totalPoints: number;
}> {
	try {
		const res = await fetch('http://localhost:6333/collections');
		if (!res.ok) return { collections: [], totalPoints: 0 };
		const data = await res.json();

		const collections = await Promise.all(
			(data.result?.collections ?? []).map(async (col: { name: string }) => {
				try {
					const info = await fetch(`http://localhost:6333/collections/${col.name}`);
					const infoData = await info.json();
					const result = infoData.result ?? {};
					return {
						name: col.name,
						pointsCount: (result.points_count as number) ?? 0,
						vectorSize: extractVectorSize(result),
						status: (result.status as string) ?? 'unknown'
					};
				} catch {
					return { name: col.name, pointsCount: 0, vectorSize: 0, status: 'error' };
				}
			})
		);

		return {
			collections,
			totalPoints: collections.reduce((sum, c) => sum + c.pointsCount, 0)
		};
	} catch {
		return { collections: [], totalPoints: 0 };
	}
}

async function getIndexingStatus(): Promise<IndexingStatus> {
	const result: IndexingStatus = { codebase: null, errors: null };
	try {
		const codeRes = await fetch('http://localhost:6333/collections/phase79_codebase');
		if (codeRes.ok) {
			const data = await codeRes.json();
			const r = data.result ?? {};
			result.codebase = {
				pointCount: (r.points_count as number) ?? 0,
				vectorSize: extractVectorSize(r)
			};
		}
	} catch {
		/* Qdrant not running */
	}
	try {
		const errRes = await fetch('http://localhost:6333/collections/phase79_error_analysis');
		if (errRes.ok) {
			const data = await errRes.json();
			const r = data.result ?? {};
			result.errors = {
				pointCount: (r.points_count as number) ?? 0,
				vectorSize: extractVectorSize(r)
			};
		}
	} catch {
		/* Qdrant not running */
	}
	return result;
}

async function getDockerContainers(): Promise<
	Array<{ name: string; status: string; image: string; ports: string }>
> {
	try {
		const res = await fetch('http://localhost:2375/containers/json?all=true');
		if (!res.ok) return [];
		const containers = await res.json();
		return containers.map((c: Record<string, unknown>) => ({
			name: ((c.Names as string[]) ?? ['/unknown'])[0].replace(/^\//, ''),
			status: (c.State as string) ?? 'unknown',
			image: (c.Image as string) ?? '',
			ports: ((c.Ports as Array<{ PublicPort?: number; PrivatePort?: number }>) ?? [])
				.filter((p) => p.PublicPort)
				.map((p) => `${p.PublicPort}:${p.PrivatePort}`)
				.join(', ')
		}));
	} catch {
		return [];
	}
}

export const load: PageServerLoad = async () => {
	const [services, qdrant, indexing, docker] = await Promise.all([
		Promise.all([
			checkServiceHealth('PostgreSQL', 'http://localhost:5173/api/health/database'),
			checkServiceHealth('Redis', 'http://localhost:5173/api/health/redis'),
			checkServiceHealth('Ollama', 'http://localhost:8086/api/tags'),
			checkServiceHealth('Qdrant', 'http://localhost:6333/healthz'),
			checkServiceHealth('Neo4j', 'http://localhost:5173/api/health/neo4j'),
			checkServiceHealth('MinIO', 'http://localhost:9000/minio/health/live')
		]),
		getQdrantCollections(),
		getIndexingStatus(),
		getDockerContainers()
	]);

	return {
		services,
		qdrant,
		indexing,
		docker,
		timestamp: new Date().toISOString()
	};
};