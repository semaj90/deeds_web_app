/**
 * Legal Library Ingestion Worker
 *
 * Stage-tracked pipeline: upload → extract → OCR → structure → chunk → embed → graph
 * Reuses existing legal-chunker, OCR bridge, and gRPC embedding client.
 *
 * Designed for large legal PDFs (400+ pages): California Constitution, US Code, CFR, etc.
 */

import { db, pool } from '$lib/server/db/client.js';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { libraryDocuments, type NewLibraryDocument } from '$lib/server/db/schema/library-documents.js';
import { libraryDocumentVersions } from '$lib/server/db/schema/library-document-versions.js';
import { ingestionJobs } from '$lib/server/db/schema/ingestion-jobs.js';
import { caseLibraryLinks } from '$lib/server/db/schema/case-library-links.js';
import { jurisdictions } from '$lib/server/db/schema/jurisdictions.js';
import { getSeaweedFile as getFile, putSeaweedObject as putObject } from '$lib/server/seaweed-client.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { chunkLegalDocument } from '$lib/server/indexer/legal-chunker.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { buildVectorPayload } from '$lib/server/config/vector-config.js';
import { randomUUID } from 'crypto';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
	assertLibraryIngestionLeaseV1,
	failLibraryIngestionAttemptV1,
	heartbeatLibraryIngestionLeaseV1,
} from './library-ingestion-queue-v1.js';
import { assertLibraryIngestionActiveV1, monitorLibraryIngestionLeaseV1 } from './library-ingestion-lease-monitor-v1.js';
import { libraryIngestionIdentityV1 } from './library-ingestion-identity-v1.js';
import { buildLibraryPageSpansV1, parseLibraryOcrPageSpansV1, resolveLibraryChunkPageSpanV1, verifyLibraryChunkSourceSpanV1, type LibraryPageSpanV1 } from './library-page-lineage-v1.js';
import { SourceOffsetTableV1 } from './utf16-utf8-span-bridge-v1.js';
import { LibraryIngestionTimingV1 } from './library-ingestion-timing-v1.js';
import { pipeBoundedWebStreamV1 } from '$lib/server/library/library-bounded-stream-v1.js';
import {
	isSupportedLibraryUploadMimeTypeV1,
	libraryOcrInputNameV1,
	libraryUploadExtensionV1,
	validateLibraryUploadSignatureV1,
	type LibraryUploadMimeTypeV1,
} from './library-upload-format-v1.js';

const BUCKET = process.env.MINIO_LIBRARY_BUCKET ?? 'legal-library';

/** Lock and validate the active lease in the same transaction as each canonical mutation. */
async function withLibraryIngestionLeaseV1<T>(
	jobId: string,
	leaseToken: string,
	fencingToken: string,
	work: (client: PoolClient) => Promise<T>,
): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const lease = await client.query(
			`SELECT id FROM ingestion_jobs
			 WHERE id = $1::uuid AND status = 'running' AND lease_token = $2::uuid
			   AND fencing_token = $3::bigint
			   AND lease_expires_at > now()
			 FOR UPDATE`,
			[jobId, leaseToken, fencingToken],
		);
		if (lease.rowCount !== 1) throw new Error('LIBRARY_INGESTION_LEASE_LOST');
		const result = await work(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestOptions {
	documentId: string;
	jobId: string;
	leaseToken: string;
	fencingToken: string;
	sourceHash: string | null;
}

export interface IngestResult {
	documentId: string;
	nodeCount: number;
	chunkCount: number;
	pageCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job progress helpers (lease-protected updates over the Drizzle-owned schema)
// ─────────────────────────────────────────────────────────────────────────────

async function setStage(
	jobId: string,
	leaseToken: string,
	fencingToken: string,
	stage: string,
	progress: number,
	metrics: Record<string, unknown> = {}
): Promise<void> {
	const jobResult = await pool.query(
		`WITH changed_job AS (
		 UPDATE ingestion_jobs
		 SET stage = $1::processing_status, progress = $2, metrics_json = $3, updated_at = now()
		 WHERE id = $4 AND status = 'running' AND lease_token = $5::uuid
		   AND fencing_token = $6::bigint
		   AND lease_expires_at > now() RETURNING id, document_id
		)
		UPDATE library_documents ld
		SET processing_status = $1::processing_status, updated_at = now()
		FROM changed_job cj WHERE cj.document_id = ld.id RETURNING cj.id`,
		[stage, progress, JSON.stringify(metrics), jobId, leaseToken, fencingToken]
	);
	if (jobResult.rowCount !== 1) throw new Error('LIBRARY_INGESTION_LEASE_LOST');
}

async function assertWorkerLeaseActiveV1(
	jobId: string,
	leaseToken: string,
	fencingToken: string,
	signal: AbortSignal,
): Promise<void> {
	assertLibraryIngestionActiveV1(signal);
	await assertLibraryIngestionLeaseV1(jobId, leaseToken, fencingToken);
	assertLibraryIngestionActiveV1(signal);
}


async function completeJob(jobId: string, leaseToken: string, fencingToken: string, metrics: Record<string, unknown>): Promise<void> {
	const result = await pool.query(
		`WITH completed_job AS (
		 UPDATE ingestion_jobs SET stage = 'complete', status = 'complete', progress = 100,
		 metrics_json = $1, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
		 WHERE id = $2 AND status = 'running' AND lease_token = $3::uuid
		   AND fencing_token = $4::bigint
		   AND lease_expires_at > now() RETURNING document_id
		)
		UPDATE library_documents ld SET processing_status = 'complete', updated_at = now()
		FROM completed_job cj WHERE cj.document_id = ld.id RETURNING ld.id`,
		[JSON.stringify(metrics), jobId, leaseToken, fencingToken]
	);
	if (result.rowCount !== 1) throw new Error('LIBRARY_INGESTION_LEASE_LOST');
}

// ─────────────────────────────────────────────────────────────────────────────
// Text extraction (reuse pdf-parse + OCR patterns from evidence pipeline)
// ─────────────────────────────────────────────────────────────────────────────

async function extractTextFromBuffer(
	buf: Buffer,
	mimeType: string,
	documentId: string,
): Promise<{ text: string; pageCount: number; method: string; pageSpans: LibraryPageSpanV1[] }> {
	if (!isSupportedLibraryUploadMimeTypeV1(mimeType)) throw new Error('LIBRARY_MEDIA_TYPE_UNSUPPORTED');
	if (mimeType === 'application/pdf') {
		// Try native PDF text extraction first.
		try {
			const { parsePdfBuffer } = await import('$lib/server/pdf/pdf-parser.js');
			const data = await parsePdfBuffer(buf);
			const textQuality = data.text.replace(/\s+/g, '').length;

			if (textQuality > 200) {
				return { text: data.text, pageCount: data.pageCount, method: 'native', pageSpans: buildLibraryPageSpansV1(data.pages, data.text) };
			}
			// Fall through to OCR if text quality is low.
		} catch {
			// pdf-parse failed — try OCR.
		}
	}

	// OCR fallback: attempt to use server-side OCR bridge
	try {
		const { extractTextHybrid } = await import('$lib/server/ocr/hybrid.js');
		// extractTextHybrid detects PDFs by filename extension, not MIME type.
		const result = await extractTextHybrid(buf, libraryOcrInputNameV1(documentId, mimeType as LibraryUploadMimeTypeV1));
		const pageSpans = parseLibraryOcrPageSpansV1(result.text);
		const singleRenderedPage = mimeType !== 'application/pdf' || result.method === 'native-from-pdf' || result.method === 'tesseractjs-from-pdf';
		return {
			text: result.text,
			pageCount: Math.max(1, pageSpans.at(-1)?.pageNumber ?? (singleRenderedPage ? 1 : 0)),
			method: result.method ?? 'ocr',
			pageSpans: pageSpans.length ? pageSpans : singleRenderedPage ? [{ pageNumber: 1, charStart: 0, charEnd: result.text.length }] : [],
		};
	} catch {
		// Both failed — return what we have
		return { text: '', pageCount: 1, method: 'failed', pageSpans: [] };
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Neo4j graph sync (fire-and-forget, non-fatal)
// ─────────────────────────────────────────────────────────────────────────────

async function syncToNeo4j(
	documentId: string,
	title: string,
	jurisdictionCode: string,
	nodes: Array<{ id: string; parentId: string | null; nodeType: string; heading: string; citationLabel: string | null; nodePath: string }>
): Promise<void> {
	try {
		const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
		const session = getNeo4jDriver().session();
		try {
			// Merge document node
			await session.run(
				`MERGE (d:LibraryDocument {id: $id})
				 SET d.title = $title, d.jurisdictionCode = $jurisdictionCode`,
				{ id: documentId, title, jurisdictionCode }
			);

			// Batch merge legal nodes (max 100 at a time)
			for (let i = 0; i < nodes.length; i += 100) {
				const batch = nodes.slice(i, i + 100);
				await session.run(
					`UNWIND $nodes AS n
					 MERGE (ln:LegalNode {id: n.id})
					 SET ln.nodeType = n.nodeType, ln.heading = n.heading,
					     ln.citationLabel = n.citationLabel, ln.nodePath = n.nodePath
					 WITH ln, n
					 MATCH (d:LibraryDocument {id: $docId})
					 MERGE (d)-[:HAS_NODE]->(ln)`,
					{ nodes: batch, docId: documentId }
				);

				// Wire parent-child relationships
				const withParents = batch.filter((n) => n.parentId);
				if (withParents.length > 0) {
					await session.run(
						`UNWIND $nodes AS n
						 MATCH (child:LegalNode {id: n.id}), (parent:LegalNode {id: n.parentId})
						 MERGE (child)-[:CHILD_OF]->(parent)`,
						{ nodes: withParents }
					);
				}
			}
		} finally {
			await session.close();
		}
	} catch (err) {
		// Non-fatal: Neo4j may not be running
		console.warn('[ingestion] Neo4j sync skipped:', err instanceof Error ? err.message : err);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ingestion pipeline
// ─────────────────────────────────────────────────────────────────────────────

export async function runIngestionPipeline(opts: IngestOptions): Promise<IngestResult> {
	const { documentId, jobId, leaseToken, fencingToken } = opts;
	const leaseMonitor = monitorLibraryIngestionLeaseV1(
		() => heartbeatLibraryIngestionLeaseV1(jobId, leaseToken, fencingToken),
		30_000,
	);

	try {
		await assertWorkerLeaseActiveV1(jobId, leaseToken, fencingToken, leaseMonitor.signal);
		if (!opts.sourceHash || !/^[a-f0-9]{64}$/i.test(opts.sourceHash)) {
			throw new Error('LIBRARY_JOB_SOURCE_HASH_UNQUALIFIED');
		}
		return await _runPipeline(documentId, jobId, leaseToken, fencingToken, opts.sourceHash, leaseMonitor.signal);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[ingestion] Pipeline failed for ${documentId}:`, msg);
		await failLibraryIngestionAttemptV1(jobId, leaseToken, fencingToken, msg).catch(() => 'lease_lost');
		throw err;
	} finally {
		await leaseMonitor.stop();
	}
}


async function _runPipeline(documentId: string, jobId: string, leaseToken: string, fencingToken: string, expectedSourceHash: string, signal: AbortSignal): Promise<IngestResult> {
	const timing = new LibraryIngestionTimingV1();
	const recordStage = (stage: string, progress: number, metrics: Record<string, unknown> = {}) =>
		setStage(jobId, leaseToken, fencingToken, stage, progress, { ...metrics, ingestionTimingV1: timing.snapshot() });

	// Fetch document metadata
	const docRes = await timing.measure('postgres_document_lookup', () => pool.query(
		`SELECT id, title, minio_key, corpus_type, jurisdiction_id, source_hash, mime_type FROM library_documents WHERE id = $1`,
		[documentId]
	));
	if (!docRes.rows[0]) throw new Error(`Document ${documentId} not found`);
	const doc = docRes.rows[0] as {
		id: string;
		title: string;
		minio_key: string;
		corpus_type: string;
		jurisdiction_id: number | null;
		source_hash: string | null;
		mime_type: string | null;
	};
	if (!doc.source_hash || !/^[a-f0-9]{64}$/i.test(doc.source_hash)) {
		throw new Error('LIBRARY_SOURCE_HASH_UNQUALIFIED');
	}
	if (doc.source_hash.toLowerCase() !== expectedSourceHash.toLowerCase()) {
		throw new Error('LIBRARY_JOB_SOURCE_HASH_MISMATCH');
	}

	// ── Stage A: Fetch file from SeaweedFS via the legacy storage key field ──
	await recordStage('extracting', 5);

	const fileBuffer = await timing.measure('seaweedfs_read_and_hash', async () => {
		const bytes = await getFile(BUCKET, doc.minio_key);
		libraryIngestionIdentityV1.verifySourceBytes(bytes, expectedSourceHash);
		return bytes;
	});
	// Metadata equality is not enough: validate the bytes actually returned by the
	// object store before extraction or any source-derived database writes.

	// ── Stage B: Text extraction ────────────────────────────────────────────
	await recordStage('extracting', 15);
	const mimeType = doc.mime_type ?? 'application/pdf';
	const { text: fullText, pageCount, method, pageSpans } = await timing.measure('document_extraction', () => extractTextFromBuffer(fileBuffer, mimeType, documentId));

	// ── Stage C: Legal structure detection ─────────────────────────────────
	await recordStage('structuring', 35, { pageCount, extractionMethod: method });

	const chunkingStartedAt = performance.now();
	const chunks = chunkLegalDocument(fullText, { maxTokens: 512, overlap: 64 });
	if (chunks.length === 0) {
		throw new Error('No chunks produced — document may be empty or extraction failed');
	}
	const sourceOffsetTable = new SourceOffsetTableV1(fullText);
	// Validate the complete offset set before version, node, chunk, or page-count
	// writes, so a malformed chunk cannot leave a partial derived representation.
	for (const chunk of chunks) {
		const span = sourceOffsetTable.resolveDualSpan(chunk.startOffset, chunk.endOffset);
		verifyLibraryChunkSourceSpanV1(fullText, chunk.text, span.utf16Start, span.utf16End);
	}
	timing.record('chunking_and_span_validation', performance.now() - chunkingStartedAt);
	await timing.measure('postgres_revision_writes', () => withLibraryIngestionLeaseV1(jobId, leaseToken, fencingToken, (client) =>
		client.query(`UPDATE library_documents SET page_count = $1, updated_at = now() WHERE id = $2`, [pageCount, documentId]),
	));
	const parserRevision = `legal-extract-v1:${String(method)};legal-chunker-v2:source-slice-v1:maxTokens=512:overlap=64;offsetUnit=utf16_code_units`;

	// Create a single version record
	const versionId = await libraryIngestionIdentityV1.version(documentId, doc.source_hash);
	await timing.measure('postgres_revision_writes', () => withLibraryIngestionLeaseV1(jobId, leaseToken, fencingToken, (client) => client.query(
		`INSERT INTO library_document_versions (id, document_id, source_hash, version_label, source_date, is_current)
		 VALUES ($1, $2, $3, 'v1', now(), true)
		 ON CONFLICT DO NOTHING`,
		[versionId, documentId, doc.source_hash],
	)));

	// ── Stage D: Build legal_nodes from chunk section paths ─────────────────
	await recordStage('chunking', 45);

	// Group chunks by section path to create legal node hierarchy
	const nodeMap = new Map<string, string>(); // nodePath → nodeId
	const nodeRows: Array<{
		id: string;
		parentId: string | null;
		nodeType: string;
		heading: string;
		citationLabel: string | null;
		nodePath: string;
	}> = [];

	for (const chunk of chunks) {
		if (!chunk.sectionPath?.length) continue;

		// Build ancestor nodes if they don't exist
		for (let depth = 0; depth < chunk.sectionPath.length; depth++) {
			const pathKey = chunk.sectionPath.slice(0, depth + 1).join('/').toLowerCase().replace(/\s+/g, '-');
			if (nodeMap.has(pathKey)) continue;

			const nodeId = await libraryIngestionIdentityV1.node({
				documentId,
				sourceHash: doc.source_hash,
				documentRevision: versionId,
				normalizedNodePath: pathKey,
				parserRevision,
			});
			nodeMap.set(pathKey, nodeId);

			const heading = chunk.sectionPath[depth];
			const parentPath =
				depth > 0
					? chunk.sectionPath
							.slice(0, depth)
							.join('/')
							.toLowerCase()
							.replace(/\s+/g, '-')
					: null;
			const parentId = parentPath ? (nodeMap.get(parentPath) ?? null) : null;

			// Infer node type from heading pattern
			let nodeType = 'section';
			if (/^amendment\s+[ivxlcdm\d]+/i.test(heading)) nodeType = 'amendment';
			else if (/^article/i.test(heading)) nodeType = 'article';
			else if (/^chapter/i.test(heading)) nodeType = 'chapter';
			else if (/^part|^division/i.test(heading)) nodeType = 'part';
			else if (/^title/i.test(heading)) nodeType = 'title';
			else if (/^\([a-z]\)/i.test(heading)) nodeType = 'subsection';
			else if (depth === 0) nodeType = 'article';

			nodeRows.push({ id: nodeId, parentId, nodeType, heading, citationLabel: heading, nodePath: pathKey });
		}
	}

	// If no structured nodes were found, create a root node so chunks have a parent
	if (nodeRows.length === 0) {
		const rootId = await libraryIngestionIdentityV1.node({
			documentId,
			sourceHash: doc.source_hash,
			documentRevision: versionId,
			normalizedNodePath: 'root',
			parserRevision,
		});
		nodeMap.set('root', rootId);
		nodeRows.push({
			id: rootId,
			parentId: null,
			nodeType: 'document',
			heading: doc.title,
			citationLabel: null,
			nodePath: 'root',
		});
	}

	// Insert legal_nodes
	const nodeUpsertStartedAt = performance.now();
	for (const n of nodeRows) {
		const fullNodeText = chunks
			.filter(
				(c) =>
					c.sectionPath?.length > 0 &&
					c.sectionPath
						.join('/')
						.toLowerCase()
						.replace(/\s+/g, '-')
						.startsWith(n.nodePath)
			)
			.map((c) => c.text)
			.join('\n\n')
			.slice(0, 100_000); // cap at 100KB

		await withLibraryIngestionLeaseV1(jobId, leaseToken, fencingToken, (client) => client.query(
			`INSERT INTO legal_nodes
			   (id, document_id, version_id, parent_node_id, node_type, heading,
			    citation_label, node_path, depth, full_text, text_clean)
			 VALUES ($1, $2, $3, $4, $5::legal_node_type, $6, $7, $8, $9, $10, $10)
			 ON CONFLICT DO NOTHING`,
			[
				n.id,
				documentId,
				versionId,
				n.parentId,
				n.nodeType,
				n.heading,
				n.citationLabel,
				n.nodePath,
				n.nodePath.split('/').length - 1,
				fullNodeText,
			]
		));
	}
	timing.record('postgres_node_upserts', performance.now() - nodeUpsertStartedAt);

	await recordStage('chunking', 60, { nodeCount: nodeRows.length });

	// ── Stage E: Bulk-insert chunks (single round-trip per 500-row batch) ──
	const chunkRows: Array<{ id: string; nodeId: string; text: string; chunkHash: string; index: number; parserRevision: string; tokenCount: number; startOffset: number; endOffset: number; offsetUnit: 'utf16_code_units'; pageStart: number | null; pageEnd: number | null }> = [];

	for (const chunk of chunks) {
		const pathKey = chunk.sectionPath?.length
			? chunk.sectionPath.join('/').toLowerCase().replace(/\s+/g, '-')
			: 'root';
		const nodeId = nodeMap.get(pathKey) ?? nodeRows[0]?.id;
		if (!nodeId) continue;
		const startOffset = chunk.startOffset ?? 0;
		const endOffset = chunk.endOffset ?? startOffset;
		const chunkHash = createHash('sha256').update(chunk.text, 'utf8').digest('hex');
		const pageSpan = pageSpans.length ? resolveLibraryChunkPageSpanV1(startOffset, endOffset, pageSpans) : null;
		chunkRows.push({
			id: await libraryIngestionIdentityV1.chunk({
				documentId,
				sourceHash: doc.source_hash,
				documentRevision: versionId,
				parserRevision,
				chunkHash,
				chunkIndex: chunk.chunkIndex,
				pageStart: pageSpan?.pageStart ?? null,
				pageEnd: pageSpan?.pageEnd ?? null,
				charStart: startOffset,
				charEnd: endOffset,
			}),
			nodeId, text: chunk.text, chunkHash, index: chunk.chunkIndex,
			parserRevision,
			tokenCount: chunk.tokenCount ?? 0,
			startOffset,
			endOffset,
			offsetUnit: 'utf16_code_units',
			pageStart: pageSpan?.pageStart ?? null,
			pageEnd: pageSpan?.pageEnd ?? null,
		});
	}

	// Bulk INSERT in 500-row batches — avoids N sequential round-trips
	const CHUNK_INSERT_BATCH = 500;
	const chunkUpsertStartedAt = performance.now();
	for (let i = 0; i < chunkRows.length; i += CHUNK_INSERT_BATCH) {
		const batch = chunkRows.slice(i, i + CHUNK_INSERT_BATCH);
		const values = batch.map((_, k) => {
			const base = k * 12;
			return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12})`;
		}).join(',');
		const params: unknown[] = [];
		for (const row of batch) {
			params.push(row.id, row.nodeId, row.index, row.text, row.chunkHash, row.parserRevision,
				row.tokenCount, row.startOffset, row.endOffset, row.offsetUnit, row.pageStart, row.pageEnd);
		}
		await withLibraryIngestionLeaseV1(jobId, leaseToken, fencingToken, (client) => client.query(
		`INSERT INTO legal_chunks
			   (id, legal_node_id, chunk_index, chunk_text, chunk_hash, parser_revision, token_count, char_start, char_end, char_offset_unit, page_start, page_end)
			 VALUES ${values}
			 ON CONFLICT (legal_node_id, chunk_index) DO NOTHING`,
			params
		));
	}
	timing.record('postgres_chunk_upserts', performance.now() - chunkUpsertStartedAt);

	await recordStage('embedding', 70, { chunkCount: chunkRows.length });

	// ── Stage F: Embeddings ─────────────────────────────────────────────────
	const EMBED_BATCH = 128; // GPU handles 128 at once; 32 was leaving throughput on the table
	const embedTexts = chunkRows.map((c) => c.text.slice(0, 1024));
	const qdrantPoints: Array<{ id: string; vector: number[]; chunkIdx: number }> = [];
	let embeddingProducer: {
		model: string;
		source: string;
		dimension: number;
		modelArtifactRevision: string | null;
	} | null = null;
	let embeddedChunkCount = 0;

	for (let i = 0; i < chunkRows.length; i += EMBED_BATCH) {
		await assertWorkerLeaseActiveV1(jobId, leaseToken, fencingToken, signal);
		const batch = chunkRows.slice(i, i + EMBED_BATCH);
		const textBatch = embedTexts.slice(i, i + EMBED_BATCH);

		const result = await timing.measure('embedding_provider', () => generateEmbeddings(textBatch));
		if (result.dimension !== 768 || result.vectors.length !== batch.length || result.vectors.some(
			(vector) => vector.length !== 768 || vector.some((value) => !Number.isFinite(value)),
		)) {
			throw new Error('LIBRARY_EMBEDDING_BATCH_SHAPE_OR_DIMENSION_INVALID');
		}
		const producer = {
			model: result.model,
			source: result.source,
			dimension: result.dimension,
			modelArtifactRevision: result.modelArtifactRevision ?? null,
		};
		if (embeddingProducer && JSON.stringify(embeddingProducer) !== JSON.stringify(producer)) {
			throw new Error('LIBRARY_EMBEDDING_PRODUCER_CHANGED_WITHIN_JOB');
		}
		embeddingProducer = producer;
		const embeddings = result.vectors;

		// Bulk UPDATE via unnest — one round-trip per embed batch. Stable IDs make retry safe.
		const ids = batch.map((row) => row.id);
		const vecs: string[] = [];
		for (let j = 0; j < batch.length; j++) {
			const embedding = embeddings[j];
			vecs.push(`[${embedding.join(',')}]`);
			qdrantPoints.push({ id: batch[j].id, vector: embedding, chunkIdx: i + j });
		}
		await timing.measure('pgvector_upserts', () => withLibraryIngestionLeaseV1(jobId, leaseToken, fencingToken, (client) => client.query(
			`UPDATE legal_chunks SET embedding = v.vec::vector
			 FROM unnest($1::uuid[], $2::text[]) AS v(id, vec)
			 WHERE legal_chunks.id = v.id`,
			[ids, vecs]
		)));
		embeddedChunkCount += batch.length;

		const progress = 70 + Math.floor((i / chunkRows.length) * 20);
		await recordStage('embedding', progress, {
			embeddedChunkCount,
			embeddingProducer,
			embeddingArtifactRevisionQualified: Boolean(embeddingProducer.modelArtifactRevision),
		});
	}

	// ── Stage F2b: Qdrant upsert ─────────────────────────────────────────────
	if (qdrantPoints.length > 0) {
		try {
			await assertWorkerLeaseActiveV1(jobId, leaseToken, fencingToken, signal);
			const jurisdictionRowEarly = await pool.query(
				`SELECT code FROM jurisdictions WHERE id = $1`,
				[doc.jurisdiction_id]
			);
			const jCode = jurisdictionRowEarly.rows[0]?.code ?? 'federal';

			await timing.measure('qdrant_projection_upsert', () => qdrant.batchUpsert({
				collection: 'documents',
				points: qdrantPoints.map((p) => ({
					id: p.id,
					vector: buildVectorPayload('legal_documents', p.vector),
					payload: {
						document_id: documentId,
						title: doc.title,
						chunk_text: chunkRows[p.chunkIdx]?.text ?? '',
						node_id: chunkRows[p.chunkIdx]?.nodeId ?? '',
						chunk_index: chunkRows[p.chunkIdx]?.index ?? p.chunkIdx,
						jurisdiction_code: jCode,
						corpus_type: doc.corpus_type ?? 'statute',
					},
				})),
				batchSize: 100,
			}));
		} catch (e) {
			if (e instanceof Error && e.message === 'LIBRARY_INGESTION_LEASE_LOST') throw e;
			// Non-fatal: Qdrant may be unavailable, pgvector is primary store
			console.warn('[ingestion] Qdrant upsert failed (non-fatal):', e);
		}
	}

	// ── Stage F2: Extract Legal Definitions ──────────────────────────────────
	await recordStage('embedding', 90);

	const glossaryRes = await pool.query(`SELECT term FROM legal_glossary`);
	const allTerms = glossaryRes.rows.map(r => r.term.toLowerCase());

	const definitionRows: Array<[string, string, string, string, string]> = [];
	const definitionUpsertStartedAt = performance.now();
	for (const chunk of chunkRows) {
		const textLower = chunk.text.toLowerCase();
		for (const term of allTerms) {
			// Basic whole-word match for glossary term
			const regex = new RegExp(`\\b${term}\\b(?!\\w)`, 'i');
			if (regex.test(textLower)) {
				const defId = await libraryIngestionIdentityV1.definition(chunk.nodeId, term);
				// Create an excerpt around the term
				const matchIndex = textLower.indexOf(term);
				const start = Math.max(0, matchIndex - 100);
				const end = Math.min(chunk.text.length, matchIndex + term.length + 100);
				let excerpt = chunk.text.substring(start, end);
				if (start > 0) excerpt = '...' + excerpt;
				if (end < chunk.text.length) excerpt = excerpt + '...';

				definitionRows.push([defId, term, term, chunk.nodeId, excerpt.trim()]);
			}
		}
	}

	if (definitionRows.length > 0) {
		// Bulk insert definitions
		// Max length is small enough, but let's do it in a transaction
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			const lease = await client.query(
				`SELECT id FROM ingestion_jobs
				 WHERE id = $1::uuid AND status = 'running' AND lease_token = $2::uuid
				   AND fencing_token = $3::bigint AND lease_expires_at > now() FOR UPDATE`,
				[jobId, leaseToken, fencingToken],
			);
			if (lease.rowCount !== 1) throw new Error('LIBRARY_INGESTION_LEASE_LOST');
			// Deduplicate terms per node
			const seenDef = new Set<string>();
			for (const [id, t, norm, nodeId, text] of definitionRows) {
				const key = `${t}-${nodeId}`;
				if (seenDef.has(key)) continue;
				seenDef.add(key);

				await client.query(
					`INSERT INTO legal_definitions (id, term, normalized_term, defined_in_node_id, definition_text)
					 VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
					[id, t, norm, nodeId, text]
				);
			}
			await client.query('COMMIT');
		} catch (e) {
			await client.query('ROLLBACK').catch(() => undefined);
			if (e instanceof Error && e.message === 'LIBRARY_INGESTION_LEASE_LOST') throw e;
			console.warn('Definition extraction partial failure', e);
		} finally {
			client.release();
		}
	}
	timing.record('definition_upserts', performance.now() - definitionUpsertStartedAt);

	// ── Stage G: Neo4j graph sync ─────────────────────────────────────────
	await recordStage('graphing', 92);

	const jurisdictionRow = await pool.query(
		`SELECT code FROM jurisdictions WHERE id = $1`,
		[doc.jurisdiction_id]
	);
	const jurisdictionCode = jurisdictionRow.rows[0]?.code ?? 'federal';

	await assertWorkerLeaseActiveV1(jobId, leaseToken, fencingToken, signal);
	await timing.measure('neo4j_projection', () => syncToNeo4j(documentId, doc.title, jurisdictionCode, nodeRows));

	// ── Complete ─────────────────────────────────────────────────────────────
	await assertWorkerLeaseActiveV1(jobId, leaseToken, fencingToken, signal);
	await completeJob(jobId, leaseToken, fencingToken, {
		pageCount,
		nodeCount: nodeRows.length,
		chunkCount: chunkRows.length,
		extractionMethod: method,
		embeddedChunkCount,
		embeddingProducer,
		embeddingArtifactRevisionQualified: Boolean(embeddingProducer?.modelArtifactRevision),
		ingestionTimingV1: timing.snapshot(),
	});

	return {
		documentId,
		nodeCount: nodeRows.length,
		chunkCount: chunkRows.length,
		pageCount,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload helper: store raw PDF in SeaweedFS, create DB records
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadLibraryDocument(opts: {
  fileBuffer: Buffer;
  fileName: string;
  title: string;
  corpusType: string;
  jurisdictionCode: string;
  officialUrl?: string;
  effectiveDate?: string;
  userId: string;
  caseId?: string;
}): Promise<{
  documentId: string;
  jobId: string | null;
  alreadyExists?: boolean;
  processingStatus?: string | null;
}> {
  const documentId = randomUUID();
  const jobId = randomUUID();
  const actorId = Number(opts.userId);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new Error('LIBRARY_UPLOADER_ID_INVALID');

  // The immutable source hash binds the object key, version, and ingestion job.
  const sourceHash = createHash('sha256').update(opts.fileBuffer).digest('hex');
  const objectStorageKey = `uploads/raw/sha256/${sourceHash}.pdf`;

  // Upload to SeaweedFS through the S3-compatible storage client.
  await putObject(BUCKET, objectStorageKey, opts.fileBuffer, opts.fileBuffer.length, {
    'Content-Type': 'application/pdf',
    'x-original-filename': opts.fileName,
  });

  const versionId = await libraryIngestionIdentityV1.version(documentId, sourceHash);

  // Document, source revision, case link, and durable work item commit together.
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${sourceHash}, 0))`);
    const [duplicate] = await tx
      .select({
        documentId: libraryDocuments.id,
        processingStatus: libraryDocuments.processingStatus,
        jobId: ingestionJobs.id,
      })
      .from(libraryDocuments)
      .leftJoin(ingestionJobs, eq(ingestionJobs.documentId, libraryDocuments.id))
      // Never deduplicate a private upload against another actor's document.
      .where(and(
        eq(libraryDocuments.sourceHash, sourceHash),
        or(isNull(libraryDocuments.uploadedBy), eq(libraryDocuments.uploadedBy, actorId)),
      ))
      .orderBy(desc(ingestionJobs.createdAt))
      .limit(1);

    if (duplicate) {
      if (opts.caseId) {
        const [linked] = await tx.select({ id: caseLibraryLinks.id })
          .from(caseLibraryLinks)
          .where(sql`${caseLibraryLinks.caseId} = ${opts.caseId}::uuid AND ${caseLibraryLinks.documentId} = ${duplicate.documentId}`)
          .limit(1);
        if (!linked) await tx.insert(caseLibraryLinks).values({ caseId: opts.caseId, documentId: duplicate.documentId });
      }
      return {
        documentId: duplicate.documentId,
        jobId: duplicate.jobId ?? null,
        alreadyExists: true,
        processingStatus: duplicate.processingStatus ?? null,
      };
    }

    const [jurisdiction] = await tx.select({ id: jurisdictions.id })
      .from(jurisdictions)
      .where(eq(jurisdictions.code, opts.jurisdictionCode))
      .limit(1);

    await tx.insert(libraryDocuments).values({
      id: documentId,
      sourceType: 'upload',
      corpusType: (opts.corpusType || 'other') as NonNullable<NewLibraryDocument['corpusType']>,
      jurisdictionId: jurisdiction?.id ?? null,
      title: opts.title,
      officialUrl: opts.officialUrl ?? null,
      sourceHash,
      mimeType: 'application/pdf',
      minioKey: objectStorageKey,
      effectiveDate: opts.effectiveDate ? new Date(opts.effectiveDate) : null,
      processingStatus: 'queued',
      uploadedBy: actorId,
    });

    await tx.insert(libraryDocumentVersions).values({
      id: versionId,
      documentId,
      sourceHash,
      versionLabel: 'v1',
      sourceDate: new Date(),
      isCurrent: true,
    });

    await tx.insert(ingestionJobs).values({
      id: jobId,
      documentId,
      sourceHash,
      stage: 'queued',
      status: 'queued',
      attemptCount: 0,
      maxAttempts: 3,
    });

    if (opts.caseId) await tx.insert(caseLibraryLinks).values({ caseId: opts.caseId, documentId });
    return { documentId, jobId, alreadyExists: false, processingStatus: 'queued' };
  });
}

/**
 * Raw PDF/image admission path. It streams the request body through a bounded hash
 * transform into SeaweedFS, then commits the matching source/job rows together.
 */
export async function uploadLibraryDocumentStreamV1(opts: {
	body: ReadableStream<Uint8Array>;
	byteLength: number;
	maxBytes?: number;
	mimeType: LibraryUploadMimeTypeV1;
	fileName: string;
	title: string;
	corpusType: string;
	jurisdictionCode: string;
	officialUrl?: string;
	effectiveDate?: string;
	userId: string;
	caseId?: string;
}): Promise<{ documentId: string; jobId: string | null; sourceHash: string; byteLength: number; alreadyExists: boolean; processingStatus: string | null }> {
	const maxBytes = opts.maxBytes ?? 200 * 1024 * 1024;
	if (!Number.isSafeInteger(opts.byteLength) || opts.byteLength <= 0 || opts.byteLength > maxBytes) {
		throw new Error('LIBRARY_UPLOAD_LENGTH_OUT_OF_RANGE');
	}
	if (!isSupportedLibraryUploadMimeTypeV1(opts.mimeType)) throw new Error('LIBRARY_MEDIA_TYPE_UNSUPPORTED');
	const mimeType = opts.mimeType.toLowerCase() as LibraryUploadMimeTypeV1;
	const actorId = Number(opts.userId);
	if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new Error('LIBRARY_UPLOADER_ID_INVALID');

	const documentId = randomUUID();
	const jobId = randomUUID();
	const objectStorageKey = `uploads/raw/library/${documentId}${libraryUploadExtensionV1(mimeType)}`;
	const signaturePrefixBytes = mimeType === 'image/webp' ? 12 : mimeType === 'image/png' ? 8 : mimeType === 'image/jpeg' ? 3 : 5;
	let objectStored = false;
	let sourceHash = '';
	let observedBytes = 0;
	try {
		const streamReceipt = await pipeBoundedWebStreamV1({
			body: opts.body,
			expectedByteLength: opts.byteLength,
			maxBytes,
			signaturePrefixBytes,
			validateSignaturePrefix: (prefix) => validateLibraryUploadSignatureV1(mimeType, prefix),
			sink: async (stream) => {
				await putObject(BUCKET, objectStorageKey, stream, opts.byteLength, {
					'Content-Type': mimeType,
					'x-original-filename': opts.fileName.slice(0, 255),
				});
				objectStored = true;
			},
		});
		sourceHash = streamReceipt.sourceHash;
		observedBytes = streamReceipt.byteLength;
	} catch (cause) {
		// A failed or length-mismatched S3 stream can leave an object behind. Preserve
		// its unique key in the reconciliation log; archive policy forbids silent delete.
		const streamError = cause as Error & { byteLength?: number; partialSha256?: string };
		console.error('[library-upload-orphaned-object]', JSON.stringify({
			objectStorageKey,
			documentId,
			observedBytes: streamError.byteLength ?? observedBytes,
			expectedBytes: opts.byteLength,
			objectStored,
			partialSha256: streamError.partialSha256 ?? null,
		}));
		throw cause;
	}
	const numericActorId = actorId;

	try {
		const result = await db.transaction(async (tx) => {
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${sourceHash}, 0))`);
			const [duplicate] = await tx.select({
				documentId: libraryDocuments.id,
				processingStatus: libraryDocuments.processingStatus,
				jobId: ingestionJobs.id,
				uploadedBy: libraryDocuments.uploadedBy,
				mimeType: libraryDocuments.mimeType,
			})
				.from(libraryDocuments)
				.leftJoin(ingestionJobs, eq(ingestionJobs.documentId, libraryDocuments.id))
				.where(eq(libraryDocuments.sourceHash, sourceHash))
				.orderBy(desc(ingestionJobs.createdAt))
				.limit(1);

			if (duplicate) {
				if (duplicate.mimeType !== mimeType || (duplicate.uploadedBy !== null && duplicate.uploadedBy !== numericActorId)) {
					throw new Error('LIBRARY_SOURCE_HASH_CONFLICT');
				}
				if (opts.caseId) {
					const [linked] = await tx.select({ id: caseLibraryLinks.id }).from(caseLibraryLinks)
						.where(sql`${caseLibraryLinks.caseId} = ${opts.caseId}::uuid AND ${caseLibraryLinks.documentId} = ${duplicate.documentId}`)
						.limit(1);
					if (!linked) await tx.insert(caseLibraryLinks).values({ caseId: opts.caseId, documentId: duplicate.documentId });
				}
				return {
					documentId: duplicate.documentId,
					jobId: duplicate.jobId ?? null,
					sourceHash,
					byteLength: observedBytes,
					alreadyExists: true,
					processingStatus: duplicate.processingStatus ?? null,
				};
			}

			const [jurisdiction] = await tx.select({ id: jurisdictions.id })
				.from(jurisdictions).where(eq(jurisdictions.code, opts.jurisdictionCode)).limit(1);
			await tx.insert(libraryDocuments).values({
				id: documentId,
				sourceType: 'upload',
				corpusType: (opts.corpusType || 'other') as NonNullable<NewLibraryDocument['corpusType']>,
				jurisdictionId: jurisdiction?.id ?? null,
				title: opts.title,
				officialUrl: opts.officialUrl ?? null,
				sourceHash,
				mimeType,
				sourceKind: mimeType === 'application/pdf' ? 'uploaded_pdf' : 'uploaded_image',
				minioKey: objectStorageKey,
				effectiveDate: opts.effectiveDate ? new Date(opts.effectiveDate) : null,
				processingStatus: 'queued',
				uploadedBy: numericActorId,
			});
			const versionId = await libraryIngestionIdentityV1.version(documentId, sourceHash);
			await tx.insert(libraryDocumentVersions).values({
				id: versionId, documentId, sourceHash, versionLabel: 'v1', sourceDate: new Date(), isCurrent: true,
			});
			await tx.insert(ingestionJobs).values({
				id: jobId, documentId, sourceHash, stage: 'queued', status: 'queued', attemptCount: 0, maxAttempts: 3,
			});
			if (opts.caseId) await tx.insert(caseLibraryLinks).values({ caseId: opts.caseId, documentId });
			return { documentId, jobId, sourceHash, byteLength: observedBytes, alreadyExists: false, processingStatus: 'queued' };
		});
		if (result.alreadyExists) {
			console.warn('[library-upload-duplicate-object]', JSON.stringify({ objectStorageKey, sourceHash, documentId, canonicalDocumentId: result.documentId }));
		}
		return result;
	} catch (cause) {
		// Keep the stored source for review/reconciliation; do not silently delete an orphan.
		console.error('[library-upload-orphaned-object]', JSON.stringify({ objectStorageKey, sourceHash, documentId }));
		throw cause;
	}
}

/** Enqueue a new revision-bound attempt for an existing document; workers own execution. */
export async function enqueueLibraryDocumentReingestionV1(documentId: string): Promise<{
	jobId: string;
	sourceHash: string;
	alreadyQueued: boolean;
} | null> {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId)) {
		throw new Error('LIBRARY_DOCUMENT_ID_INVALID');
	}

	return db.transaction(async (tx) => {
		const [document] = await tx.select({ sourceHash: libraryDocuments.sourceHash })
			.from(libraryDocuments)
			.where(eq(libraryDocuments.id, documentId))
			.for('update');
		if (!document) return null;
		if (!document.sourceHash || !/^[a-f0-9]{64}$/i.test(document.sourceHash)) {
			throw new Error('LIBRARY_DOCUMENT_SOURCE_HASH_UNQUALIFIED');
		}

		const [active] = await tx.select({ id: ingestionJobs.id })
			.from(ingestionJobs)
			.where(and(
				eq(ingestionJobs.documentId, documentId),
				eq(ingestionJobs.sourceHash, document.sourceHash),
				inArray(ingestionJobs.status, ['queued', 'running']),
			))
			.orderBy(desc(ingestionJobs.createdAt))
			.limit(1);
		if (active) return { jobId: active.id, sourceHash: document.sourceHash, alreadyQueued: true };

		const jobId = randomUUID();
		await tx.insert(ingestionJobs).values({
			id: jobId,
			documentId,
			sourceHash: document.sourceHash,
			stage: 'queued',
			status: 'queued',
			attemptCount: 0,
			maxAttempts: 3,
		});
		await tx.update(libraryDocuments)
			.set({ processingStatus: 'queued', updatedAt: new Date() })
			.where(eq(libraryDocuments.id, documentId));
		return { jobId, sourceHash: document.sourceHash, alreadyQueued: false };
	});
}
