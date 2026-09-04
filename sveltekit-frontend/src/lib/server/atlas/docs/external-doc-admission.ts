/**
 * DOC-06A (EXTERNAL_DOC_POSTGRES_ADMISSION_01) -- the missing join between the
 * Python BeautifulSoup/Pydantic pipeline (atlas_okf_docs_pipeline.py,
 * atlas_external_docs.py) and the canonical Postgres tables DOC-06 built
 * (atlas_external_doc_pages / atlas_external_doc_chunks).
 *
 * Order this lane follows: crawl -> canonical Postgres admission -> (later)
 * semantic/NLP enrichment -> Qdrant/Neo4j/cache projections. The Python
 * crawler does not write Qdrant/Postgres directly for this lane -- this
 * adapter is the sole promotion boundary.
 *
 * Follows this repo's established raw-pg.Pool-injected, parameterized-query
 * pattern (matching pagerank-promotion-gate.ts's
 * `constructor(private db: Pool)` style) rather than Drizzle ORM, since
 * atlas_external_doc_pages/atlas_external_doc_chunks are manual-SQL tables
 * (drizzle/manual/20260904_external_doc_intelligence_v1.sql +
 * 20260904b_external_doc_chunks_byte_spans_v1.sql), not yet declared in
 * schema-postgres.ts.
 */

import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export type ExternalDocSourceAuthorityV1 = 'OFFICIAL' | 'COMMUNITY' | 'THIRD_PARTY';

export interface ExternalDocPageAdmissionInputV1 {
	provider: string;
	product: string;
	productVersion: string;
	architecture: string | null;
	language: string | null;
	url: string;
	title: string;
	publisher: string | null;
	sourceAuthority: ExternalDocSourceAuthorityV1;
	fetcher: string;
	crawlRevision: string;
	parserRevision: string;
	contentHash: string;
	evidenceRevision: string;
	retrievedAt: string;
}

export interface ExternalDocChunkCodeBlockV1 {
	language: string | null;
	code: string;
}

export interface ExternalDocChunkAdmissionInputV1 {
	chunkId: string;
	ordinal: number;
	headingPath: string[];
	sectionAnchor: string | null;
	startChar: number;
	endChar: number;
	startByte: number;
	endByte: number;
	text: string;
	domainClass: string;
	ontologyClasses: string[];
	codeBlocks: ExternalDocChunkCodeBlockV1[];
	apiSignatures: string[];
	domainTags?: string[];
	symbols?: string[];
	conceptIds?: string[];
	chunkChecksum: string;
	evidenceRevision: string;
}

export interface ExternalDocAdmissionInputV1 {
	manifestRevision: string;
	sourceRevision: string;
	page: ExternalDocPageAdmissionInputV1;
	chunks: ExternalDocChunkAdmissionInputV1[];
}

export interface ExternalDocAdmissionReceiptV1 {
	schema: 'atlas.external-doc-admission-receipt.v1';
	manifestRevision: string;
	sourceRevision: string;
	pageEvidenceRevision: string;
	pageId: string;
	chunkIds: string[];
	pageCount: number;
	chunkCount: number;
	expectedChecksums: string[];
	readbackChecksums: string[];
	versionQualified: boolean;
	architectureQualified: boolean;
	transactionCommitted: boolean;
	writesPerformed: boolean;
}

function sha256Hex(text: string): string {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Admit one page + its chunks transactionally: recompute checksums
 * server-side (never trust the caller), write page + chunk rows, read them
 * back from the table (not the INSERT's own RETURNING alone), verify counts
 * and checksums match before COMMIT, roll back and rethrow on any mismatch.
 */
export async function admitExternalDocPage(
	pool: Pool,
	input: ExternalDocAdmissionInputV1
): Promise<ExternalDocAdmissionReceiptV1> {
	if (!input.page.evidenceRevision) {
		throw new Error('ADMISSION_MISSING_PAGE_EVIDENCE_REVISION');
	}
	if (input.chunks.length === 0) {
		throw new Error('ADMISSION_REQUIRES_AT_LEAST_ONE_CHUNK');
	}

	// Defense in depth: recompute every chunk's checksum from its own text
	// rather than trusting whatever the caller (the Python pipeline, or any
	// future caller) claims chunkChecksum to be. This is the canonical
	// evidence-authority boundary -- atlas_okf_docs_pipeline.py's own
	// docstring: "every artifact produced here is derived/non-canonical until
	// exact source/evidence promotion in the host."
	const expectedChecksums = input.chunks.map((chunk) => sha256Hex(chunk.text));
	for (let index = 0; index < input.chunks.length; index += 1) {
		if (expectedChecksums[index] !== input.chunks[index].chunkChecksum) {
			throw new Error(`ADMISSION_CHUNK_CHECKSUM_MISMATCH:${input.chunks[index].chunkId}`);
		}
	}
	const seenChunkIds = new Set<string>();
	for (const chunk of input.chunks) {
		if (seenChunkIds.has(chunk.chunkId)) {
			throw new Error(`ADMISSION_DUPLICATE_CHUNK_ID_IN_INPUT:${chunk.chunkId}`);
		}
		seenChunkIds.add(chunk.chunkId);
	}

	const client: PoolClient = await pool.connect();
	try {
		await client.query('BEGIN');

		const pageResult = await client.query(
			`INSERT INTO atlas_external_doc_pages
			   (provider, product, product_version, architecture, language, url, title,
			    publisher, source_authority, fetcher, crawl_revision, parser_revision,
			    content_hash, evidence_revision, retrieved_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
			 ON CONFLICT (evidence_revision) DO UPDATE SET retrieved_at = EXCLUDED.retrieved_at
			 RETURNING id`,
			[
				input.page.provider,
				input.page.product,
				input.page.productVersion,
				input.page.architecture,
				input.page.language,
				input.page.url,
				input.page.title,
				input.page.publisher,
				input.page.sourceAuthority,
				input.page.fetcher,
				input.page.crawlRevision,
				input.page.parserRevision,
				input.page.contentHash,
				input.page.evidenceRevision,
				input.page.retrievedAt
			]
		);
		const pageId = pageResult.rows[0].id as string;

		for (const chunk of input.chunks) {
			await client.query(
				`INSERT INTO atlas_external_doc_chunks
				   (page_id, chunk_id, ordinal, heading_path, section_anchor, start_char, end_char,
				    start_byte, end_byte, text, domain_class, ontology_classes, code_blocks,
				    api_signatures, domain_tags, symbols, concept_ids, chunk_checksum, evidence_revision)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
				 ON CONFLICT (evidence_revision) DO UPDATE SET chunk_checksum = EXCLUDED.chunk_checksum`,
				[
					pageId,
					chunk.chunkId,
					chunk.ordinal,
					chunk.headingPath,
					chunk.sectionAnchor,
					chunk.startChar,
					chunk.endChar,
					chunk.startByte,
					chunk.endByte,
					chunk.text,
					chunk.domainClass,
					chunk.ontologyClasses,
					JSON.stringify(chunk.codeBlocks),
					chunk.apiSignatures,
					chunk.domainTags ?? [],
					chunk.symbols ?? [],
					chunk.conceptIds ?? [],
					chunk.chunkChecksum,
					chunk.evidenceRevision
				]
			);
		}

		// Readback verification: re-SELECT from the table, not the INSERTs'
		// own RETURNING clauses, so this proves the transaction actually
		// persisted what was intended before COMMIT runs.
		const verifyResult = await client.query(
			`SELECT chunk_id, chunk_checksum FROM atlas_external_doc_chunks
			 WHERE page_id = $1 ORDER BY ordinal`,
			[pageId]
		);
		if (verifyResult.rows.length !== input.chunks.length) {
			throw new Error(
				`ADMISSION_READBACK_COUNT_MISMATCH:expected=${input.chunks.length}:actual=${verifyResult.rows.length}`
			);
		}
		const orderedExpected = [...input.chunks]
			.sort((a, b) => a.ordinal - b.ordinal)
			.map((chunk) => chunk.chunkChecksum);
		const readbackChecksums: string[] = verifyResult.rows.map((row) => row.chunk_checksum as string);
		for (let index = 0; index < readbackChecksums.length; index += 1) {
			if (readbackChecksums[index] !== orderedExpected[index]) {
				throw new Error(`ADMISSION_READBACK_CHECKSUM_MISMATCH:${verifyResult.rows[index].chunk_id}`);
			}
		}

		await client.query('COMMIT');

		return {
			schema: 'atlas.external-doc-admission-receipt.v1',
			manifestRevision: input.manifestRevision,
			sourceRevision: input.sourceRevision,
			pageEvidenceRevision: input.page.evidenceRevision,
			pageId,
			chunkIds: verifyResult.rows.map((row) => row.chunk_id as string),
			pageCount: 1,
			chunkCount: readbackChecksums.length,
			expectedChecksums,
			readbackChecksums,
			versionQualified: input.page.productVersion.length > 0,
			architectureQualified: input.page.architecture !== null,
			transactionCommitted: true,
			writesPerformed: true
		};
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

export type RetrieveExternalDocsStatusV1 = 'FOUND' | 'VERSION_NOT_INDEXED';

export interface RetrieveExternalDocsQueryV1 {
	provider: string;
	product: string;
	productVersion: string;
	architecture?: string | null;
}

export interface RetrieveExternalDocsPageV1 {
	id: string;
	url: string;
	title: string;
	evidenceRevision: string;
}

export type RetrieveExternalDocsResultV1 =
	| { status: 'FOUND'; pages: RetrieveExternalDocsPageV1[] }
	| { status: 'VERSION_NOT_INDEXED'; requestedVersion: string; availableVersions: string[] };

/**
 * DOC-27 read-side: fail-closed version lookup. A query for
 * {product, productVersion} that has zero indexed rows returns
 * VERSION_NOT_INDEXED -- it never silently substitutes a different indexed
 * version's pages. availableVersions is reported so a caller can decide what
 * to do next, but those rows are never returned as if they answered the
 * requested version.
 */
export async function retrieveExternalDocs(
	pool: Pool,
	query: RetrieveExternalDocsQueryV1
): Promise<RetrieveExternalDocsResultV1> {
	const params: unknown[] = [query.provider, query.product, query.productVersion];
	let sql = `SELECT id, url, title, evidence_revision FROM atlas_external_doc_pages
	           WHERE provider = $1 AND product = $2 AND product_version = $3`;
	if (query.architecture) {
		params.push(query.architecture);
		sql += ` AND architecture = $${params.length}`;
	}
	const result = await pool.query(sql, params);
	if (result.rows.length > 0) {
		return {
			status: 'FOUND',
			pages: result.rows.map((row) => ({
				id: row.id as string,
				url: row.url as string,
				title: row.title as string,
				evidenceRevision: row.evidence_revision as string
			}))
		};
	}
	const availableResult = await pool.query(
		`SELECT DISTINCT product_version FROM atlas_external_doc_pages
		 WHERE provider = $1 AND product = $2 ORDER BY product_version`,
		[query.provider, query.product]
	);
	return {
		status: 'VERSION_NOT_INDEXED',
		requestedVersion: query.productVersion,
		availableVersions: availableResult.rows.map((row) => row.product_version as string)
	};
}
