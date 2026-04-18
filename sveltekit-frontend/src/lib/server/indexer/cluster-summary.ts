/**
 * VLM Cluster-to-Narrative Synthesis (Step 5)
 *
 * Generates a structured narrative for a GPU k-means cluster by:
 *   1. Scrolling Qdrant for the top-pageRank chunks in that cluster
 *   2. Feeding them to Gemma4-legal for structured summarisation
 *   3. Caching the result in Redis (6h TTL)
 *
 * Powers the "What does cluster N do?" answer in the codebase viewer
 * and in Claude / Copilot context enrichment.
 */
import { ENV } from '$lib/server/env.server.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { TTL, clusterSummaryKey } from '$lib/server/cache-keys.js';

const QDRANT_COLLECTION = 'codebase_chunks_768';
const TOP_CHUNKS         = 10;
const MODEL              = 'gemma4-legal:latest';

export interface ClusterSummary {
	clusterId: number;
	summary:   string;
	purpose:   string;
	patterns:  string[];
	keyFiles:  string[];
	warnings:  string[];
	generatedAt: string;
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

async function getCache(clusterId: number): Promise<ClusterSummary | null> {
	try {
		const { getRedis } = await import('$lib/server/redis.js');
		const val = await getRedis().get(clusterSummaryKey.cached(clusterId));
		return val ? (JSON.parse(val) as ClusterSummary) : null;
	} catch {
		return null;
	}
}

async function setCache(summary: ClusterSummary): Promise<void> {
	try {
		const { getRedis } = await import('$lib/server/redis.js');
		await getRedis().set(
			clusterSummaryKey.cached(summary.clusterId),
			JSON.stringify(summary),
			'EX',
			TTL.CLUSTER_SUMMARY,
		);
	} catch { /* non-fatal */ }
}

// ── Qdrant scroll for cluster chunks ────────────────────────────────────────

interface QdrantPoint {
	id: number | string;
	payload: Record<string, unknown>;
}

async function fetchClusterChunks(clusterId: number): Promise<QdrantPoint[]> {
	const filter = {
		should: [
			{ key: 'neo4j_gpuCluster', match: { value: clusterId } },
			{ key: 'som_cluster',      match: { value: clusterId } },
		],
	};

	const res = await fetch(
		`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				limit: 50,
				with_payload: true,
				with_vector: false,
				filter,
			}),
			signal: AbortSignal.timeout(10_000),
		},
	);

	if (!res.ok) return [];

	const data = await res.json();
	const points: QdrantPoint[] = data.result?.points ?? [];

	// Sort by pageRankScore DESC (prefer Colab bare key, then CouchDB, then local)
	points.sort((a, b) => {
		const scoreOf = (p: QdrantPoint) =>
			(p.payload['pagerank_score']        as number | undefined) ??
			(p.payload['pagerank_score_couchdb'] as number | undefined) ??
			(p.payload['neo4j_pageRankScore']    as number | undefined) ??
			0;
		return scoreOf(b) - scoreOf(a);
	});

	return points.slice(0, TOP_CHUNKS);
}

// ── JSON extraction (handles markdown code fences) ───────────────────────────

function extractJson(text: string): string {
	// Strip ```json ... ``` fences if present
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenced) return fenced[1].trim();
	// Grab first {...} block
	const obj = text.match(/\{[\s\S]*\}/);
	return obj ? obj[0] : text.trim();
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate (or retrieve cached) a structured narrative for a GPU cluster.
 *
 * @param clusterId  GPU k-means / SOM cluster index
 * @param force      Bypass Redis cache and regenerate (default: false)
 */
export async function generateClusterSummary(
	clusterId: number,
	force = false,
): Promise<ClusterSummary | null> {
	if (!force) {
		const cached = await getCache(clusterId);
		if (cached) return cached;
	}

	const chunks = await fetchClusterChunks(clusterId);
	if (chunks.length === 0) return null;

	// Build the code context for the LLM
	const chunkText = chunks
		.map((pt) => {
			const p  = pt.payload;
			const path = String(p['relativePath'] ?? p['path'] ?? 'unknown');
			const kind = String(p['kind'] ?? '');
			const sym  = String(p['symbol'] ?? '');
			const content = String(p['content'] ?? '').slice(0, 600);
			return `// ${path} [${kind}${sym ? ': ' + sym : ''}]\n${content}`;
		})
		.join('\n\n---\n\n');

	const systemPrompt =
		'You are a senior code architect. Analyse the following source files and output ONLY valid JSON ' +
		'(no markdown fences, no prose). The JSON must match this schema exactly:\n' +
		'{ "summary": string, "purpose": string, "patterns": string[], "keyFiles": string[], "warnings": string[] }\n' +
		'summary: 1-2 sentence plain-English description of what this cluster does.\n' +
		'purpose: one-line label (e.g. "Database access layer", "Authentication middleware").\n' +
		'patterns: 3-5 key design/architectural patterns observed (e.g. "Singleton", "Repository pattern").\n' +
		'keyFiles: relative paths of the 3-5 most important files in the cluster.\n' +
		'warnings: any security, performance, or correctness concerns (may be empty array).';

	const userMessage =
		`Analyse cluster ${clusterId} (${chunks.length} files):\n\n${chunkText}`;

	let raw: string;
	try {
		raw = await bifrostChat(
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user',   content: userMessage },
			],
			MODEL,
			{ temperature: 0.2, maxTokens: 512, cacheKey: `cluster-summary-${clusterId}` },
		);
	} catch (err) {
		console.warn(`[cluster-summary] LLM call failed for cluster ${clusterId}:`, (err as Error)?.message);
		return null;
	}

	let parsed: { summary: string; purpose: string; patterns: string[]; keyFiles: string[]; warnings: string[] };
	try {
		parsed = JSON.parse(extractJson(raw));
	} catch {
		console.warn(`[cluster-summary] JSON parse failed for cluster ${clusterId}. Raw:`, raw.slice(0, 200));
		return null;
	}

	const summary: ClusterSummary = {
		clusterId,
		summary:     String(parsed.summary  ?? ''),
		purpose:     String(parsed.purpose  ?? ''),
		patterns:    Array.isArray(parsed.patterns)  ? parsed.patterns.map(String)  : [],
		keyFiles:    Array.isArray(parsed.keyFiles)   ? parsed.keyFiles.map(String)   : [],
		warnings:    Array.isArray(parsed.warnings)   ? parsed.warnings.map(String)   : [],
		generatedAt: new Date().toISOString(),
	};

	await setCache(summary);
	return summary;
}
