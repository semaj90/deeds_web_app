/**
 * Legal Library Ingestion Worker
 *
 * Stage-tracked pipeline: upload → extract → OCR → structure → chunk → embed → graph
 * Reuses existing legal-chunker, OCR bridge, and gRPC embedding client.
 *
 * Designed for large legal PDFs (400+ pages): California Constitution, US Code, CFR, etc.
 */

import { pool } from '$lib/server/db/client';
import { getFile, ensureBucket, putObject } from '$lib/server/minio-client.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { chunkLegalDocument } from '$lib/server/indexer/legal-chunker.js';
import { randomUUID } from 'crypto';

const BUCKET = process.env.MINIO_LIBRARY_BUCKET ?? 'legal-library';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestOptions {
	documentId: string;
	jobId: string;
}

export interface IngestResult {
	documentId: string;
	nodeCount: number;
	chunkCount: number;
	pageCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job progress helpers (raw SQL — tables not in Drizzle schema yet)
// ─────────────────────────────────────────────────────────────────────────────

async function setStage(
	jobId: string,
	stage: string,
	progress: number,
	metrics: Record<string, unknown> = {}
): Promise<void> {
	await pool.query(
		`UPDATE ingestion_jobs
		 SET stage = $1::processing_status, progress = $2, metrics_json = $3, updated_at = now()
		 WHERE id = $4`,
		[stage, progress, JSON.stringify(metrics), jobId]
	);
	// Also update the parent document status
	await pool.query(
		`UPDATE library_documents ld
		 SET processing_status = $1::processing_status, updated_at = now()
		 FROM ingestion_jobs ij
		 WHERE ij.id = $2 AND ij.document_id = ld.id`,
		[stage, jobId]
	);
}


async function completeJob(jobId: string, metrics: Record<string, unknown>): Promise<void> {
	await pool.query(
		`UPDATE ingestion_jobs SET stage = 'complete', status = 'complete', progress = 100,
		 metrics_json = $1, updated_at = now() WHERE id = $2`,
		[JSON.stringify(metrics), jobId]
	);
	await pool.query(
		`UPDATE library_documents ld SET processing_status = 'complete', updated_at = now()
		 FROM ingestion_jobs ij WHERE ij.id = $1 AND ij.document_id = ld.id`,
		[jobId]
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Text extraction (reuse pdf-parse + OCR patterns from evidence pipeline)
// ─────────────────────────────────────────────────────────────────────────────

async function extractTextFromBuffer(buf: Buffer): Promise<{ text: string; pageCount: number; method: string }> {
	// Try native PDF text extraction first
	try {
		const pdfParse = (await import('pdf-parse')).default;
		const data = await pdfParse(buf, { max: 0 });
		const textQuality = data.text.replace(/\s+/g, '').length;

		if (textQuality > 200) {
			return { text: data.text, pageCount: data.numpages, method: 'native' };
		}
		// Fall through to OCR if text quality is low
	} catch {
		// pdf-parse failed — try OCR
	}

	// OCR fallback: attempt to use server-side OCR bridge
	try {
		const { extractTextHybrid } = await import('$lib/server/ocr/hybrid.js');
		const result = await extractTextHybrid(buf, 'application/pdf');
		return { text: result.text, pageCount: 1, method: result.method ?? 'ocr' };
	} catch {
		// Both failed — return what we have
		return { text: '', pageCount: 1, method: 'failed' };
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
	const { documentId, jobId } = opts;

	try {
		return await _runPipeline(documentId, jobId);
	} catch (err) {
		// Mark job as failed so it doesn't stay stuck at the last stage
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[ingestion] Pipeline failed for ${documentId}:`, msg);
		await pool.query(
			`UPDATE ingestion_jobs SET stage = 'failed', status = 'failed', progress = 0,
			 metrics_json = $1, updated_at = now() WHERE id = $2`,
			[JSON.stringify({ error: msg }), jobId]
		).catch(() => {});
		await pool.query(
			`UPDATE library_documents SET processing_status = 'failed', updated_at = now() WHERE id = $1`,
			[documentId]
		).catch(() => {});
		throw err;
	}
}

async function _runPipeline(documentId: string, jobId: string): Promise<IngestResult> {
	// Fetch document metadata
	const docRes = await pool.query(
		`SELECT id, title, minio_key, corpus_type, jurisdiction_id FROM library_documents WHERE id = $1`,
		[documentId]
	);
	if (!docRes.rows[0]) throw new Error(`Document ${documentId} not found`);
	const doc = docRes.rows[0] as {
		id: string;
		title: string;
		minio_key: string;
		corpus_type: string;
		jurisdiction_id: number | null;
	};

	// ── Stage A: Fetch file from MinIO ──────────────────────────────────────
	await setStage(jobId, 'extracting', 5);

	const fileBuffer = await getFile(BUCKET, doc.minio_key);

	await pool.query(
		`UPDATE library_documents SET page_count = NULL WHERE id = $1`,
		[documentId]
	);

	// ── Stage B: Text extraction ────────────────────────────────────────────
	await setStage(jobId, 'extracting', 15);
	const { text: fullText, pageCount, method } = await extractTextFromBuffer(fileBuffer);

	await pool.query(
		`UPDATE library_documents SET page_count = $1, updated_at = now() WHERE id = $2`,
		[pageCount, documentId]
	);

	// ── Stage C: Legal structure detection ─────────────────────────────────
	await setStage(jobId, 'structuring', 35, { pageCount, extractionMethod: method });

	const chunks = chunkLegalDocument(fullText, { maxTokens: 512, overlap: 64 });
	if (chunks.length === 0) {
		throw new Error('No chunks produced — document may be empty or extraction failed');
	}

	// Create a single version record
	const versionId = randomUUID();
	await pool.query(
		`INSERT INTO library_document_versions (id, document_id, version_label, source_date, is_current)
		 VALUES ($1, $2, 'v1', now(), true)
		 ON CONFLICT DO NOTHING`,
		[versionId, documentId]
	);

	// ── Stage D: Build legal_nodes from chunk section paths ─────────────────
	await setStage(jobId, 'chunking', 45);

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

			const nodeId = randomUUID();
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
		const rootId = randomUUID();
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

		await pool.query(
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
		);
	}

	await setStage(jobId, 'chunking', 60, { nodeCount: nodeRows.length });

	// ── Stage E: Insert chunks ───────────────────────────────────────────────
	const chunkRows: Array<{ id: string; nodeId: string; text: string; index: number }> = [];

	for (const chunk of chunks) {
		const pathKey = chunk.sectionPath?.length
			? chunk.sectionPath.join('/').toLowerCase().replace(/\s+/g, '-')
			: 'root';
		const nodeId = nodeMap.get(pathKey) ?? nodeRows[0]?.id;
		if (!nodeId) continue;

		const chunkId = randomUUID();
		chunkRows.push({ id: chunkId, nodeId, text: chunk.text, index: chunk.chunkIndex });

		await pool.query(
			`INSERT INTO legal_chunks
			   (id, legal_node_id, chunk_index, chunk_text, token_count, char_start, char_end)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 ON CONFLICT (legal_node_id, chunk_index) DO NOTHING`,
			[chunkId, nodeId, chunk.chunkIndex, chunk.text, chunk.tokenCount ?? 0, chunk.startOffset, chunk.endOffset]
		);
	}

	await setStage(jobId, 'embedding', 70, { chunkCount: chunkRows.length });

	// ── Stage F: Embeddings ─────────────────────────────────────────────────
	const EMBED_BATCH = 32;
	const embedTexts = chunkRows.map((c) => c.text.slice(0, 1024));

	for (let i = 0; i < chunkRows.length; i += EMBED_BATCH) {
		const batch = chunkRows.slice(i, i + EMBED_BATCH);
		const textBatch = embedTexts.slice(i, i + EMBED_BATCH);

		let embeddings: number[][] | null = null;
		try {
			const result = await generateEmbeddings(textBatch);
			embeddings = result.vectors;
		} catch {
			// Non-fatal: store chunks without embeddings, can backfill
		}

		if (embeddings) {
			for (let j = 0; j < batch.length; j++) {
				const embedding = embeddings[j];
				if (!embedding) continue;
				await pool.query(
					`UPDATE legal_chunks SET embedding = $1 WHERE id = $2`,
					[`[${embedding.join(',')}]`, batch[j].id]
				);
			}
		}

		const progress = 70 + Math.floor((i / chunkRows.length) * 20);
		await setStage(jobId, 'embedding', progress);
	}

	// ── Stage F2: Extract Legal Definitions ──────────────────────────────────
	await setStage(jobId, 'embedding', 90);

	const glossaryRes = await pool.query(`SELECT term FROM legal_glossary`);
	const allTerms = glossaryRes.rows.map(r => r.term.toLowerCase());

	const definitionRows: Array<[string, string, string, string, string]> = [];
	for (const chunk of chunkRows) {
		const textLower = chunk.text.toLowerCase();
		for (const term of allTerms) {
			// Basic whole-word match for glossary term
			const regex = new RegExp(`\\b${term}\\b(?!\\w)`, 'i');
			if (regex.test(textLower)) {
				const defId = randomUUID();
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
			await client.query('ROLLBACK');
			console.warn('Definition extraction partial failure', e);
		} finally {
			client.release();
		}
	}

	// ── Stage G: Neo4j graph sync ─────────────────────────────────────────
	await setStage(jobId, 'graphing', 92);

	const jurisdictionRow = await pool.query(
		`SELECT code FROM jurisdictions WHERE id = $1`,
		[doc.jurisdiction_id]
	);
	const jurisdictionCode = jurisdictionRow.rows[0]?.code ?? 'federal';

	await syncToNeo4j(documentId, doc.title, jurisdictionCode, nodeRows);

	// ── Complete ─────────────────────────────────────────────────────────────
	await completeJob(jobId, {
		pageCount,
		nodeCount: nodeRows.length,
		chunkCount: chunkRows.length,
		extractionMethod: method,
	});

	return {
		documentId,
		nodeCount: nodeRows.length,
		chunkCount: chunkRows.length,
		pageCount,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload helper: store raw PDF in MinIO, create DB records
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
}): Promise<{
  documentId: string;
  jobId: string | null;
  alreadyExists?: boolean;
  processingStatus?: string | null;
}> {
  const documentId = randomUUID();
  const jobId = randomUUID();
  const minioKey = `uploads/raw/${documentId}.pdf`;

  // Compute SHA-256 before storage so duplicate uploads can be treated as idempotent.
  const { createHash } = await import('crypto');
  const sourceHash = createHash('sha256').update(opts.fileBuffer).digest('hex');

  const existingRes = await pool.query(
    `SELECT ld.id, ld.processing_status, latest_job.id AS job_id
		 FROM library_documents ld
		 LEFT JOIN LATERAL (
		 	SELECT id
		 	FROM ingestion_jobs
		 	WHERE document_id = ld.id
		 	ORDER BY created_at DESC NULLS LAST, id DESC
		 	LIMIT 1
		 ) latest_job ON true
		 WHERE ld.source_hash = $1
		 LIMIT 1`,
    [sourceHash]
  );

  if (existingRes.rowCount && existingRes.rows[0]) {
    return {
      documentId: existingRes.rows[0].id as string,
      jobId: (existingRes.rows[0].job_id as string | null) ?? null,
      alreadyExists: true,
      processingStatus: (existingRes.rows[0].processing_status as string | null) ?? null,
    };
  }

  // Upload to MinIO (ensureBucket called inside putObject)
  await putObject(BUCKET, minioKey, opts.fileBuffer, opts.fileBuffer.length, {
    'Content-Type': 'application/pdf',
    'x-original-filename': opts.fileName,
  });

  // Resolve jurisdiction ID
  const jRes = await pool.query(`SELECT id FROM jurisdictions WHERE code = $1`, [
    opts.jurisdictionCode,
  ]);
  const jurisdictionId = jRes.rows[0]?.id ?? null;

  // Insert library_documents row
  await pool.query(
    `INSERT INTO library_documents
		   (id, source_type, corpus_type, jurisdiction_id, title, official_url, source_hash,
		    mime_type, minio_key, effective_date, processing_status, uploaded_by)
		 VALUES ($1, 'upload', $2::corpus_type, $3, $4, $5, $6, 'application/pdf', $7, $8, 'queued', $9)`,
    [
      documentId,
      opts.corpusType || 'other',
      jurisdictionId,
      opts.title,
      opts.officialUrl || null,
      sourceHash,
      minioKey,
      opts.effectiveDate || null,
      opts.userId,
    ]
  );

  // Insert ingestion_jobs row
  await pool.query(
    `INSERT INTO ingestion_jobs (id, document_id, stage, status) VALUES ($1, $2, 'queued', 'running')`,
    [jobId, documentId]
  );

  return { documentId, jobId, alreadyExists: false, processingStatus: 'queued' };
}
