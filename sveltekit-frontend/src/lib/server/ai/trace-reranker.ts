import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';
import { getActiveSemanticVectorLane } from '$lib/server/vector/lane-registry.js';

export type TraceRerankResult = {
	id: string | number;
	score: number;
	payload: any;
	lenses: Array<{ type: string; text: string }>;
};

type CanonicalTraceRow = {
	source_ref: string;
	relative_path: string | null;
	content: string | null;
	summary: string | null;
	packet_key: string | null;
	workspace_revision: number | null;
	representation_revision: number | null;
	pagerank_score: number | null;
	source_revision: string | null;
	updated_at: Date | null;
};

const CANONICAL_COLLECTION = getActiveSemanticVectorLane().collection;
const MIN_JOIN_COVERAGE = 0.6;

/**
 * TRACE Reranker: Triage, Retrieve, Align, Compose, Encode.
 *
 * Performs multi-stage retrieval across codebase chunks, architectural lenses,
 * and synthesis memory to provide high-precision context for agentic tasks.
 */
export async function traceRerank(params: {
	query: string;
	queryEmbedding: number[];
	limit?: number;
	intentOverride?: string[];
}): Promise<TraceRerankResult[]> {
	const qdrant = getQdrantManager();
	const limit = params.limit ?? 10;

	// 1. Triage Intent
	const lensesToRetrieve = params.intentOverride ?? detectIntentLenses(params.query);

	// 2. Retrieve Chunks (Codebase level)
	const chunkHits = await qdrant.hybridSearch({
		collection: CANONICAL_COLLECTION,
		query: params.query,
		queryEmbedding: params.queryEmbedding,
		limit: limit * 3 // Over-retrieve for reranking
	});

	// 3. Retrieve Lenses (Architectural intent level)
	const lensHits = await qdrant.hybridSearch({
		collection: 'summary_lenses',
		query: params.query,
		queryEmbedding: params.queryEmbedding,
		filters: { lens_type: lensesToRetrieve },
		limit: limit * 2
	});

	// 4. Retrieve Synthesis Memory (Reasoning history level)
	const memoryHits = await qdrant.hybridSearch({
		collection: 'synthesis_memory',
		query: params.query,
		queryEmbedding: params.queryEmbedding,
		limit: 5
	});

	// 5. Retrieve External Research (Lane 3 / World Evidence level)
	// Includes both raw web chunks and encoded Research Notes
	const researchHits = await qdrant.hybridSearch({
		collection: 'synthesis_memory_768', // Encoded research notes live here too
		query: params.query,
		queryEmbedding: params.queryEmbedding,
		filters: { vector_type: 'research_note' },
		limit: 3
	});

	const canonicalRows = await joinCanonicalTraceRows(
		chunkHits.results.map((chunk) => canonicalIdentity(chunk.payload?.source_ref, chunk.payload?.path))
	);
	const canonicalRowByRef = new Map<string, CanonicalTraceRow>();
	for (const row of canonicalRows) {
		canonicalRowByRef.set(row.source_ref, row);
		if (row.relative_path) {
			canonicalRowByRef.set(row.relative_path, row);
		}
	}
	const joinCoverage = canonicalRows.length / Math.max(chunkHits.results.length, 1);

	if (canonicalRows.length === 0 || joinCoverage < MIN_JOIN_COVERAGE) {
		throw new Error(
			`CANONICAL_JOIN_BACK_FAILED: qdrant_candidates=${chunkHits.results.length} postgres_joined=${canonicalRows.length} join_coverage=${joinCoverage.toFixed(2)}`
		);
	}

	// 6. Align (Intent-based Reranking)
	const results: TraceRerankResult[] = chunkHits.results.flatMap((chunk) => {
		const sourceRef = canonicalIdentity(chunk.payload?.source_ref, chunk.payload?.path);
		const canonicalRow = canonicalRowByRef.get(sourceRef);
		if (!canonicalRow) {
			return [];
		}

		// Find lenses associated with this file or its parent directories
		const associatedLenses = lensHits.results.filter((l) => {
			const lensKey = (l.payload?.stable_key as string) ?? '';
			return sourceRef.startsWith(lensKey.replace('file:', '').replace('dir:', ''));
		});

		// Calculate intent alignment boost
		let intentBoost = 0;
		if (associatedLenses.length > 0) {
			intentBoost = Math.max(...associatedLenses.map(l => l.score)) * 0.15;
		}

		// Calculate memory alignment boost (Internal reasoning)
		let memoryBoost = 0;
		if (memoryHits.results.some(m => (m.payload?.content as string)?.includes(sourceRef))) {
			memoryBoost = 0.1;
		}

		// Calculate research alignment boost (External evidence)
		let researchBoost = 0;
		const relevantResearch = researchHits.results.find(r =>
			(r.payload?.linkedFiles as string[])?.includes(sourceRef)
		);
		if (relevantResearch) {
			const trustTier = (relevantResearch.payload?.trustTier as string) ?? 'unverified';
			const trustMultiplier = trustTier === 'official_or_primary' ? 0.25 : 0.1;
			researchBoost = relevantResearch.score * trustMultiplier;
		}

		return {
			id: chunk.id,
			score: chunk.score + intentBoost + memoryBoost + researchBoost,
			payload: {
				...chunk.payload,
				source_ref: canonicalRow.source_ref,
				path: canonicalRow.source_ref,
				content: canonicalRow.content ?? canonicalRow.summary ?? '',
				summary: canonicalRow.summary ?? '',
				packet_key: canonicalRow.packet_key,
				workspace_revision: canonicalRow.workspace_revision,
				representation_revision: canonicalRow.representation_revision,
				source_revision: canonicalRow.source_revision,
				pagerank_score: canonicalRow.pagerank_score,
				source_representation_id: 'semantic_768',
				source_dimension: 768,
				canonical_join_status: 'joined',
				canonical_join_coverage: joinCoverage,
			},
			lenses: associatedLenses.map(l => ({
				type: (l.payload?.lens_type as string) ?? 'summary',
				text: (l.payload?.text as string) ?? ''
			}))
		};
	});

	// 7. Sort and return top candidates
	return results
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}

function canonicalIdentity(sourceRef?: unknown, legacyPath?: unknown): string {
	const source = typeof sourceRef === 'string' ? sourceRef.trim() : '';
	if (source) return source;
	const path = typeof legacyPath === 'string' ? legacyPath.trim() : '';
	return path;
}

async function joinCanonicalTraceRows(sourceRefs: string[]): Promise<CanonicalTraceRow[]> {
	const uniqueSourceRefs = Array.from(new Set(sourceRefs.map((value) => value.trim()).filter(Boolean)));
	if (uniqueSourceRefs.length === 0) return [];

	const rows = await db.execute(sql`
		SELECT
			COALESCE(NULLIF(c.source_ref, ''), NULLIF(c.relative_path, ''), NULLIF(ap.source_ref, '')) AS source_ref,
			c.relative_path,
			COALESCE(NULLIF(c.content, ''), NULLIF(c.summary, ''), NULLIF(ap.summary, '')) AS content,
			COALESCE(NULLIF(c.summary, ''), NULLIF(ap.summary, '')) AS summary,
			ap.packet_key,
			ap.workspace_revision,
			ap.representation_revision,
			COALESCE(ap.pagerank, c.page_rank_score) AS pagerank_score,
			COALESCE(
				NULLIF(c.metadata->>'source_revision', ''),
				NULLIF(c.metadata->>'sourceRevision', ''),
				NULLIF(ap.metadata->>'source_revision', ''),
				NULLIF(ap.metadata->>'sourceRevision', '')
			) AS source_revision,
			COALESCE(c.updated_at, ap.updated_at) AS updated_at
		FROM codebase_chunk_index c
		LEFT JOIN atlas_packets ap
			ON ap.source_ref = c.relative_path
		WHERE (c.relative_path = ANY(${uniqueSourceRefs}::text[])
		   OR ap.source_ref = ANY(${uniqueSourceRefs}::text[]))
		  AND COALESCE(NULLIF(c.content, ''), NULLIF(c.summary, ''), NULLIF(ap.summary, '')) IS NOT NULL
	`);

	return (rows.rows as CanonicalTraceRow[])
		.map((row) => ({
			...row,
			source_ref: row.source_ref?.trim() ?? '',
		}))
		.filter((row) => row.source_ref.length > 0);
}

function detectIntentLenses(query: string): string[] {
	const q = query.toLowerCase();
	if (q.includes('how to') || q.includes('example') || q.includes('usage') || q.includes('api')) {
		return ['api_surface', 'purpose'];
	}
	if (q.includes('risk') || q.includes('security') || q.includes('vulnerability') || q.includes('audit')) {
		return ['risk', 'audit'];
	}
	if (q.includes('fix') || q.includes('error') || q.includes('bug') || q.includes('broken')) {
		return ['risk', 'purpose', 'retrieval_role'];
	}
	if (q.includes('depend') || q.includes('import') || q.includes('use') || q.includes('connection')) {
		return ['dependencies', 'api_surface'];
	}
	if (q.includes('research') || q.includes('others') || q.includes('github') || q.includes('reddit')) {
		return ['retrieval_role', 'purpose']; // External research is retrieved separately
	}
	return ['purpose', 'retrieval_role'];
}
