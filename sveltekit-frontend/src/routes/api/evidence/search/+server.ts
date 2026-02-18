/**
 * POST /api/evidence/search
 *
 * Graph-hop semantic evidence retrieval:
 *   1. Embed query → pgvector cosine search on evidence_vectors
 *   2. Take top chunk hits → look up their section (via metadata.sectionPath)
 *   3. Graph hop: pull sibling chunks from same section
 *   4. Resolve citation cross-references
 *   5. Return coherent context bundles (not isolated snippets)
 *
 * Also queries Qdrant evidence_items if available (fast ANN pre-filter).
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import db from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { ENV } from '$lib/server/env.server.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

interface SearchResult {
	evidenceId: string;
	chunkIndex: number;
	content: string;
	score: number;
	metadata: Record<string, unknown>;
}

interface ContextBundle {
	/** The primary hit chunk */
	hit: SearchResult;
	/** Sibling chunks from the same section (graph hop) */
	siblings: SearchResult[];
	/** Section path hierarchy */
	sectionPath: string[];
	/** Heading of the section */
	heading: string;
	/** Citations found across this bundle */
	citations: string[];
}

export async function POST({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const { query, caseId, limit = 10, expandSections = true } = body as {
			query: string;
			caseId?: string;
			limit?: number;
			expandSections?: boolean;
		};

		if (!query || typeof query !== 'string') {
			return json({ error: 'query is required' }, { status: 400 });
		}

		const start = performance.now();

		// 1. Embed the query
		const queryEmbedding = await embedQuery(query);
		if (!queryEmbedding) {
			return json({ error: 'Failed to generate query embedding' }, { status: 500 });
		}
		const embedMs = performance.now() - start;

		// 2. Search pgvector for top chunks
		const searchStart = performance.now();
		const hits = await searchPgvector(queryEmbedding, caseId, limit);
		const searchMs = performance.now() - searchStart;

		if (hits.length === 0) {
			return json({
				results: [],
				bundles: [],
				timing: { embedMs: Math.round(embedMs), searchMs: Math.round(searchMs), totalMs: Math.round(performance.now() - start) },
			});
		}

		// 3. Graph-hop: expand each hit to its section siblings
		let bundles: ContextBundle[] = [];
		if (expandSections) {
			const hopStart = performance.now();
			bundles = await expandToSections(hits, caseId);
			const hopMs = performance.now() - hopStart;

			return json({
				results: hits,
				bundles,
				timing: {
					embedMs: Math.round(embedMs),
					searchMs: Math.round(searchMs),
					hopMs: Math.round(hopMs),
					totalMs: Math.round(performance.now() - start),
				},
			});
		}

		return json({
			results: hits,
			bundles: [],
			timing: {
				embedMs: Math.round(embedMs),
				searchMs: Math.round(searchMs),
				totalMs: Math.round(performance.now() - start),
			},
		});
	} catch (err) {
		console.error('[Evidence Search] Error:', err);
		return json({ error: 'Search failed' }, { status: 500 });
	}
}

/**
 * Embed query text. Tries gRPC → Ollama.
 */
async function embedQuery(text: string): Promise<number[] | null> {
	try {
		const vec = await generateSingleEmbedding(text);
		if (vec && vec.length > 0) return vec;
	} catch { /* fall through */ }

	try {
		const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text }),
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return null;
		const data = await res.json();
		return data.embedding;
	} catch {
		return null;
	}
}

/**
 * pgvector cosine similarity search on evidence_vectors.
 */
async function searchPgvector(
	embedding: number[],
	caseId: string | undefined,
	limit: number
): Promise<SearchResult[]> {
	const vectorStr = `[${embedding.join(',')}]`;

	const query = caseId
		? sql`
			SELECT ev.evidence_id, ev.chunk_index, ev.content, ev.metadata,
				1 - (ev.embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}) AS score
			FROM evidence_vectors ev
			JOIN evidence e ON e.id = ev.evidence_id
			WHERE e.case_id = ${caseId}
			ORDER BY ev.embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}
			LIMIT ${limit}
		`
		: sql`
			SELECT ev.evidence_id, ev.chunk_index, ev.content, ev.metadata,
				1 - (ev.embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}) AS score
			FROM evidence_vectors ev
			ORDER BY ev.embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}
			LIMIT ${limit}
		`;

	const result = await db.execute(query);
	const rows = (result as any).rows ?? result;

	return rows.map((row: any) => ({
		evidenceId: row.evidence_id,
		chunkIndex: row.chunk_index,
		content: row.content,
		score: parseFloat(row.score) || 0,
		metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {}),
	}));
}

/**
 * Graph hop: for each hit, find sibling chunks in the same section.
 * Uses metadata.sectionPath to group chunks.
 */
async function expandToSections(
	hits: SearchResult[],
	caseId: string | undefined
): Promise<ContextBundle[]> {
	const bundles: ContextBundle[] = [];
	const seenSections = new Set<string>();

	for (const hit of hits) {
		const sectionPath: string[] = (hit.metadata?.sectionPath as string[]) ?? [];
		const heading: string = (hit.metadata?.heading as string) ?? '';
		const sectionKey = sectionPath.join(' > ') || `chunk-${hit.chunkIndex}`;

		// Skip duplicate sections
		if (seenSections.has(sectionKey)) continue;
		seenSections.add(sectionKey);

		let siblings: SearchResult[] = [];

		if (sectionPath.length > 0) {
			// Find sibling chunks that share the same sectionPath
			const sectionPathJson = JSON.stringify(sectionPath);
			const siblingResult = await db.execute(sql`
				SELECT evidence_id, chunk_index, content, metadata
				FROM evidence_vectors
				WHERE evidence_id = ${hit.evidenceId}
				AND metadata->>'sectionPath' IS NOT NULL
				AND metadata @> ${sql.raw(`'{"sectionPath":${sectionPathJson}}'::jsonb`)}
				AND chunk_index != ${hit.chunkIndex}
				ORDER BY chunk_index
				LIMIT 10
			`);

			const sibRows = (siblingResult as any).rows ?? siblingResult;
			siblings = sibRows.map((row: any) => ({
				evidenceId: row.evidence_id,
				chunkIndex: row.chunk_index,
				content: row.content,
				score: 0,
				metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {}),
			}));
		}

		// Collect all citations from hit + siblings
		const allCitations = [
			...((hit.metadata?.citations as string[]) ?? []),
			...siblings.flatMap(s => (s.metadata?.citations as string[]) ?? []),
		];
		const uniqueCitations = [...new Set(allCitations)];

		bundles.push({
			hit,
			siblings,
			sectionPath,
			heading,
			citations: uniqueCitations,
		});
	}

	return bundles;
}