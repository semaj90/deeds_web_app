import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { readdir } from 'fs/promises';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

import { ENV } from '$lib/server/env.server.js';
import { db } from '$lib/server/db/client';
import { chunkFiles } from '$lib/server/indexer/ast-chunker.js';
import { indexChunks, indexChunksIncremental } from '$lib/server/indexer/dual-embedder.js';
import { sseFormat, sseHeaders } from '$lib/server/streaming/sse-utils.js';
import { isCudaAvailable } from '$lib/server/gpu/libtorch-bridge.js';
import { getRedis } from '$lib/server/redis.js';

const QDRANT_URL = ENV.QDRANT_URL;
const COLLECTION = 'codebase_chunks_768';
const ROOT = resolve(process.cwd());

const SCOPE_DIRS: Record<'routes' | 'lib' | 'all', string[]> = {
	routes: ['src/routes'],
	lib: ['src/lib'],
	all: ['src/routes', 'src/lib'],
};

const INDEXABLE_EXTENSIONS = new Set(['.ts', '.js', '.mts', '.mjs']);
const SKIP_DIRS = new Set([
	'node_modules',
	'.svelte-kit',
	'archives',
	'backups',
	'phase104-backups',
]);

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// ── All 12 stages ───────────────────────────────────────────────────────────

const ALL_STAGES = [
	'ast_embed',
	'cluster_assign',
	'som_topology',
	'neo4j_sync',
	'pagerank',
	'summarize',
	'tag',
	'wiki_export',
	'hypergraph_4d',
	'complete',
] as const;

// ── Request schema ──────────────────────────────────────────────────────────

const orchestrateSchema = z.object({
  mode: z.enum(['sync', 'async']).default('sync'),
  scope: z.enum(['routes', 'lib', 'all']).default('all'),
  incremental: z.boolean().default(false),
  runIndexing: z.boolean().optional(),
  indexFileLimit: z.number().int().min(1).max(10000).optional(),
  clusterCount: z.number().int().min(2).max(100).default(20),
  clusterRange: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  backfillLimit: z.number().int().min(10).max(10000).default(2000),
  dryRun: z.boolean().default(false),
  force: z.boolean().default(false),
  gpuTag: z.boolean().default(true),
  summarize: z.boolean().default(true),
  forceRetag: z.boolean().default(false),
  // Extended backbone flags
  recompute: z.boolean().default(false),
  somTopology: z.boolean().default(false),
  neo4jSync: z.boolean().default(false),
  pageRank: z.boolean().default(false),
  exportWiki: z.boolean().default(false),
  hypergraph: z.boolean().default(false),
  deepResearch: z.boolean().default(false),
  // Checkpoint / resume
  runId: z.string().max(64).optional(),
  resume: z.boolean().default(false),
});

// ── Checkpoint cache (Redis) ────────────────────────────────────────────────
// Each completed stage is cached under orchestrate:run:{runId}:{stage}
// TTL = 2h so a dropped connection can resume within that window.

const CHECKPOINT_TTL = 7200; // 2 hours
const CHECKPOINT_PREFIX = 'orchestrate:run:';
const REQUIRED_PG_MIRROR_COLUMNS = [
	'qdrant_id',
	'content',
	'cluster_summary',
	'summary_embedding',
	'signature_embedding',
] as const;

interface StageCheckpoint {
	stage: string;
	result: Record<string, unknown>;
	completedAt: string;
	durationMs: number;
}

async function getCachedStage(runId: string, stage: string): Promise<StageCheckpoint | null> {
	try {
		const raw = await getRedis().get(`${CHECKPOINT_PREFIX}${runId}:${stage}`);
		return raw ? JSON.parse(raw) : null;
	} catch { return null; }
}

async function cacheStage(runId: string, stage: string, result: Record<string, unknown>, durationMs: number): Promise<void> {
	try {
		const checkpoint: StageCheckpoint = {
			stage,
			result,
			completedAt: new Date().toISOString(),
			durationMs,
		};
		await getRedis().setex(
			`${CHECKPOINT_PREFIX}${runId}:${stage}`,
			CHECKPOINT_TTL,
			JSON.stringify(checkpoint),
		);
	} catch { /* cache failure is non-fatal */ }
}

async function getRunMeta(runId: string): Promise<Record<string, unknown> | null> {
	try {
		const raw = await getRedis().get(`${CHECKPOINT_PREFIX}${runId}:meta`);
		return raw ? JSON.parse(raw) : null;
	} catch { return null; }
}

async function setRunMeta(runId: string, meta: Record<string, unknown>): Promise<void> {
	try {
		await getRedis().setex(
			`${CHECKPOINT_PREFIX}${runId}:meta`,
			CHECKPOINT_TTL,
			JSON.stringify(meta),
		);
	} catch { /* non-fatal */ }
}

type PgMirrorStatus = {
	table: string;
	healthy: boolean;
	exists: boolean | null;
	missingColumns: string[];
	error: string | null;
};

function firstRow(result: unknown): Record<string, unknown> | undefined {
	if (Array.isArray(result)) return result[0] as Record<string, unknown> | undefined;

	const rows = (result as { rows?: Array<Record<string, unknown>> } | null)?.rows;
	if (Array.isArray(rows)) return rows[0];

	return (result as Array<Record<string, unknown>> | undefined)?.[0];
}

async function getPgMirrorStatus(): Promise<PgMirrorStatus> {
	try {
		const tableResult = await db.execute(
			sql`SELECT to_regclass('public.codebase_chunk_index') IS NOT NULL AS exists`
		);

		const existsValue = firstRow(tableResult)?.exists;
		const exists =
			existsValue === true ||
			existsValue === 't' ||
			existsValue === 'true' ||
			existsValue === 1;

		if (!exists) {
			return {
				table: 'codebase_chunk_index',
				healthy: false,
				exists: false,
				missingColumns: [...REQUIRED_PG_MIRROR_COLUMNS],
				error: null,
			};
		}

		const columnResult = await db.execute(sql`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = 'codebase_chunk_index'
		`);

		const presentColumns = new Set(
			(Array.isArray((columnResult as { rows?: unknown[] }).rows)
				? ((columnResult as { rows: Array<{ column_name?: unknown }> }).rows)
				: Array.isArray(columnResult)
					? (columnResult as Array<{ column_name?: unknown }>)
					: []
			)
				.map((row) => row.column_name)
				.filter((value): value is string => typeof value === 'string')
		);

		const missingColumns = REQUIRED_PG_MIRROR_COLUMNS.filter(
			(column) => !presentColumns.has(column)
		);

		return {
			table: 'codebase_chunk_index',
			healthy: missingColumns.length === 0,
			exists: true,
			missingColumns,
			error: null,
		};
	} catch (err) {
		return {
			table: 'codebase_chunk_index',
			healthy: false,
			exists: null,
			missingColumns: [],
			error: (err as Error).message,
		};
	}
}

// ── File collection ─────────────────────────────────────────────────────────

async function collectFiles(dir: string, limit?: number): Promise<string[]> {
	const files: string[] = [];

	async function walk(currentDir: string): Promise<void> {
		if (limit != null && files.length >= limit) return;

		try {
			const entries = await readdir(currentDir, { withFileTypes: true });
			for (const entry of entries) {
				if (limit != null && files.length >= limit) return;
				if (SKIP_DIRS.has(entry.name)) continue;

				const fullPath = resolve(currentDir, entry.name);
				if (entry.isDirectory()) {
					await walk(fullPath);
					continue;
				}

				if (!entry.isFile()) continue;
				const extension = entry.name.slice(entry.name.lastIndexOf('.'));
				if (!INDEXABLE_EXTENSIONS.has(extension)) continue;
				if (fullPath.includes('lib/services/') && !fullPath.includes('lib/server/services/')) continue;
				files.push(fullPath);
			}
		} catch {
			/* directory missing or unreadable */
		}
	}

	await walk(dir);
	return files;
}

// ── Cluster range parser ────────────────────────────────────────────────────

function parseClusterRange(input: string, maxClusterId: number): number[] {
	const values = new Set<number>();
	for (const part of input.split(',').map((segment) => segment.trim()).filter(Boolean)) {
		if (/^\d+$/.test(part)) {
			const value = Number(part);
			if (value >= 0 && value <= maxClusterId) values.add(value);
			continue;
		}

		const match = part.match(/^(\d+)-(\d+)$/);
		if (!match) {
			throw new Error(`Invalid clusterRange segment: ${part}`);
		}

		const start = Number(match[1]);
		const end = Number(match[2]);
		const lower = Math.max(0, Math.min(start, end));
		const upper = Math.min(maxClusterId, Math.max(start, end));
		for (let current = lower; current <= upper; current += 1) {
			values.add(current);
		}
	}

	return [...values].sort((left, right) => left - right);
}

// ── SSE parser for forwarded sub-endpoints ──────────────────────────────────

async function* parseSSE(response: Response): AsyncGenerator<{ event: string; data: unknown }> {
	const reader = response.body?.getReader();
	if (!reader) throw new Error('SSE response body missing');

	const decoder = new TextDecoder();
	let buffer = '';

	function parseChunk(chunk: string): { event: string; data: unknown } {
		let event = 'message';
		const dataLines: string[] = [];
		for (const rawLine of chunk.split(/\r?\n/)) {
			if (rawLine.startsWith('event:')) event = rawLine.slice(6).trim();
			if (rawLine.startsWith('data:')) dataLines.push(rawLine.slice(5).trim());
		}

		const rawData = dataLines.join('\n');
		let data: unknown = null;
		if (rawData) {
			try {
				data = JSON.parse(rawData);
			} catch {
				data = { raw: rawData };
			}
		}

		return { event, data };
	}

	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

		let boundary = buffer.indexOf('\n\n');
		while (boundary !== -1) {
			const chunk = buffer.slice(0, boundary).trim();
			buffer = buffer.slice(boundary + 2);
			if (chunk) {
				yield parseChunk(chunk);
			}
			boundary = buffer.indexOf('\n\n');
		}

		if (done) break;
	}

	const trailing = buffer.trim();
	if (trailing) {
		yield parseChunk(trailing);
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function throwIfNotOk(response: Response, label: string): Promise<void> {
	if (response.ok) return;
	const text = await response.text().catch(() => '');
	throw new Error(`${label} failed (${response.status}): ${text.slice(0, 200)}`);
}

async function startIndexJob(
	fetcher: FetchLike,
	options: { scope: 'routes' | 'lib' | 'all'; incremental: boolean },
): Promise<{ success?: boolean; jobId?: string; backend?: string; message?: string; error?: string }> {
	const response = await fetcher('/api/codebase/wiki/index', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(options),
	});
	await throwIfNotOk(response, 'AST scan + embed start');
	return response.json() as Promise<{ success?: boolean; jobId?: string; backend?: string; message?: string; error?: string }>;
}

async function forwardSSEStage(
	fetcher: FetchLike,
	path: string,
	init: RequestInit,
	onEvent: (event: string, data: unknown) => void,
	label: string,
): Promise<unknown> {
	const response = await fetcher(path, init);
	await throwIfNotOk(response, label);

	let completePayload: unknown = null;
	for await (const { event, data } of parseSSE(response)) {
		onEvent(event, data);
		if (event === 'error') {
			const message = typeof data === 'object' && data && 'message' in (data as Record<string, unknown>)
				? String((data as Record<string, unknown>).message)
				: `${label} returned an error event`;
			throw new Error(message);
		}
		if (event === 'complete') {
			completePayload = data;
		}
	}

	return completePayload;
}

async function getLatestJobId(scope: string): Promise<string | null> {
	try {
		const { getRedis } = await import('$lib/server/redis.js');
		return (await getRedis().get(`codebase:index:latest:${scope}`)) ?? null;
	} catch {
		return null;
	}
}

// ── Safe dynamic imports (lazy to avoid blocking startup) ───────────────────

async function importSOMTopology() {
	const mod = await import('$lib/server/graph/som-topology-pipeline.js');
	return mod.runSOMTopologyPipeline;
}

async function importNeo4jSync() {
	const mod = await import('$lib/server/graph/codebase-neo4j-sync.js');
	return { syncCodebaseToNeo4j: mod.syncCodebaseToNeo4j };
}

async function importCouchDbPageRank() {
	const mod = await import('$lib/server/graph/couchdb-pagerank.js');
	return {
		runCouchDbPageRank: mod.runCouchDbPageRank,
		syncNodesToCouchDb: mod.syncNodesToCouchDb,
	};
}

async function importKarpathyWiki() {
	const mod = await import('$lib/server/indexer/karpathy-wiki.js');
	return {
		generateAllClusterNotes: mod.generateAllClusterNotes,
		exportToObsidian: mod.exportToObsidian,
		listWikiNotes: mod.listWikiNotes,
	};
}

async function importHypergraph4D() {
	const mod = await import('$lib/server/graph/hypergraph-4d.js');
	return mod.buildHypergraph4D;
}

async function importDeepResearch() {
  const mod = await import('$lib/server/indexer/web-search-indexer.js');
  return mod.runDeepResearchIndex;
}

// ── POST handler (SSE pipeline) ─────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals, fetch: eventFetch }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const requestUrl = new URL(request.url);
	const useRequestFetchForStages = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
	const forwardedAuthHeaders = new Headers();
	const cookieHeader = request.headers.get('cookie');
	const authorizationHeader = request.headers.get('authorization');
	if (cookieHeader) forwardedAuthHeaders.set('cookie', cookieHeader);
	if (authorizationHeader) forwardedAuthHeaders.set('authorization', authorizationHeader);

	const mergeForwardHeaders = (headers?: HeadersInit) => {
		const merged = new Headers(forwardedAuthHeaders);
		if (headers) {
			new Headers(headers).forEach((value, key) => merged.set(key, value));
		}
		return merged;
	};

	const forwardFetch: FetchLike = async (input, init) => {
		if (useRequestFetchForStages) {
			return eventFetch(input, init);
		}

		const rawInput = input;

		if (!rawInput.startsWith('/')) {
			return globalThis.fetch(rawInput, init);
		}

		return globalThis.fetch(new URL(rawInput, requestUrl).toString(), {
			...init,
			headers: mergeForwardHeaders(init?.headers),
		});
	};

	const raw = await request.json().catch(() => ({}));
	const parsed = orchestrateSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, { status: 400 });
	}

	const {
		mode,
		scope,
		incremental,
		indexFileLimit,
		clusterCount,
		limit,
		backfillLimit,
		dryRun,
		force,
		gpuTag,
		summarize,
		forceRetag,
		recompute,
		somTopology,
		neo4jSync,
		pageRank,
		exportWiki,
		hypergraph,
		resume,
	} = parsed.data;
	const deepResearch = parsed.data.deepResearch ?? false;
	const runId = parsed.data.runId ?? randomUUID().slice(0, 8);
	const runIndexing = parsed.data.runIndexing ?? mode === 'sync';
	if (mode === 'async' && dryRun) {
		return json({ error: 'dryRun is not supported when mode=async' }, { status: 400 });
	}

	const clusterRangeInput = parsed.data.clusterRange ?? `0-${Math.min(5, clusterCount - 1)}`;
	let clusterIds: number[];
	try {
		clusterIds = parseClusterRange(clusterRangeInput, clusterCount - 1);
	} catch (error) {
		return json({ error: (error as Error).message }, { status: 400 });
	}

	if (clusterIds.length === 0) {
		return json({ error: 'clusterRange resolved to no valid clusters' }, { status: 400 });
	}

	if (mode === 'async') {
		const started = await startIndexJob(eventFetch, { scope, incremental });
		if (!started.jobId) {
			return json({ error: started.error ?? 'Failed to enqueue indexing job' }, { status: 502 });
		}

		return json({
			success: true,
			mode,
			scope,
			incremental,
			jobId: started.jobId,
			backend: started.backend ?? 'unknown',
			message: started.message ?? 'Indexing queued',
			statusPath: `/api/codebase-index/orchestrate?jobId=${encodeURIComponent(started.jobId)}`,
		});
	}

	const scopeDirs = SCOPE_DIRS[scope];

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			const emit = (event: string, data: unknown) => {
				controller.enqueue(encoder.encode(sseFormat(event, data)));
			};

			const startedAt = Date.now();
			const stageTimings: Record<string, number> = {};

			// ── Check cached stages if resuming ──────────────────────────
			const cachedStages = new Map<string, StageCheckpoint>();
			if (resume) {
				for (const stageName of [
          'ast_embed',
          'cluster_assign',
          'som_topology',
          'neo4j_sync',
          'pagerank',
          'summarize',
          'tag',
          'wiki_export',
          'hypergraph_4d',
          'deep_research',
        ]) {
          const cached = await getCachedStage(runId, stageName);
          if (cached) cachedStages.set(stageName, cached);
        }
			}

			emit('started', {
        runId,
        resume,
        cachedStages: resume ? [...cachedStages.keys()] : [],
        mode,
        scope,
        runIndexing,
        indexFileLimit: indexFileLimit ?? null,
        clusterCount,
        clusterIds,
        limit,
        backfillLimit,
        dryRun,
        gpuTag,
        summarize,
        forceRetag,
        recompute,
        somTopology,
        neo4jSync,
        pageRank,
        exportWiki,
        hypergraph,
        deepResearch,
      });

			// Save run metadata for polling
			void setRunMeta(runId, { scope, clusterCount, startedAt: new Date().toISOString(), resume, cachedStages: [...cachedStages.keys()] });

			try {
        const completedStages: string[] = [];

        // ── Stage 1: AST scan + chunk + embed ─────────────────────────
        if (runIndexing || recompute) {
          const cached = cachedStages.get('ast_embed');
          if (cached) {
            emit('stage', {
              stage: 'ast_embed',
              step: 'cached',
              cachedAt: cached.completedAt,
              durationMs: cached.durationMs,
            });
            stageTimings.ast_embed = cached.durationMs;
            completedStages.push('ast_embed');
          } else {
            const stageStart = Date.now();
            emit('scan_started', {
              stage: 'scan',
              scope,
              indexFileLimit: indexFileLimit ?? null,
              incremental,
              recompute,
              mode: 'sync-inline',
            });

            const allFiles: string[] = [];
            const targetLimit = indexFileLimit ?? Number.MAX_SAFE_INTEGER;
            for (const dir of scopeDirs) {
              const remaining = targetLimit - allFiles.length;
              if (remaining <= 0) break;
              const scopedFiles = await collectFiles(resolve(ROOT, dir), remaining);
              allFiles.push(...scopedFiles);
            }

            emit('scan_done', {
              stage: 'scan',
              scope,
              dirs: scopeDirs,
              filesProcessed: allFiles.length,
              indexFileLimit: indexFileLimit ?? null,
            });

            if (allFiles.length === 0) {
              throw new Error(`No indexable files found for scope ${scope}`);
            }

            const chunks = chunkFiles(allFiles, ROOT);
            emit('chunk_done', {
              stage: 'chunk',
              filesProcessed: allFiles.length,
              chunksProcessed: chunks.length,
            });

            if (chunks.length === 0) {
              throw new Error(`Chunk extraction produced 0 chunks for scope ${scope}`);
            }

            let embedResult: Record<string, unknown> = {};
            if (dryRun) {
              embedResult = {
                dryRun: true,
                simulated: true,
                executed: false,
                skippedWrites: true,
                filesProcessed: allFiles.length,
                chunksProcessed: chunks.length,
                embeddingsGenerated: 0,
                storedInQdrant: 0,
              };
            } else if (incremental && !recompute) {
              const indexResult = await indexChunksIncremental(chunks);
              embedResult = { incremental: true, filesProcessed: allFiles.length, ...indexResult };
            } else {
              const indexResult = await indexChunks(chunks);
              embedResult = { filesProcessed: allFiles.length, ...indexResult };
            }
            emit('embed_done', { stage: 'embed', ...embedResult });

            stageTimings.ast_embed = Date.now() - stageStart;
            completedStages.push('ast_embed');
            void cacheStage(runId, 'ast_embed', embedResult, stageTimings.ast_embed);
          }
        } else {
          emit('stage', {
            stage: 'ast_embed',
            step: 'skipped',
            reason: 'runIndexing disabled',
          });
        }

        // ── Stage 2: Cluster assignment (k-means via Qdrant scroll) ──
        {
          const cached = cachedStages.get('cluster_assign');
          if (cached) {
            emit('stage', {
              stage: 'cluster_assign',
              step: 'cached',
              cachedAt: cached.completedAt,
              durationMs: cached.durationMs,
            });
            emit('cluster_done', { stage: 'cluster', details: cached.result });
            stageTimings.cluster_assign = cached.durationMs;
            completedStages.push('cluster_assign');
          } else {
            const stageStart = Date.now();
            const clusterComplete = await forwardSSEStage(
              forwardFetch,
              `/api/codebase-index/cluster-assign?dryRun=${String(dryRun)}&k=${clusterCount}`,
              { method: 'POST' },
              (event, data) => {
                emit('stage', {
                  stage: 'cluster_assign',
                  step: event,
                  details: data,
                });
              },
              'Cluster assignment'
            );
            emit('cluster_done', {
              stage: 'cluster',
              details: clusterComplete,
            });
            stageTimings.cluster_assign = Date.now() - stageStart;
            completedStages.push('cluster_assign');
            void cacheStage(
              runId,
              'cluster_assign',
              (clusterComplete as Record<string, unknown>) ?? {},
              stageTimings.cluster_assign
            );
          }
        }

        // ── Stage 3: SOM topology (GPU Kohonen + Neo4j edges) ────────
        if (somTopology && !dryRun) {
          const cached = cachedStages.get('som_topology');
          if (cached) {
            emit('stage', {
              stage: 'som_topology',
              step: 'cached',
              cachedAt: cached.completedAt,
              durationMs: cached.durationMs,
            });
            emit('som_done', { stage: 'som_topology', ...cached.result });
            stageTimings.som_topology = cached.durationMs;
            completedStages.push('som_topology');
          } else {
            const stageStart = Date.now();
            emit('som_started', { stage: 'som_topology' });

            try {
              const runSOM = await importSOMTopology();
              const somResult = await runSOM({ maxFiles: backfillLimit });

              const resultData = {
                filesProcessed: somResult.filesProcessed,
                gridSize: somResult.gridSize,
                neuronsUsed: somResult.neuronsUsed,
                edgesCreated: somResult.edgesCreated,
                source: somResult.source,
                durationMs: somResult.durationMs,
              };
              emit('som_done', { stage: 'som_topology', ...resultData });
              stageTimings.som_topology = Date.now() - stageStart;
              completedStages.push('som_topology');
              void cacheStage(runId, 'som_topology', resultData, stageTimings.som_topology);
            } catch (err) {
              emit('stage', {
                stage: 'som_topology',
                step: 'failed',
                error: (err as Error).message,
              });
            }
          }
        } else {
          emit('stage', {
            stage: 'som_topology',
            step: 'skipped',
            reason: dryRun ? 'dryRun' : 'somTopology disabled',
          });
        }

        // ── Stage 4: Neo4j sync (CodebaseFile nodes + IMPORTS edges) ─
        if (neo4jSync && !dryRun) {
          const cached = cachedStages.get('neo4j_sync');
          if (cached) {
            emit('stage', {
              stage: 'neo4j_sync',
              step: 'cached',
              cachedAt: cached.completedAt,
              durationMs: cached.durationMs,
            });
            emit('mirror_done', { stage: 'neo4j_sync', ...cached.result });
            stageTimings.neo4j_sync = cached.durationMs;
            completedStages.push('neo4j_sync');
          } else {
            const stageStart = Date.now();
            emit('mirror_started', { stage: 'neo4j_sync' });

            try {
              const { syncCodebaseToNeo4j } = await importNeo4jSync();
              const syncResult = await syncCodebaseToNeo4j({
                onPhase: (phase, extra) => {
                  emit('stage', {
                    stage: 'neo4j_sync',
                    step: phase,
                    details: extra,
                  });
                },
              });

              const resultData = {
                files: syncResult.files,
                edges: syncResult.edges,
                skipped: syncResult.skipped,
                errors: syncResult.errors.length,
                couchdbWritten: syncResult.couchdbWritten ?? 0,
                durationMs: syncResult.durationMs,
              };
              emit('mirror_done', { stage: 'neo4j_sync', ...resultData });
              stageTimings.neo4j_sync = Date.now() - stageStart;
              completedStages.push('neo4j_sync');
              void cacheStage(runId, 'neo4j_sync', resultData, stageTimings.neo4j_sync);
            } catch (err) {
              emit('stage', {
                stage: 'neo4j_sync',
                step: 'failed',
                error: (err as Error).message,
              });
            }
          }
        } else {
          emit('stage', {
            stage: 'neo4j_sync',
            step: 'skipped',
            reason: dryRun ? 'dryRun' : 'neo4jSync disabled',
          });
        }

        // ── Stage 5: CouchDB PageRank (power iteration) ─────────────
        if (pageRank && !dryRun) {
          const cached = cachedStages.get('pagerank');
          if (cached) {
            emit('stage', {
              stage: 'pagerank',
              step: 'cached',
              cachedAt: cached.completedAt,
              durationMs: cached.durationMs,
            });
            emit('pagerank_done', { stage: 'pagerank', ...cached.result });
            stageTimings.pagerank = cached.durationMs;
            completedStages.push('pagerank');
          } else {
            const stageStart = Date.now();
            emit('pagerank_started', { stage: 'pagerank' });

            try {
              const { runCouchDbPageRank } = await importCouchDbPageRank();
              const prResult = await runCouchDbPageRank();

              const resultData = {
                nodesScored: prResult.nodesScored,
                edgesUsed: prResult.edgesUsed,
                writtenCouch: prResult.writtenCouch,
                topFiles: prResult.topFiles.slice(0, 5),
                durationMs: prResult.durationMs,
              };
              emit('pagerank_done', { stage: 'pagerank', ...resultData });
              stageTimings.pagerank = Date.now() - stageStart;
              completedStages.push('pagerank');
              void cacheStage(runId, 'pagerank', resultData, stageTimings.pagerank);
            } catch (err) {
              emit('stage', {
                stage: 'pagerank',
                step: 'failed',
                error: (err as Error).message,
              });
            }
          }
        } else {
          emit('stage', {
            stage: 'pagerank',
            step: 'skipped',
            reason: dryRun ? 'dryRun' : 'pageRank disabled',
          });
        }

        // ── Stage 6: Cluster summaries (LLM per cluster) ────────────
        if (summarize) {
          const cached = cachedStages.get('summarize');
          if (cached) {
            emit('stage', {
              stage: 'summarize',
              step: 'cached',
              cachedAt: cached.completedAt,
              durationMs: cached.durationMs,
            });
            emit('summary_done', { stage: 'summarize', ...cached.result });
            stageTimings.summarize = cached.durationMs;
            completedStages.push('summarize');
          } else {
            const stageStart = Date.now();
            for (const clusterId of clusterIds) {
              await forwardSSEStage(
                forwardFetch,
                `/api/codebase-index/index-stream?cluster=${clusterId}&limit=${limit}&force=${String(force)}&dryRun=${String(dryRun)}&gpuTag=false`,
                { method: 'POST' },
                (event, data) => {
                  emit('stage', {
                    stage: 'summarize',
                    step: event,
                    clusterId,
                    details: data,
                  });
                },
                `Cluster summarize ${clusterId}`
              );
            }
            const resultData = { clusters: clusterIds, count: clusterIds.length };
            emit('summary_done', { stage: 'summarize', dryRun, simulated: dryRun, ...resultData });
            stageTimings.summarize = Date.now() - stageStart;
            completedStages.push('summarize');
            void cacheStage(runId, 'summarize', resultData, stageTimings.summarize);
          }
        } else {
          emit('stage', {
            stage: 'summarize',
            step: 'skipped',
            reason: 'summarize disabled',
          });
        }

        // ── Stage 7: GPU Karpathy tagging ───────────────────────────
        if (gpuTag) {
          const cached = cachedStages.get('tag');
          if (cached) {
            emit('stage', {
              stage: 'tag',
              step: 'cached',
              cachedAt: cached.completedAt,
              durationMs: cached.durationMs,
            });
            emit('tag_done', { stage: 'tag', ...cached.result });
            stageTimings.tag = cached.durationMs;
            completedStages.push('tag');
          } else {
            const stageStart = Date.now();
            const tagComplete = await forwardSSEStage(
              forwardFetch,
              '/api/codebase-index/karpathy-tag/gpu',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  batchSize: 200,
                  threshold: 0.35,
                  maxTags: 4,
                  dryRun,
                  forceRetag,
                  limit: backfillLimit,
                }),
              },
              (event, data) => {
                emit('stage', {
                  stage: 'tag',
                  step: event,
                  details: data,
                });
              },
              'GPU tag backfill'
            );
            const resultData = {
              limit: backfillLimit,
              dryRun,
              simulated: dryRun,
              details: tagComplete,
            };
            emit('tag_done', { stage: 'tag', ...resultData });
            stageTimings.tag = Date.now() - stageStart;
            completedStages.push('tag');
            void cacheStage(runId, 'tag', resultData as Record<string, unknown>, stageTimings.tag);
          }
        } else {
          emit('stage', {
            stage: 'tag',
            step: 'skipped',
            reason: 'gpuTag disabled',
          });
        }

        // ── Stage 8: Wiki export (Karpathy notes → CouchDB) ────────
        if (exportWiki && !dryRun) {
          const cached = cachedStages.get('wiki_export');
          if (cached) {
            emit('stage', {
              stage: 'wiki_export',
              step: 'cached',
              cachedAt: cached.completedAt,
              durationMs: cached.durationMs,
            });
            emit('wiki_done', { stage: 'wiki_export', ...cached.result });
            stageTimings.wiki_export = cached.durationMs;
            completedStages.push('wiki_export');
          } else {
            const stageStart = Date.now();
            emit('wiki_started', { stage: 'wiki_export' });

            try {
              const { generateAllClusterNotes } = await importKarpathyWiki();
              const wikiResult = await generateAllClusterNotes('gpu');

              const resultData = {
                generated: wikiResult.generated,
                failed: wikiResult.failed,
                clusters: wikiResult.clusters,
              };
              emit('wiki_done', { stage: 'wiki_export', ...resultData });
              stageTimings.wiki_export = Date.now() - stageStart;
              completedStages.push('wiki_export');
              void cacheStage(runId, 'wiki_export', resultData, stageTimings.wiki_export);
            } catch (err) {
              emit('stage', {
                stage: 'wiki_export',
                step: 'failed',
                error: (err as Error).message,
              });
            }
          }
        } else {
          emit('stage', {
            stage: 'wiki_export',
            step: 'skipped',
            reason: dryRun ? 'dryRun' : 'exportWiki disabled',
          });
        }

        // ── Stage 9: 4D hypergraph (SOM×cosine×GRPO manifold) ───────
        if (hypergraph && !dryRun) {
          const cached = cachedStages.get('hypergraph_4d');
          if (cached) {
            emit('stage', {
              stage: 'hypergraph_4d',
              step: 'cached',
              cachedAt: cached.completedAt,
              durationMs: cached.durationMs,
            });
            emit('hypergraph_done', { stage: 'hypergraph_4d', ...cached.result });
            stageTimings.hypergraph_4d = cached.durationMs;
            completedStages.push('hypergraph_4d');
          } else {
            const stageStart = Date.now();
            emit('hypergraph_started', { stage: 'hypergraph_4d' });

            try {
              const buildHypergraph4D = await importHypergraph4D();
              const hgResult = await buildHypergraph4D();

              const resultData = {
                nodesTagged: hgResult.nodesTagged,
                hyperedges: hgResult.hyperedges,
                gradeA: hgResult.gradeA,
                gradeB: hgResult.gradeB,
                gradeC: hgResult.gradeC,
                gradeD: hgResult.gradeD,
                source: hgResult.source,
                durationMs: hgResult.durationMs,
              };
              emit('hypergraph_done', { stage: 'hypergraph_4d', ...resultData });
              stageTimings.hypergraph_4d = Date.now() - stageStart;
              completedStages.push('hypergraph_4d');
              void cacheStage(runId, 'hypergraph_4d', resultData, stageTimings.hypergraph_4d);
            } catch (err) {
              emit('stage', {
                stage: 'hypergraph_4d',
                step: 'failed',
                error: (err as Error).message,
              });
            }
          }
        } else {
          emit('stage', {
            stage: 'hypergraph_4d',
            step: 'skipped',
            reason: dryRun ? 'dryRun' : 'hypergraph disabled',
          });
        }

        // ── Stage 10: Deep-research web search indexing ───────────────
        if (deepResearch && !dryRun) {
          const cached = cachedStages.get('deep_research');
          if (cached) {
            emit('stage', {
              stage: 'deep_research',
              step: 'cached',
              cachedAt: cached.completedAt,
              durationMs: cached.durationMs,
            });
            emit('deep_research_done', { stage: 'deep_research', ...cached.result });
            stageTimings.deep_research = cached.durationMs;
            completedStages.push('deep_research');
          } else {
            const stageStart = Date.now();
            emit('deep_research_started', { stage: 'deep_research' });

            try {
              const runDeepResearch = await importDeepResearch();
              const drResult = await runDeepResearch({
                runId,
                onProgress: (msg) => {
                  emit('stage', { stage: 'deep_research', step: 'progress', message: msg });
                },
              });

              const resultData = {
                queriesRun: drResult.queriesRun,
                pagesIndexed: drResult.pagesIndexed,
                pagesSkipped: drResult.pagesSkipped,
                pagesFailed: drResult.pagesFailed,
                rowsInserted: drResult.rowsInserted,
                rowsUpdated: drResult.rowsUpdated,
                durationMs: drResult.durationMs,
              };
              emit('deep_research_done', { stage: 'deep_research', ...resultData });
              stageTimings.deep_research = Date.now() - stageStart;
              completedStages.push('deep_research');
              void cacheStage(runId, 'deep_research', resultData, stageTimings.deep_research);
            } catch (err) {
              emit('stage', {
                stage: 'deep_research',
                step: 'failed',
                error: (err as Error).message,
              });
            }
          }
        } else {
          emit('stage', {
            stage: 'deep_research',
            step: 'skipped',
            reason: dryRun ? 'dryRun' : 'deepResearch disabled',
          });
        }

        // ── Complete ─────────────────────────────────────────────────
        const resumedStages = [...cachedStages.keys()];
        emit('complete', {
          runId,
          dryRun,
          completedStages,
          simulatedStages: dryRun ? completedStages : [],
          resumedStages,
          clusterCount,
          clusterIds,
          cuda: isCudaAvailable(),
          stageTimings,
          totalMs: Date.now() - startedAt,
        });

        // Update run metadata with final state
        void setRunMeta(runId, {
          scope,
          clusterCount,
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date().toISOString(),
          completedStages,
          resumedStages,
          totalMs: Date.now() - startedAt,
        });
      } catch (error) {
				emit('failed', {
					message: (error as Error).message ?? String(error),
					totalMs: Date.now() - startedAt,
				});
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, { headers: sseHeaders() });
};

// ── GET handler (status + schema) ───────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals, fetch }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const jobId = url.searchParams.get('jobId');
	const scope = url.searchParams.get('scope');

	if (jobId || scope) {
		const resolvedJobId = jobId ?? (scope ? await getLatestJobId(scope) : null);
		if (!resolvedJobId) {
			return json({ success: true, job: null });
		}

		const response = await fetch(`/api/codebase/wiki/index?jobId=${encodeURIComponent(resolvedJobId)}`);
		if (!response.ok) {
			const text = await response.text().catch(() => '');
			return json({ error: text || 'Job lookup failed' }, { status: response.status });
		}

		const payload = await response.json();
		return json({
			...payload,
			proxiedFrom: '/api/codebase/wiki/index',
			statusPath: `/api/codebase-index/orchestrate?jobId=${encodeURIComponent(resolvedJobId)}`,
		});
	}

	let collection = { exists: false, points: 0, vectors: 0, status: 'unknown' };
	const collectionResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`).catch(() => null);
	if (collectionResponse?.ok) {
		const payload = await collectionResponse.json();
		const info = payload.result;
		collection = {
			exists: true,
			points: info?.points_count ?? 0,
			vectors: info?.vectors_count ?? 0,
			status: info?.status ?? 'unknown',
		};
	}

	let tagCoverage = { total: 0, tagged: 0, pct: 0 };
	const tagResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ limit: 2000, with_payload: true, with_vector: false }),
	}).catch(() => null);
	if (tagResponse?.ok) {
		const payload = await tagResponse.json() as { result?: { points?: Array<{ payload?: Record<string, unknown> }> } };
		const points = payload.result?.points ?? [];
		tagCoverage.total = points.length;
		tagCoverage.tagged = points.filter((point) => {
			const tags = point.payload?.tags;
			return Array.isArray(tags) ? tags.length > 0 : Boolean(tags);
		}).length;
		tagCoverage.pct = tagCoverage.total > 0
			? Math.round((tagCoverage.tagged / tagCoverage.total) * 100)
			: 0;
	}

	const pgMirror = await getPgMirrorStatus();

	return json({
		endpoint: '/api/codebase-index/orchestrate',
		description: 'Core codebase index pipeline — AST scan, dual embed, cluster assignment, cluster summaries, and GPU tag backfill, with heavier topology stages opt-in',
		collection,
		pgMirror,
		tagCoverage,
		cuda: isCudaAvailable(),
		stages: ALL_STAGES,
		params: {
			mode: 'sync | async (default sync)',
			scope: 'routes | lib | all (default all)',
			incremental: 'boolean (default false)',
			runIndexing: 'boolean (default true unless dryRun=true)',
			indexFileLimit: 'optional max files for sync inline indexing',
			clusterCount: 'number (2-100, default 20)',
			clusterRange: 'range string, e.g. 0-5 or 0,2,4',
			limit: 'per-cluster summarize limit (1-200, default 50)',
			backfillLimit: 'GPU tag + SOM file limit (10-10000, default 2000)',
			dryRun: 'boolean (default false)',
			force: 'boolean (default false)',
			gpuTag: 'boolean (default true)',
			summarize: 'boolean (default true)',
			forceRetag: 'boolean (default false)',
			recompute: 'boolean (default false) — force full re-index even if data exists',
			somTopology: 'boolean (default false) — optional GPU Kohonen SOM + Neo4j SIMILAR_TOPOLOGY edges',
			neo4jSync: 'boolean (default false) — optional CodebaseFile + IMPORTS sync to Neo4j',
			pageRank: 'boolean (default false) — optional CouchDB power-iteration PageRank',
			exportWiki: 'boolean (default false) — generate Karpathy wiki notes per cluster',
			hypergraph: 'boolean (default false) — build 4D SOM×cosine×GRPO hypergraph',
			runId: 'string (auto-generated if omitted) — checkpoint ID for resume on disconnect',
			resume: 'boolean (default false) — skip stages already cached under this runId (2h TTL)',
		},
		statusHint: {
			byJobId: '/api/codebase-index/orchestrate?jobId=<job-id>',
			byScope: '/api/codebase-index/orchestrate?scope=all',
		},
	});
};
