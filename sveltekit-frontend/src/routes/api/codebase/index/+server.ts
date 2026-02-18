/**
 * POST /api/codebase/index
 *
 * Triggers the AST-aware chunking + dual-embedding indexing pipeline.
 * Walks the codebase, chunks by function/export/handler, generates
 * dual embeddings (content + signature), stores in Qdrant.
 *
 * This is the "heavy work" endpoint — enqueue via RabbitMQ for large repos,
 * or run inline for incremental indexing (few files).
 *
 * Query params:
 *   ?scope=routes    — only index src/routes/**
 *   ?scope=lib       — only index src/lib/**
 *   ?scope=tests     — only index tests/**
 *   ?scope=all       — index everything (default)
 *   ?incremental=true — only re-index files modified since last run
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chunkFiles } from '$lib/server/indexer/ast-chunker.js';
import { indexChunks } from '$lib/server/indexer/dual-embedder.js';
import { resolve } from 'path';
import { readdir, stat } from 'fs/promises';

const ROOT = resolve(process.cwd());

const SCOPE_GLOBS: Record<string, string[]> = {
	routes: ['src/routes'],
	lib: ['src/lib'],
	tests: ['tests'],
	all: ['src/routes', 'src/lib', 'tests']
};

const INDEXABLE_EXTENSIONS = new Set(['.ts', '.js', '.mts', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'archives', 'backups', 'phase104-backups']);

/**
 * Recursively collect .ts/.js files from a directory.
 */
async function collectFiles(dir: string): Promise<string[]> {
	const files: string[] = [];

	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (SKIP_DIRS.has(entry.name)) continue;
			const full = resolve(dir, entry.name);

			if (entry.isDirectory()) {
				const sub = await collectFiles(full);
				files.push(...sub);
			} else if (entry.isFile() && INDEXABLE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
				// Skip corrupted services directory
				if (full.includes('lib/services/') && !full.includes('lib/server/services/')) continue;
				files.push(full);
			}
		}
	} catch {
		// directory doesn't exist or permission error
	}

	return files;
}

export const POST: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const scope = url.searchParams.get('scope') ?? 'all';
	const async_ = url.searchParams.get('async') === 'true';
	const dirs = SCOPE_GLOBS[scope] ?? SCOPE_GLOBS.all;

	// For large jobs (scope=all or async=true), enqueue via RabbitMQ if available
	if (async_ || scope === 'all') {
		try {
			const { rabbitmq } = await import('$lib/server/queue/rabbitmq-manager-fixed.js');
			const enqueued = await rabbitmq.publishCodebaseIndex({
				scope,
				requestedBy: locals.user.id
			});
			if (enqueued) {
				return json({
					success: true,
					async: true,
					scope,
					message: `Indexing job enqueued for scope="${scope}". Check GET /api/codebase/index for progress.`
				});
			}
		} catch {
			// RabbitMQ not available — fall through to inline indexing
		}
	}

	const start = performance.now();

	// 1. Collect files
	const allFiles: string[] = [];
	for (const dir of dirs) {
		const absDir = resolve(ROOT, dir);
		const files = await collectFiles(absDir);
		allFiles.push(...files);
	}

	// 2. AST-aware chunking
	const chunks = chunkFiles(allFiles, ROOT);

	const chunkMs = performance.now() - start;

	// 3. Dual embedding + Qdrant upsert
	const result = await indexChunks(chunks);

	const totalMs = performance.now() - start;

	return json({
		success: true,
		async: false,
		scope,
		filesScanned: allFiles.length,
		chunksExtracted: chunks.length,
		...result,
		timing: {
			chunkMs: Math.round(chunkMs),
			embedMs: result.durationMs,
			totalMs: Math.round(totalMs)
		}
	});
};

/**
 * GET /api/codebase/index
 *
 * Returns index status: collection stats, last indexed timestamp, chunk count.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const { ENV } = await import('$lib/server/env.server.js');
		const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks`);
		if (!res.ok) {
			return json({ indexed: false, message: 'Collection not found' });
		}

		const data = await res.json();
		const info = data.result;

		return json({
			indexed: true,
			pointsCount: info?.points_count ?? 0,
			vectorsCount: info?.vectors_count ?? 0,
			status: info?.status ?? 'unknown',
			segmentsCount: info?.segments_count ?? 0
		});
	} catch {
		return json({ indexed: false, message: 'Qdrant not reachable' });
	}
};
