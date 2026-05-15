import { pool } from '$lib/server/db/client';

const LAW_CORPUS_TYPES = ['constitution', 'statute', 'regulation', 'bill'] as const;

type CorpusType = (typeof LAW_CORPUS_TYPES)[number];

export interface LawCitationDocument {
	documentId: string;
	title: string;
	corpusType: CorpusType | string | null;
	officialUrl: string | null;
	jurisdiction: { code: string | null; name: string | null } | null;
}

export interface LawCitationSearchHit {
	citationKey: string;
	citationLabel: string;
	sampleHeading: string | null;
	documentCount: number;
	nodeCount: number;
	chunkCount: number;
	documents: LawCitationDocument[];
}

export interface LawCitationNode {
	nodeId: string;
	documentId: string;
	documentTitle: string;
	corpusType: string | null;
	officialUrl: string | null;
	jurisdiction: { code: string | null; name: string | null } | null;
	heading: string | null;
	citationLabel: string;
	nodePath: string | null;
	nodeType: string;
	depth: number;
	pageStart: number | null;
	pageEnd: number | null;
}

export interface LawCitationChunk {
	chunkId: string;
	nodeId: string;
	documentId: string;
	documentTitle: string;
	corpusType: string | null;
	officialUrl: string | null;
	jurisdiction: { code: string | null; name: string | null } | null;
	heading: string | null;
	citationLabel: string;
	nodePath: string | null;
	nodeType: string;
	depth: number;
	chunkIndex: number;
	content: string;
	summary: string | null;
	pageStart: number | null;
	pageEnd: number | null;
	tokenCount: number | null;
}

export interface LawCitationDetail {
	citationKey: string;
	citationLabel: string;
	documentCount: number;
	nodeCount: number;
	chunkCount: number;
	documents: LawCitationDocument[];
	nodes: LawCitationNode[];
	chunks: LawCitationChunk[];
}

function normalizeCitationLabel(value: string) {
	return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseDocuments(value: unknown): LawCitationDocument[] {
	if (!Array.isArray(value)) return [];

	return value
		.map((entry) => {
			if (!entry || typeof entry !== 'object') return null;
			const document = entry as Record<string, unknown>;
			return {
				documentId: String(document.documentId ?? ''),
				title: String(document.title ?? ''),
				corpusType: document.corpusType ? String(document.corpusType) : null,
				officialUrl: document.officialUrl ? String(document.officialUrl) : null,
				jurisdiction: document.jurisdiction && typeof document.jurisdiction === 'object'
					? {
						code: (document.jurisdiction as Record<string, unknown>).code
							? String((document.jurisdiction as Record<string, unknown>).code)
							: null,
						name: (document.jurisdiction as Record<string, unknown>).name
							? String((document.jurisdiction as Record<string, unknown>).name)
							: null,
					}
					: null,
			};
		})
		.filter((entry): entry is LawCitationDocument => Boolean(entry?.documentId && entry.title));
}

export async function searchLawCitations(query = '', limit = 40): Promise<LawCitationSearchHit[]> {
	const cleanQuery = query.trim().replace(/\s+/g, ' ');
	const pattern = `%${cleanQuery}%`;

	const result = await pool.query<{
		citation_key: string;
		citation_label: string;
		sample_heading: string | null;
		document_count: number;
		node_count: number;
		chunk_count: number;
		documents: unknown;
	}>(
		`
		SELECT
			lower(regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g')) AS citation_key,
			min(regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g')) AS citation_label,
			min(nullif(trim(ln.heading), '')) AS sample_heading,
			count(DISTINCT ln.id)::int AS node_count,
			count(lc.id)::int AS chunk_count,
			count(DISTINCT ld.id)::int AS document_count,
			coalesce(
				jsonb_agg(
					DISTINCT jsonb_build_object(
						'documentId', ld.id,
						'title', ld.title,
						'corpusType', ld.corpus_type,
						'officialUrl', ld.official_url,
						'jurisdiction', jsonb_build_object('code', j.code, 'name', j.name)
					)
				) FILTER (WHERE ld.id IS NOT NULL),
				'[]'::jsonb
			) AS documents
		FROM legal_nodes ln
		JOIN library_documents ld ON ld.id = ln.document_id
		LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
		LEFT JOIN legal_chunks lc ON lc.legal_node_id = ln.id
		WHERE nullif(trim(ln.citation_label), '') IS NOT NULL
		  AND ld.corpus_type = ANY($1::corpus_type[])
		  AND (
				$2 = ''
				OR ln.citation_label ILIKE $3
				OR ln.heading ILIKE $3
				OR EXISTS (
					SELECT 1
					FROM legal_chunks lcx
					WHERE lcx.legal_node_id = ln.id
					  AND lcx.chunk_text ILIKE $3
				)
		  )
		GROUP BY lower(regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g'))
		ORDER BY
			CASE
				WHEN $2 <> '' AND lower(regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g')) = lower(regexp_replace(trim($2), '\\s+', ' ', 'g')) THEN 0
				WHEN $2 <> '' AND min(regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g')) ILIKE $3 THEN 1
				ELSE 2
			END,
			count(lc.id) DESC,
			min(regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g')) ASC
		LIMIT $4
		`,
		[LAW_CORPUS_TYPES, cleanQuery, pattern, limit]
	);

	return result.rows.map((row) => ({
		citationKey: row.citation_key,
		citationLabel: row.citation_label,
		sampleHeading: row.sample_heading,
		documentCount: Number(row.document_count ?? 0),
		nodeCount: Number(row.node_count ?? 0),
		chunkCount: Number(row.chunk_count ?? 0),
		documents: parseDocuments(row.documents),
	}));
}

export async function getLawCitationDetail(rawCitation: string, limit = 120): Promise<LawCitationDetail | null> {
	const citationKey = normalizeCitationLabel(rawCitation);
	if (!citationKey) return null;

	const [summaryResult, nodesResult, chunksResult] = await Promise.all([
		pool.query<{
			citation_label: string;
			document_count: number;
			node_count: number;
			chunk_count: number;
			documents: unknown;
		}>(
			`
			SELECT
				min(regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g')) AS citation_label,
				count(DISTINCT ld.id)::int AS document_count,
				count(DISTINCT ln.id)::int AS node_count,
				count(lc.id)::int AS chunk_count,
				coalesce(
					jsonb_agg(
						DISTINCT jsonb_build_object(
							'documentId', ld.id,
							'title', ld.title,
							'corpusType', ld.corpus_type,
							'officialUrl', ld.official_url,
							'jurisdiction', jsonb_build_object('code', j.code, 'name', j.name)
						)
					) FILTER (WHERE ld.id IS NOT NULL),
					'[]'::jsonb
				) AS documents
			FROM legal_nodes ln
			JOIN library_documents ld ON ld.id = ln.document_id
			LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			LEFT JOIN legal_chunks lc ON lc.legal_node_id = ln.id
			WHERE nullif(trim(ln.citation_label), '') IS NOT NULL
			  AND ld.corpus_type = ANY($1::corpus_type[])
			  AND lower(regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g')) = $2
			`,
			[LAW_CORPUS_TYPES, citationKey]
		),
		pool.query<{
			node_id: string;
			document_id: string;
			document_title: string;
			corpus_type: string | null;
			official_url: string | null;
			jurisdiction_code: string | null;
			jurisdiction_name: string | null;
			heading: string | null;
			citation_label: string;
			node_path: string | null;
			node_type: string;
			depth: number;
			page_start: number | null;
			page_end: number | null;
		}>(
			`
			SELECT
				ln.id AS node_id,
				ld.id AS document_id,
				ld.title AS document_title,
				ld.corpus_type,
				ld.official_url,
				j.code AS jurisdiction_code,
				j.name AS jurisdiction_name,
				ln.heading,
				regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g') AS citation_label,
				ln.node_path,
				ln.node_type,
				ln.depth,
				ln.page_start,
				ln.page_end
			FROM legal_nodes ln
			JOIN library_documents ld ON ld.id = ln.document_id
			LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			WHERE nullif(trim(ln.citation_label), '') IS NOT NULL
			  AND ld.corpus_type = ANY($1::corpus_type[])
			  AND lower(regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g')) = $2
			ORDER BY ld.title ASC, ln.node_path ASC
			LIMIT 200
			`,
			[LAW_CORPUS_TYPES, citationKey]
		),
		pool.query<{
			chunk_id: string;
			node_id: string;
			document_id: string;
			document_title: string;
			corpus_type: string | null;
			official_url: string | null;
			jurisdiction_code: string | null;
			jurisdiction_name: string | null;
			heading: string | null;
			citation_label: string;
			node_path: string | null;
			node_type: string;
			depth: number;
			chunk_index: number;
			chunk_text: string;
			summary: string | null;
			page_start: number | null;
			page_end: number | null;
			token_count: number | null;
		}>(
			`
			SELECT
				lc.id AS chunk_id,
				ln.id AS node_id,
				ld.id AS document_id,
				ld.title AS document_title,
				ld.corpus_type,
				ld.official_url,
				j.code AS jurisdiction_code,
				j.name AS jurisdiction_name,
				ln.heading,
				regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g') AS citation_label,
				ln.node_path,
				ln.node_type,
				ln.depth,
				lc.chunk_index,
				lc.chunk_text,
				lc.summary,
				lc.page_start,
				lc.page_end,
				lc.token_count
			FROM legal_nodes ln
			JOIN library_documents ld ON ld.id = ln.document_id
			LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			JOIN legal_chunks lc ON lc.legal_node_id = ln.id
			WHERE nullif(trim(ln.citation_label), '') IS NOT NULL
			  AND ld.corpus_type = ANY($1::corpus_type[])
			  AND lower(regexp_replace(trim(ln.citation_label), '\\s+', ' ', 'g')) = $2
			ORDER BY ld.title ASC, ln.node_path ASC, lc.chunk_index ASC
			LIMIT $3
			`,
			[LAW_CORPUS_TYPES, citationKey, limit]
		),
	]);

	const summary = summaryResult.rows[0];
	if (!summary) return null;

	const nodes: LawCitationNode[] = nodesResult.rows.map((row) => ({
		nodeId: row.node_id,
		documentId: row.document_id,
		documentTitle: row.document_title,
		corpusType: row.corpus_type,
		officialUrl: row.official_url,
		jurisdiction: row.jurisdiction_code || row.jurisdiction_name
			? { code: row.jurisdiction_code, name: row.jurisdiction_name }
			: null,
		heading: row.heading,
		citationLabel: row.citation_label,
		nodePath: row.node_path,
		nodeType: row.node_type,
		depth: Number(row.depth ?? 0),
		pageStart: row.page_start,
		pageEnd: row.page_end,
	}));

	const chunks: LawCitationChunk[] = chunksResult.rows.map((row) => ({
		chunkId: row.chunk_id,
		nodeId: row.node_id,
		documentId: row.document_id,
		documentTitle: row.document_title,
		corpusType: row.corpus_type,
		officialUrl: row.official_url,
		jurisdiction: row.jurisdiction_code || row.jurisdiction_name
			? { code: row.jurisdiction_code, name: row.jurisdiction_name }
			: null,
		heading: row.heading,
		citationLabel: row.citation_label,
		nodePath: row.node_path,
		nodeType: row.node_type,
		depth: Number(row.depth ?? 0),
		chunkIndex: Number(row.chunk_index ?? 0),
		content: row.chunk_text,
		summary: row.summary,
		pageStart: row.page_start,
		pageEnd: row.page_end,
		tokenCount: row.token_count,
	}));

	return {
		citationKey,
		citationLabel: summary.citation_label,
		documentCount: Number(summary.document_count ?? 0),
		nodeCount: Number(summary.node_count ?? 0),
		chunkCount: Number(summary.chunk_count ?? 0),
		documents: parseDocuments(summary.documents),
		nodes,
		chunks,
	};
}
