/**
 * Related Files API — Qdrant semantic search for similar code files.
 *
 * POST /api/codebase-index/related
 * Body: { filePath: string, limit?: number }
 *
 * Reads the file, generates an embedding, queries codebase_chunks_768,
 * and returns semantically similar files ranked by score.
 *
 * Uses the hybrid-ranker pattern: semantic (Qdrant) + fuzzy (Fuse.js) fusion.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve, relative } from 'path';
import { readFileSync } from 'fs';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { z } from 'zod';

const PROJECT_ROOT = resolve(process.cwd());

const relatedSchema = z.object({
	filePath: z.string().min(1, 'filePath is required').max(500, 'filePath too long'),
	limit: z.number().int().min(1).max(20).optional().default(8),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = relatedSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { filePath, limit } = parsed.data;

	// Resolve path
	const normalizedPath = filePath.startsWith('src/')
		? resolve(PROJECT_ROOT, filePath)
		: resolve(PROJECT_ROOT, 'src', filePath);

	if (!normalizedPath.startsWith(PROJECT_ROOT)) {
		return json({ error: 'Path outside project boundary' }, { status: 400 });
	}

	// Read file for embedding
	let fileContent: string;
	try {
		fileContent = readFileSync(normalizedPath, 'utf-8');
	} catch {
		return json({ error: 'File not found' }, { status: 404 });
	}

	const relPath = relative(PROJECT_ROOT, normalizedPath).replace(/\\/g, '/');

	// Truncate content for embedding (first 2KB is enough for semantic similarity)
	const embeddingText = `${relPath}\n${fileContent.slice(0, 2048)}`;

	const startMs = Date.now();

	try {
		// Generate embedding via the 4-tier fallback chain (gRPC → QUIC → HTTP → sequential)
		const queryEmbedding = await generateSingleEmbedding(embeddingText);

		// Search Qdrant codebase_chunks_768 (dual-vector: content + signature)
		const { results: hits, metadata: searchMeta } = await qdrant.hybridSearch({
			collection: 'codebase_chunks_768',
			query: embeddingText.slice(0, 512),
			queryEmbedding,
			limit: limit * 3, // Over-fetch for dedup
			scoreThreshold: 0.25,
		});

		// Deduplicate by file path (multiple chunks from same file)
		const seenPaths = new Set<string>();
		seenPaths.add(relPath); // Exclude the query file itself

		const related = hits
			.map(hit => {
				const p = (hit.payload ?? {}) as Record<string, unknown>;
				const hitPath = String(
					p.relativePath ?? p.filePath ?? p.file_path ?? p.source_path ?? p.path ?? ''
				).replace(/\\/g, '/');
				return {
					id: hit.id,
					score: hit.score,
					filePath: hitPath,
					symbol: String(p.symbol ?? p.symbol_name ?? ''),
					kind: String(p.kind ?? p.symbol_kind ?? ''),
					content: ((p.content ?? p.text ?? '') as string).slice(0, 200),
					signature: ((p.signature ?? '') as string).slice(0, 150),
					language: (p.language ?? 'typescript') as string,
					httpMethod: (p.httpMethod ?? '') as string,
					tags: (p.tags ?? []) as string[],
				};
			})
			.filter(hit => {
				if (!hit.filePath) return false;
				// Deduplicate by file path
				const normPath = hit.filePath.replace(/^src\//, '');
				if (seenPaths.has(hit.filePath) || seenPaths.has(normPath)) return false;
				seenPaths.add(hit.filePath);
				seenPaths.add(normPath);
				return true;
			})
			.slice(0, limit);

		return json({
			queryFile: relPath,
			related,
			timing: {
				totalMs: Date.now() - startMs,
				searchType: searchMeta.searchType,
				cached: searchMeta.cached,
			},
		});
	} catch (err) {
		console.error('[codebase-related] Search error:', err);
		return json(
			{
				queryFile: relPath,
				related: [],
				error: 'Vector search unavailable',
				timing: { totalMs: Date.now() - startMs },
			},
			{ status: 503 }
		);
	}
};
