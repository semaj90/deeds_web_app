/**
 * Karpathy Wiki — Layer 3 Durable Memory
 *
 * Generates human-readable wiki notes from GPU indexing artifacts:
 *   1. Cluster notes    — centroid meaning, tags, files, neighbors, errors
 *   2. Retrieval notes  — query → chunks → clusters → outcome trail
 *   3. Playbook notes   — symptom → cluster → fix attempts → resolution
 *   4. Research notes   — sources, code areas, deltas, confidence
 *
 * Storage:
 *   - CouchDB `karpathy_wiki` database (primary, survives cache/Qdrant rebuilds)
 *   - Redis `wiki:note:{type}:{id}` (24h read cache for hot notes)
 *   - Optionally syncs to Obsidian vault via REST API
 *
 * Why this matters:
 *   Qdrant can be rebuilt. Caches expire. Docker containers restart.
 *   The wiki preserves reasoning history — what worked, what failed,
 *   what retrieval path was used, and why defaults changed.
 *   That turns trial-and-error into reusable knowledge.
 */

import { ENV } from '$lib/server/env.server.js';
import { pool } from '$lib/server/db/client';
import { bifrostChat } from '$lib/server/ollama.js';

// ── Constants ────────────────────────────────────────────────────────────────

const COUCHDB_DB   = 'karpathy_wiki';
const COUCHDB_URL  = () => ENV.COUCHDB_URL;
const REDIS_PREFIX = 'wiki:note:';
const REDIS_TTL    = 86_400; // 24h
const CHAT_MODEL   = ENV.OLLAMA_CHAT_MODEL;

// ── Note types ───────────────────────────────────────────────────────────────

export interface ClusterNote {
	type: 'cluster';
	clusterId: number;
	clusterType: 'gpu' | 'som';
	purpose: string;
	summary: string;
	dominantTags: string[];
	representativeFiles: string[];
	topologicalNeighbors: number[];
	relatedErrors: string[];
	patterns: string[];
	warnings: string[];
	pageRankTop5: Array<{ path: string; score: number }>;
	generatedAt: string;
	version: number;
}

export interface RetrievalNote {
	type: 'retrieval';
	query: string;
	queryHash: string;
	topChunks: Array<{ path: string; score: number; tags: string[] }>;
	topClusters: number[];
	cacheHit: 'L1' | 'L2' | 'L3' | 'miss';
	pipeline: string;
	actionItems: string[];
	overlapWithEdited: string[];
	durationMs: number;
	generatedAt: string;
}

export interface PlaybookNote {
	type: 'playbook';
	symptom: string;
	likelyCluster: number | null;
	likelyDomain: string;
	retrievalRoute: string;
	fixAttempts: Array<{ attempt: string; outcome: 'success' | 'failure'; detail: string }>;
	resolution: string;
	fallbackLogic: string;
	generatedAt: string;
	version: number;
}

export interface ResearchNote {
	type: 'research';
	query: string;
	outsideSources: Array<{ title: string; url: string; snippet: string }>;
	internalAreas: string[];
	deltasFromPrior: string[];
	confidence: number;
	pipeline: string;
	unresolvedQuestions: string[];
	generatedAt: string;
}

export interface DirectoryNote {
	type: 'directory';
	path: string;
	summary: string;
	dominantTags: string[];
	fileCount: number;
	auditScore: number;
	warnings: string[];
	representativeFiles: string[];
	generatedAt: string;
	version: number;
}

export type WikiNote = ClusterNote | RetrievalNote | PlaybookNote | ResearchNote | DirectoryNote;

// ── CouchDB helpers ──────────────────────────────────────────────────────────

export function docId(note: WikiNote): string {
	switch (note.type) {
		case 'cluster':   return `cluster:${note.clusterType}:${note.clusterId}`;
		case 'retrieval': return `retrieval:${note.queryHash}`;
		case 'playbook':  return `playbook:${note.symptom.slice(0, 60).replace(/\W+/g, '_')}`;
		case 'research':  return `research:${note.query.slice(0, 60).replace(/\W+/g, '_')}`;
		case 'directory': return `dir:${note.path.replace(/[/\\]/g, ':')}`;
		default:          return 'unknown';
	}
}

async function couchFetch(path: string, options: RequestInit = {}): Promise<Response> {
	const urlObj = new URL(COUCHDB_URL());
	const username = urlObj.username;
	const password = urlObj.password;
	urlObj.username = '';
	urlObj.password = '';

	const headers = new Headers(options.headers || {});
	if (username || password) {
		headers.set('Authorization', `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
	}

	return fetch(`${urlObj.origin}${path}`, {
		...options,
		headers
	});
}

async function ensureDb(): Promise<void> {
	try {
		await couchFetch(`/${COUCHDB_DB}`, { method: 'PUT' });
	} catch { /* exists or unavailable */ }
}

export async function couchPut(note: WikiNote): Promise<boolean> {
	const id = docId(note);
	try {
		// Get current rev if exists
		const getRes = await couchFetch(
			`/${COUCHDB_DB}/${encodeURIComponent(id)}`,
			{ signal: AbortSignal.timeout(5_000) },
		);
		let rev: string | undefined;
		if (getRes.ok) {
			const existing = await getRes.json();
			rev = existing._rev;
		}

		const doc = { _id: id, ...note, ...(rev ? { _rev: rev } : {}) };
		const putRes = await couchFetch(
			`/${COUCHDB_DB}/${encodeURIComponent(id)}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(doc),
				signal: AbortSignal.timeout(5_000),
			},
		);
		return putRes.ok;
	} catch {
		return false;
	}
}

async function couchGet<T extends WikiNote>(id: string): Promise<T | null> {
	try {
		const res = await couchFetch(
			`/${COUCHDB_DB}/${encodeURIComponent(id)}`,
			{ signal: AbortSignal.timeout(5_000) },
		);
		if (!res.ok) return null;
		const doc = await res.json();
		delete doc._id;
		delete doc._rev;
		return doc as T;
	} catch {
		return null;
	}
}

async function couchList(type: WikiNote['type'], limit = 50): Promise<WikiNote[]> {
	try {
		const res = await couchFetch(
			`/${COUCHDB_DB}/_all_docs?startkey="${type}:"&endkey="${type}:\ufff0"&include_docs=true&limit=${limit}`,
			{ signal: AbortSignal.timeout(10_000) },
		);
		if (!res.ok) return [];
		const data = await res.json();
		return (data.rows ?? [])
			.map((r: { doc?: Record<string, unknown> }) => {
				if (!r.doc) return null;
				const doc = { ...r.doc };
				delete doc._id;
				delete doc._rev;
				return doc as unknown as WikiNote;
			})
			.filter(Boolean) as WikiNote[];
	} catch {
		return [];
	}
}

// ── Redis cache helpers ──────────────────────────────────────────────────────

// Memoize the redis-module dynamic import — was firing on every redisGet/Set
// call (~20× per ACE preflight). Caches the *module*, not the connection (the
// pool already memoizes that internally).
let redisModulePromise: ReturnType<typeof loadRedisModule> | null = null;
function loadRedisModule() {
	return import('$lib/server/redis.js');
}
async function getMemoisedRedis() {
	if (!redisModulePromise) redisModulePromise = loadRedisModule();
	return (await redisModulePromise).getRedis();
}

async function redisGet<T>(key: string): Promise<T | null> {
	try {
		const r = await getMemoisedRedis();
		const val = await r.get(`${REDIS_PREFIX}${key}`);
		return val ? (JSON.parse(val) as T) : null;
	} catch {
		return null;
	}
}

async function redisSet(key: string, value: unknown): Promise<void> {
	try {
		const r = await getMemoisedRedis();
		await r.set(`${REDIS_PREFIX}${key}`, JSON.stringify(value), 'EX', REDIS_TTL);
	} catch { /* non-fatal */ }
}

/**
 * Bulk-read multiple wiki notes in one MGET round-trip. Uses simdjson AVX2
 * fast-parse for ≥10 entries / ≥5KB aggregate. Hot path for ACE cluster
 * preamble that fetches sibling notes for a community.
 */
export async function redisGetBulk<T>(keys: string[]): Promise<Array<T | null>> {
	if (!keys.length) return [];
	try {
		const r       = await getMemoisedRedis();
		const fullKeys = keys.map((k) => `${REDIS_PREFIX}${k}`);
		const raws    = await r.mget(...fullKeys);

		// Threshold: simdjson worth dispatching only on ≥10 entries / ≥5KB aggregate
		const totalChars = raws.reduce((sum: number, raw: string | null) => sum + (raw?.length ?? 0), 0);
		if (raws.length < 10 || totalChars < 5_000) {
			return raws.map((raw: string | null) => {
				if (!raw) return null;
				try { return JSON.parse(raw) as T; } catch { return null; }
			});
		}

		// Lazy-import simdjson bridge to avoid loading the addon when not needed
		try {
			const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
			if (isSimdJsonAvailable()) {
				return raws.map((raw: string | null) => {
					if (!raw) return null;
					try { return fastJsonParse<T>(raw); } catch { return null; }
				});
			}
		} catch { /* addon unavailable — fall through */ }

		return raws.map((raw: string | null) => {
			if (!raw) return null;
			try { return JSON.parse(raw) as T; } catch { return null; }
		});
	} catch {
		return keys.map(() => null);
	}
}

// ── Cluster note generator ───────────────────────────────────────────────────

/**
 * Generate a cluster wiki note from PostgreSQL chunk data + existing summary.
 * Enriches the raw ClusterSummary with topology neighbors and retrieval stats.
 */
export async function generateClusterNote(
	clusterId: number,
	clusterType: 'gpu' | 'som' = 'gpu',
): Promise<ClusterNote | null> {
	const cacheKey = `cluster:${clusterType}:${clusterId}`;
	const cached = await redisGet<ClusterNote>(cacheKey);
	if (cached) return cached;

	try {
		const col = clusterType === 'gpu' ? 'gpu_cluster' : 'som_cluster';

		// Fetch cluster chunks with metadata
		const chunksResult = await pool.query<{
			relative_path: string;
			tags: unknown;
			page_rank_score: number | null;
			gpu_cluster: number | null;
			som_cluster: number | null;
			cluster_summary: unknown;
		}>(
			`SELECT relative_path, tags, page_rank_score,
			        gpu_cluster, som_cluster, cluster_summary
			   FROM codebase_chunk_index
			  WHERE ${col} = $1
			  ORDER BY COALESCE(page_rank_score, 0) DESC
			  LIMIT 50`,
			[clusterId],
		);

		if (!chunksResult.rows.length) return null;

		// Extract dominant tags
		const tagCounts = new Map<string, number>();
		for (const row of chunksResult.rows) {
			const tags = Array.isArray(row.tags) ? row.tags : [];
			for (const t of tags) {
				tagCounts.set(String(t), (tagCounts.get(String(t)) ?? 0) + 1);
			}
		}
		const dominantTags = [...tagCounts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 8)
			.map(([tag]) => tag);

		// Top files by PageRank
		const pageRankTop5 = chunksResult.rows
			.filter(r => r.page_rank_score != null)
			.slice(0, 5)
			.map(r => ({ path: r.relative_path, score: r.page_rank_score! }));

		// Representative files (top 10 by rank)
		const representativeFiles = chunksResult.rows
			.slice(0, 10)
			.map(r => r.relative_path);

		// Topological neighbors — other clusters connected via shared files
		const neighborResult = await pool.query<{ neighbor: number }>(
			`SELECT DISTINCT ${col === 'gpu_cluster' ? 'som_cluster' : 'gpu_cluster'} AS neighbor
			   FROM codebase_chunk_index
			  WHERE relative_path IN (
			    SELECT relative_path FROM codebase_chunk_index WHERE ${col} = $1 LIMIT 20
			  )
			  AND ${col === 'gpu_cluster' ? 'som_cluster' : 'gpu_cluster'} IS NOT NULL
			  AND ${col === 'gpu_cluster' ? 'som_cluster' : 'gpu_cluster'} != $1
			  LIMIT 8`,
			[clusterId],
		);
		const topologicalNeighbors = neighborResult.rows.map(r => r.neighbor);

		// Pull existing cluster summary if available
		const existingSummary = chunksResult.rows[0]?.cluster_summary as
			{ summary?: string; purpose?: string; patterns?: string[]; warnings?: string[] } | null;

		const note: ClusterNote = {
			type: 'cluster',
			clusterId,
			clusterType,
			purpose:              existingSummary?.purpose ?? '',
			summary:              existingSummary?.summary ?? '',
			dominantTags,
			representativeFiles,
			topologicalNeighbors,
			relatedErrors:        [], // populated by playbook cross-ref
			patterns:             existingSummary?.patterns ?? [],
			warnings:             existingSummary?.warnings ?? [],
			pageRankTop5,
			generatedAt:          new Date().toISOString(),
			version:              1,
		};

		// If no existing summary, generate one via LLM
		if (!note.summary && representativeFiles.length >= 3) {
			try {
				const fileList = representativeFiles.slice(0, 8).join('\n');
				const tagList = dominantTags.join(', ');
				const raw = await bifrostChat(
					[
						{ role: 'system', content: 'Summarize this code cluster in 2 sentences. Output plain text only.' },
						{ role: 'user', content: `Cluster ${clusterId} (${clusterType})\nTags: ${tagList}\nFiles:\n${fileList}` },
					],
					CHAT_MODEL,
					{ temperature: 0.2, maxTokens: 200, cacheKey: `wiki-cluster-${clusterType}-${clusterId}` },
				);
				note.summary = raw.trim();
				note.purpose = dominantTags[0] ?? 'general';
			} catch { /* non-fatal */ }
		}

		await ensureDb();
		await couchPut(note);
		await redisSet(cacheKey, note);
		return note;
	} catch (err) {
		console.warn(`[karpathy-wiki] cluster note failed for ${clusterType}:${clusterId}:`, (err as Error)?.message);
		return null;
	}
}

// ── Retrieval note generator ─────────────────────────────────────────────────

/**
 * Record a retrieval run as a wiki note.
 * Called after ACE context assembly or LangGraph worker completion.
 */
export async function recordRetrievalNote(params: {
	query: string;
	queryHash: string;
	chunks: Array<{ path: string; score: number; tags?: string[] }>;
	clusters: number[];
	cacheHit: RetrievalNote['cacheHit'];
	pipeline: string;
	durationMs: number;
	editedFiles?: string[];
}): Promise<RetrievalNote> {
	const topChunks = params.chunks.slice(0, 10).map(c => ({
		path: c.path,
		score: c.score,
		tags: c.tags ?? [],
	}));

	// Detect overlap between retrieved chunks and recently edited files
	const editedSet = new Set(params.editedFiles ?? []);
	const overlapWithEdited = topChunks
		.filter(c => editedSet.has(c.path))
		.map(c => c.path);

	const note: RetrievalNote = {
		type: 'retrieval',
		query: params.query,
		queryHash: params.queryHash,
		topChunks,
		topClusters: [...new Set(params.clusters)].slice(0, 5),
		cacheHit: params.cacheHit,
		pipeline: params.pipeline,
		actionItems: [],
		overlapWithEdited,
		durationMs: params.durationMs,
		generatedAt: new Date().toISOString(),
	};

	// Fire-and-forget persistence
	ensureDb().then(() => couchPut(note)).catch(() => {});
	redisSet(`retrieval:${params.queryHash}`, note).catch(() => {});

	return note;
}

// ── Playbook note generator ──────────────────────────────────────────────────

/**
 * Build or update an error-fixing playbook from context_timeline events.
 * Aggregates fix attempts and outcomes for a symptom/domain.
 */
export async function buildPlaybookNote(
	symptom: string,
	domain: string,
): Promise<PlaybookNote | null> {
	const docKey = `playbook:${symptom.slice(0, 60).replace(/\W+/g, '_')}`;

	// Check for existing playbook
	const existing = await couchGet<PlaybookNote>(docKey);

	// Fetch related timeline events
	let fixAttempts: PlaybookNote['fixAttempts'] = existing?.fixAttempts ?? [];
	try {
		const result = await pool.query<{
			event_type: string;
			pipeline: string;
			signal: string | null;
			payload: Record<string, unknown>;
			created_at: Date;
		}>(
			`SELECT event_type, pipeline, signal, payload, created_at
			   FROM context_timeline
			  WHERE pipeline = $1
			    AND event_type IN ('tool_call', 'feedback', 'rl_adapt')
			  ORDER BY created_at DESC
			  LIMIT 20`,
			[domain],
		);

		for (const row of result.rows) {
			const attempt = String(row.payload?.query ?? row.payload?.toolsUsed ?? row.event_type);
			const outcome = row.signal === 'thumbs_up' ? 'success' as const : 'failure' as const;
			const detail = JSON.stringify(row.payload).slice(0, 200);

			// Avoid duplicate entries
			if (!fixAttempts.some(a => a.attempt === attempt && a.detail === detail)) {
				fixAttempts.push({ attempt, outcome, detail });
			}
		}
	} catch { /* non-fatal */ }

	// Detect likely cluster from symptom keywords
	let likelyCluster: number | null = null;
	try {
		const clusterResult = await pool.query<{ gpu_cluster: number }>(
			`SELECT gpu_cluster FROM codebase_chunk_index
			  WHERE content ILIKE $1
			    AND gpu_cluster IS NOT NULL
			  LIMIT 1`,
			[`%${symptom.slice(0, 40)}%`],
		);
		likelyCluster = clusterResult.rows[0]?.gpu_cluster ?? null;
	} catch { /* non-fatal */ }

	const successes = fixAttempts.filter(a => a.outcome === 'success');
	const resolution = successes.length > 0
		? successes[successes.length - 1].attempt
		: '';

	const note: PlaybookNote = {
		type: 'playbook',
		symptom,
		likelyCluster,
		likelyDomain: domain,
		retrievalRoute: `ace → ${domain}`,
		fixAttempts: fixAttempts.slice(-10), // keep last 10
		resolution,
		fallbackLogic: existing?.fallbackLogic ?? '',
		generatedAt: new Date().toISOString(),
		version: (existing?.version ?? 0) + 1,
	};

	await ensureDb();
	await couchPut(note);
	await redisSet(docKey, note);
	return note;
}

// ── Research note generator ──────────────────────────────────────────────────

/**
 * Create a research note from deep-research or LangGraph output.
 * Anchors web findings to internal codebase neighborhoods.
 */
export async function recordResearchNote(params: {
	query: string;
	outsideSources: Array<{ title: string; url: string; snippet: string }>;
	internalAreas: string[];
	confidence: number;
	pipeline: string;
	unresolvedQuestions?: string[];
}): Promise<ResearchNote> {
	const queryKey = params.query.slice(0, 60).replace(/\W+/g, '_');
	const existingKey = `research:${queryKey}`;

	// Check for prior research on same topic
	const prior = await couchGet<ResearchNote>(existingKey);
	const deltas: string[] = [];

	if (prior) {
		// Compute deltas from prior understanding
		const priorSources = new Set(prior.outsideSources.map(s => s.url));
		const newSources = params.outsideSources.filter(s => !priorSources.has(s.url));
		if (newSources.length) {
			deltas.push(`${newSources.length} new external source(s) found`);
		}

		const priorAreas = new Set(prior.internalAreas);
		const newAreas = params.internalAreas.filter(a => !priorAreas.has(a));
		if (newAreas.length) {
			deltas.push(`${newAreas.length} new internal area(s): ${newAreas.join(', ')}`);
		}

		if (Math.abs(params.confidence - prior.confidence) > 0.1) {
			deltas.push(`Confidence ${prior.confidence.toFixed(2)} → ${params.confidence.toFixed(2)}`);
		}
	}

	const note: ResearchNote = {
		type: 'research',
		query: params.query,
		outsideSources: params.outsideSources.slice(0, 10),
		internalAreas: params.internalAreas.slice(0, 15),
		deltasFromPrior: deltas,
		confidence: params.confidence,
		unresolvedQuestions: params.unresolvedQuestions ?? [],
		pipeline: params.pipeline,
		generatedAt: new Date().toISOString(),
	};

	// Fire-and-forget persistence
	ensureDb().then(() => couchPut(note)).catch(() => {});
	redisSet(existingKey, note).catch(() => {});

	return note;
}

// ── Bulk cluster wiki generation ─────────────────────────────────────────────

/**
 * Generate wiki notes for all active clusters.
 * Called after GPU indexing + cluster assignment completes.
 */
export async function generateAllClusterNotes(
	clusterType: 'gpu' | 'som' = 'gpu',
): Promise<{ generated: number; failed: number; clusters: number[] }> {
	const col = clusterType === 'gpu' ? 'gpu_cluster' : 'som_cluster';
	let generated = 0;
	let failed = 0;
	const clusters: number[] = [];

	try {
		const result = await pool.query<{ cluster_id: number; cnt: number }>(
			`SELECT ${col} AS cluster_id, COUNT(*)::int AS cnt
			   FROM codebase_chunk_index
			  WHERE ${col} IS NOT NULL
			  GROUP BY ${col}
			  HAVING COUNT(*) >= 3
			  ORDER BY ${col}`,
		);

		for (const row of result.rows) {
			const note = await generateClusterNote(row.cluster_id, clusterType);
			if (note) {
				generated++;
				clusters.push(row.cluster_id);
			} else {
				failed++;
			}
		}
	} catch (err) {
		console.warn('[karpathy-wiki] bulk generation failed:', (err as Error)?.message);
	}

	return { generated, failed, clusters };
}

// ── Wiki query / list ────────────────────────────────────────────────────────

/**
 * List wiki notes by type.
 */
export async function listWikiNotes(
	type: WikiNote['type'],
	limit = 50,
): Promise<WikiNote[]> {
	return couchList(type, limit);
}

/**
 * Get a specific wiki note by its document ID.
 */
export async function getWikiNote(id: string): Promise<WikiNote | null> {
	// Try Redis first
	const cached = await redisGet<WikiNote>(id);
	if (cached) return cached;

	// Fall back to CouchDB
	const note = await couchGet<WikiNote>(id);
	if (note) {
		await redisSet(id, note);
	}
	return note;
}

// ── Obsidian export ──────────────────────────────────────────────────────────

/**
 * Export a wiki note as markdown to Obsidian vault via REST API.
 * Requires OBSIDIAN_URL + OBSIDIAN_API_KEY in env.
 */
export async function exportToObsidian(note: WikiNote): Promise<boolean> {
	if (!ENV.OBSIDIAN_URL || !ENV.OBSIDIAN_API_KEY) return false;

	const md = noteToMarkdown(note);
	const folder = `karpathy-wiki/${note.type}`;
	const filename = docId(note).replace(/:/g, '-');

	// Loopback HTTPS uses the plugin's self-signed cert — bypass cert check
	// only for 127.0.0.1/localhost so production HTTPS calls still validate.
	const isLoopbackHttps = /^https:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(ENV.OBSIDIAN_URL);
	let dispatcher: unknown;
	if (isLoopbackHttps) {
		try {
			const { Agent } = await import('undici');
			dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
		} catch {/* fall through — will retry without dispatcher */}
	}

	try {
		const init: RequestInit & { dispatcher?: unknown } = {
			method: 'PUT',
			headers: {
				'Content-Type': 'text/markdown',
				'Authorization': `Bearer ${ENV.OBSIDIAN_API_KEY}`,
			},
			body: md,
			signal: AbortSignal.timeout(5_000),
		};
		if (dispatcher) init.dispatcher = dispatcher;
		const res = await fetch(`${ENV.OBSIDIAN_URL}/vault/${folder}/${filename}.md`, init);
		if (res.ok) {
			const { markObsidianAppWrite } = await import('../../../obsidian/wiki-vault-watcher.js');
			// Use relative path format that the watcher will match against
			markObsidianAppWrite(`karpathy-wiki/${note.type}/${filename}.md`.replace(/\//g, '\\'));
			markObsidianAppWrite(`karpathy-wiki/${note.type}/${filename}.md`.replace(/\\/g, '/'));
		}
		return res.ok;
	} catch {
		return false;
	}
}

// ── Markdown renderer ────────────────────────────────────────────────────────

/**
 * Render a Dataview/wikilink-friendly note. Adds:
 *   - YAML frontmatter (queryable via Dataview)
 *   - Tag links (#cluster/gpu, #ace, etc.) so Obsidian's tag pane lights up
 *   - File-path wikilinks ([[path/to/file.ts]]) so right-click → "Open in default app"
 *   - Cross-cluster wikilinks ([[cluster-gpu-998]]) for graph view
 */
function noteToMarkdown(note: WikiNote): string {
	const lines: string[] = [];
	const ts = note.generatedAt;

	switch (note.type) {
		case 'cluster': {
			// ── YAML frontmatter (Dataview-queryable) ──────────────────────────
			lines.push('---');
			lines.push(`type: ${note.type}`);
			lines.push(`clusterId: ${note.clusterId}`);
			lines.push(`clusterType: ${note.clusterType}`);
			lines.push(`generated: ${ts}`);
			lines.push(`version: ${note.version}`);
			lines.push(`source: graphify`);
			if (note.dominantTags.length) {
				const safeTags = note.dominantTags.map(t => t.replace(/[^a-z0-9_-]/gi, '_'));
				lines.push(`tags: [cluster/${note.clusterType}, ${safeTags.join(', ')}]`);
			}
			if (note.pageRankTop5.length) {
				lines.push(`pageRankTopScore: ${note.pageRankTop5[0].score.toFixed(4)}`);
			}
			lines.push('---');
			lines.push('');

			lines.push(`# Cluster ${note.clusterId} (${note.clusterType})`);
			lines.push(`> Generated: ${ts} | Version: ${note.version}`);
			lines.push('');
			lines.push(`**Purpose:** ${note.purpose}`);
			lines.push('');
			lines.push(`## Summary`);
			lines.push(note.summary);
			lines.push('');
			lines.push(`## Dominant Tags`);
			lines.push(note.dominantTags.map(t => `- #${t.replace(/[^a-z0-9_-]/gi, '_')}`).join('\n'));
			lines.push('');
			lines.push(`## Representative Files`);
			lines.push(note.representativeFiles.map(f => `- [[${f}]]`).join('\n'));
			lines.push('');
			if (note.pageRankTop5.length) {
				lines.push(`## PageRank Top 5`);
				lines.push('| File | Score |');
				lines.push('|------|-------|');
				for (const pr of note.pageRankTop5) {
					lines.push(`| [[${pr.path}]] | ${pr.score.toFixed(4)} |`);
				}
				lines.push('');
			}
			if (note.patterns.length) {
				lines.push(`## Patterns`);
				lines.push(note.patterns.map(p => `- ${p}`).join('\n'));
				lines.push('');
			}
			if (note.warnings.length) {
				lines.push(`## Warnings`);
				lines.push(note.warnings.map(w => `- ⚠️ ${w}`).join('\n'));
				lines.push('');
			}
			if (note.topologicalNeighbors.length) {
				lines.push(`## Topological Neighbors`);
				lines.push(note.topologicalNeighbors.map(n => `- [[cluster-${note.clusterType}-${n}]]`).join('\n'));
				lines.push('');
			}
			break;
		}
		case 'retrieval': {
			lines.push(`# Retrieval: ${note.query.slice(0, 80)}`);
			lines.push(`> ${ts} | Pipeline: ${note.pipeline} | Cache: ${note.cacheHit} | ${note.durationMs}ms`);
			lines.push('');
			lines.push(`## Top Chunks`);
			for (const c of note.topChunks.slice(0, 8)) {
				lines.push(`- \`${c.path}\` (score: ${c.score.toFixed(3)}) [${c.tags.join(', ')}]`);
			}
			lines.push('');
			lines.push(`## Clusters: ${note.topClusters.join(', ')}`);
			if (note.overlapWithEdited.length) {
				lines.push('');
				lines.push(`## Overlap with Edited Files`);
				lines.push(note.overlapWithEdited.map(f => `- \`${f}\``).join('\n'));
			}
			break;
		}
		case 'playbook': {
			lines.push(`# Playbook: ${note.symptom}`);
			lines.push(`> ${ts} | Version: ${note.version} | Domain: ${note.likelyDomain}`);
			if (note.likelyCluster != null) {
				lines.push(`> Likely Cluster: ${note.likelyCluster}`);
			}
			lines.push('');
			lines.push(`## Fix Attempts`);
			for (const a of note.fixAttempts) {
				const icon = a.outcome === 'success' ? '+' : '-';
				lines.push(`${icon} **${a.attempt}** — ${a.detail}`);
			}
			lines.push('');
			if (note.resolution) {
				lines.push(`## Resolution`);
				lines.push(note.resolution);
				lines.push('');
			}
			if (note.fallbackLogic) {
				lines.push(`## Fallback Logic`);
				lines.push(note.fallbackLogic);
			}
			break;
		}
		case 'research': {
			lines.push(`# Research: ${note.query.slice(0, 80)}`);
			lines.push(`> ${ts} | Pipeline: ${note.pipeline} | Confidence: ${note.confidence.toFixed(2)}`);
			lines.push('');
			if (note.deltasFromPrior.length) {
				lines.push(`## Deltas from Prior`);
				lines.push(note.deltasFromPrior.map(d => `- ${d}`).join('\n'));
				lines.push('');
			}
			if (note.outsideSources.length) {
				lines.push(`## Outside Sources`);
				for (const s of note.outsideSources) {
					lines.push(`- [${s.title}](${s.url}) — ${s.snippet.slice(0, 120)}`);
				}
				lines.push('');
			}
			if (note.internalAreas.length) {
				lines.push(`## Internal Code Areas`);
				lines.push(note.internalAreas.map(a => `- \`${a}\``).join('\n'));
				lines.push('');
			}
			if (note.unresolvedQuestions.length) {
				lines.push(`## Unresolved Questions`);
				lines.push(note.unresolvedQuestions.map(q => `- ${q}`).join('\n'));
			}
			break;
		}
	}

	return lines.join('\n');
}
