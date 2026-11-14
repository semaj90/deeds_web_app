import { createHash } from 'node:crypto';
import type { ACEContext } from '$lib/server/ace/types.js';
import { pool } from '$lib/server/db/client.js';
import type { UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const MAX_DOCUMENT_CONTEXT_CHUNKS = 32;

export interface LibraryDocumentSynthesisScopeV1 {
	readonly actorId: number;
	readonly documentId: string;
	readonly sourceRevision: string;
	readonly sourceHash: string;
	readonly caseId: string | null;
}

interface LibraryDocumentSynthesisChunkRowV1 {
	chunk_id: string;
	document_id: string;
	document_revision: string;
	source_hash: string;
	parser_revision: string;
	chunk_hash: string;
	chunk_text: string;
	page_start: number | null;
	page_end: number | null;
	char_start: number;
	char_end: number;
	char_offset_unit: string;
	chunk_index: number;
	title: string | null;
	score: number;
}

/**
 * Retrieves only current, integrity-checked chunks from the explicitly admitted
 * document revision. No Qdrant, cache, graph, web, or case-wide retrieval lane is
 * consulted for this context.
 */
export async function loadLibraryDocumentSynthesisChunksV1(
	scope: LibraryDocumentSynthesisScopeV1,
	query: string,
): Promise<UnifiedRetrievalResult[]> {
	if (
		!Number.isSafeInteger(scope.actorId) || scope.actorId <= 0 ||
		!UUID_RE.test(scope.documentId) || !UUID_RE.test(scope.sourceRevision) ||
		!SHA256_RE.test(scope.sourceHash) || (scope.caseId !== null && !UUID_RE.test(scope.caseId))
	) {
		throw new Error('INVALID_LIBRARY_DOCUMENT_SYNTHESIS_SCOPE');
	}
	const result = await pool.query<LibraryDocumentSynthesisChunkRowV1>(
		`SELECT lc.id::text AS chunk_id, ln.document_id::text AS document_id,
		        ldv.id::text AS document_revision, ld.source_hash, lc.parser_revision,
		        lc.chunk_hash, lc.chunk_text, lc.page_start, lc.page_end,
		        lc.char_start, lc.char_end, lc.char_offset_unit, lc.chunk_index,
		        ld.title,
		        ts_rank_cd(to_tsvector('english', lc.chunk_text), websearch_to_tsquery('english', $4)) AS score
		 FROM legal_chunks lc
		 JOIN legal_nodes ln ON ln.id = lc.legal_node_id
		 JOIN library_documents ld ON ld.id = ln.document_id
		 JOIN library_document_versions ldv
		   ON ldv.id = ln.version_id AND ldv.document_id = ld.id
		 WHERE ld.id = $1::uuid
		   AND ldv.id = $2::uuid AND ldv.is_current IS TRUE
		   AND ld.source_hash = $3
		   AND ldv.source_hash = $3
		   AND (ld.uploaded_by IS NULL OR ld.uploaded_by = $5::integer)
		   AND ($6::uuid IS NULL OR EXISTS (
		       SELECT 1 FROM case_library_links cl
		       WHERE cl.document_id = ld.id AND cl.case_id = $6::uuid
		   ))
		   AND lc.parser_revision IS NOT NULL
		   AND lc.char_offset_unit = 'utf16_code_units'
		   AND lc.char_start >= 0 AND lc.char_end > lc.char_start
		   AND lc.chunk_hash ~ '^[a-fA-F0-9]{64}$'
		 ORDER BY score DESC, lc.page_start ASC NULLS LAST,
		          lc.char_start ASC, lc.chunk_index ASC, lc.id ASC
		 LIMIT ${MAX_DOCUMENT_CONTEXT_CHUNKS}`,
		[scope.documentId, scope.sourceRevision, scope.sourceHash.toLowerCase(), query, scope.actorId, scope.caseId],
	);

	const chunks: UnifiedRetrievalResult[] = [];
	for (const row of result.rows) {
		if (
			row.document_id !== scope.documentId || row.document_revision !== scope.sourceRevision ||
			row.source_hash.toLowerCase() !== scope.sourceHash.toLowerCase() ||
			!row.parser_revision || !Number.isSafeInteger(row.char_start) || !Number.isSafeInteger(row.char_end) ||
			row.char_start < 0 || row.char_end <= row.char_start || row.char_offset_unit !== 'utf16_code_units' ||
			!Number.isSafeInteger(row.chunk_index) || row.chunk_index < 0
		) continue;
		const actualChunkHash = createHash('sha256').update(row.chunk_text, 'utf8').digest('hex');
		if (!SHA256_RE.test(row.chunk_hash) || actualChunkHash !== row.chunk_hash.toLowerCase()) continue;
		chunks.push({
			id: row.chunk_id,
			identityStatus: 'canonical',
			kind: 'legal_doc',
			source: 'pgvector',
			sourceId: scope.documentId,
			content: row.chunk_text,
			score: Number.isFinite(Number(row.score)) ? Number(row.score) : 0,
			tags: [],
			metadata: {
				chunk_id: row.chunk_id,
				document_id: row.document_id,
				document_revision: row.document_revision,
				source_hash: row.source_hash.toLowerCase(),
				parser_revision: row.parser_revision,
				chunk_hash: row.chunk_hash.toLowerCase(),
				page_start: row.page_start,
				page_end: row.page_end,
				char_start: row.char_start,
				char_end: row.char_end,
				char_offset_unit: row.char_offset_unit,
				title: row.title,
			},
		});
	}
	return chunks;
}

/** An ACE-compatible context containing only the exact document chunks supplied. */
export function buildLibraryDocumentSynthesisContextV1(
	chunks: UnifiedRetrievalResult[],
	persona = 'neutral',
): ACEContext {
	return {
		userProfile: null,
		caseContext: null,
		glossaryMatches: null,
		ragChunks: [],
		kbChunks: [],
		caseChunks: chunks,
		docChunks: [],
		kagNeighbors: [],
		chatHistory: [],
		entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
		practiceTemplate: null,
		queryTags: [],
		webSearchContext: null,
		persona,
		evidenceMetadata: null,
		evidenceConnections: null,
		userAnalyticsContext: null,
		codebaseContext: null,
		policyDecision: null,
		selectedRelationCards: null,
		selectedClusterSummaries: null,
		cacheTrace: null,
		topRuntimeDependencies: null,
		clusterContext: null,
		codeLlmHit: null,
		dbSchemaContext: null,
		schemaDependentsContext: null,
		aceContextPacket: null,
	} as ACEContext;
}
