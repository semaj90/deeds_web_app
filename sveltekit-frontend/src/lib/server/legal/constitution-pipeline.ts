/**
 * Constitution Pipeline
 *
 * Full A→G ingestion pipeline for URL-based state constitution sources.
 * Extends the existing ingestion-worker with:
 *  - Stage A: Source registry lookup + fetch URL
 *  - Stage B: HTTP fetch → MinIO raw + normalized
 *  - Stage C: HTML normalization / PDF text extraction
 *  - Stage D: Legal node hierarchy (section-level)
 *  - Stage E: Chunk insertion
 *  - Stage F: Embedding (768-dim) → Postgres + Qdrant mirror
 *  - Stage G: Auto-tag nodes + Neo4j sync
 *
 * Reuses: pool, minio-client, generateEmbeddings, chunkLegalDocument, Neo4j helpers
 */

import { randomUUID } from 'crypto';
import { pool } from '$lib/server/db/client';
import { getSeaweedFile as getFile } from '$lib/server/seaweed-client.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client';
import { chunkLegalDocument } from '$lib/server/indexer/legal-chunker';
import { generateSparseVector } from '$lib/server/vector/bm42-sparse.js';
import { fetchConstitution } from './constitution-fetcher';
import { normalizePlainText } from './html-normalizer';
import { tagNode, computeRankScore } from './constitution-tagger';
import type { StateConstitutionSource } from './constitution-registry';

const BUCKET = process.env.MINIO_LIBRARY_BUCKET ?? 'legal-library';
const EMBED_BATCH = 32;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConstitutionPipelineResult {
	documentId: string;
	jobId: string;
	stateCode: string;
	skipped: boolean;
	nodeCount: number;
	chunkCount: number;
	qdrantPointCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job progress helpers
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
		`UPDATE ingestion_jobs
		 SET stage = 'complete', status = 'complete', progress = 100,
		     metrics_json = $1, completed_at = now(), updated_at = now()
		 WHERE id = $2`,
		[JSON.stringify(metrics), jobId]
	);
	await pool.query(
		`UPDATE library_documents ld
		 SET processing_status = 'complete', updated_at = now()
		 FROM ingestion_jobs ij
		 WHERE ij.id = $1 AND ij.document_id = ld.id`,
		[jobId]
	);
}

async function failJob(jobId: string, err: Error): Promise<void> {
	await pool.query(
		`UPDATE ingestion_jobs
		 SET stage = 'failed', status = 'failed',
		     error_text = $1, updated_at = now()
		 WHERE id = $2`,
		[err.message.slice(0, 2000), jobId]
	);
	await pool.query(
		`UPDATE library_documents ld
		 SET processing_status = 'failed', updated_at = now()
		 FROM ingestion_jobs ij
		 WHERE ij.id = $1 AND ij.document_id = ld.id`,
		[jobId]
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Qdrant upsert (non-fatal, mirrors embeddings)
// ─────────────────────────────────────────────────────────────────────────────

async function upsertToQdrant(
	points: Array<{
		id: number;
		vector: number[];
		payload: Record<string, unknown>;
	}>
): Promise<void> {
	try {
		const { QdrantClient } = await import('@qdrant/js-client-rest');
		const { ENV } = await import('$lib/server/env.server');
		const client = new QdrantClient({ url: ENV.QDRANT_URL });

		const COLLECTION = 'legal_documents';
		try {
			await client.getCollection(COLLECTION);
		} catch {
			await client.createCollection(COLLECTION, {
				vectors: { size: 768, distance: 'Cosine', on_disk: true },
				sparse_vectors: { bm25: {} },
				optimizers_config: { default_segment_number: 2 },
				hnsw_config: { m: 16, ef_construct: 128, on_disk: true },
			});
		}

		// Ensure sparse vector support on existing collection
		try {
			await client.updateCollection(COLLECTION, { sparse_vectors: { bm25: {} } });
		} catch {
			/* already configured */
		}

		// Enrich points with BM42 sparse vectors
		const hybridPoints = points.map((p) => {
			const text = (p.payload.chunk_text as string) ?? (p.payload.text as string) ?? '';
			const sparse = generateSparseVector(text);
			return {
				id: p.id,
				vector: {
					content: p.vector,
					bm25: { indices: sparse.indices, values: sparse.values },
				},
				payload: p.payload,
			};
		});

		await client.upsert(COLLECTION, { wait: true, points: hybridPoints as any });
	} catch (err) {
		console.warn(
			'[constitution-pipeline] Qdrant upsert skipped:',
			err instanceof Error ? err.message : err
		);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Neo4j sync (non-fatal)
// ─────────────────────────────────────────────────────────────────────────────

async function syncNeo4j(
	documentId: string,
	stateCode: string,
	stateName: string,
	nodes: Array<{
		id: string;
		parentId: string | null;
		heading: string;
		nodeType: string;
		nodePath: string;
	}>
): Promise<void> {
	try {
		const { getNeo4jDriver } = await import('$lib/server/neo4j-driver');
		const neo4j = getNeo4jDriver();
		const session = neo4j.session();
		try {
			await session.run(
				`MERGE (d:LibraryDocument {id: $id})
				 SET d.stateCode = $stateCode, d.stateName = $stateName, d.corpusType = 'constitution'`,
				{ id: documentId, stateCode, stateName }
			);
			for (let i = 0; i < nodes.length; i += 100) {
				const batch = nodes.slice(i, i + 100);
				await session.run(
					`UNWIND $nodes AS n
					 MERGE (ln:LegalNode {id: n.id})
					 SET ln.heading = n.heading, ln.nodeType = n.nodeType, ln.nodePath = n.nodePath
					 WITH ln, n MATCH (d:LibraryDocument {id: $docId})
					 MERGE (d)-[:HAS_NODE]->(ln)`,
					{ nodes: batch, docId: documentId }
				);
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
		console.warn(
			'[constitution-pipeline] Neo4j sync skipped:',
			err instanceof Error ? err.message : err
		);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Main pipeline entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function runConstitutionPipeline(
	source: StateConstitutionSource,
	userId = 'system'
): Promise<ConstitutionPipelineResult> {
	// Look up existing source row to get last hash
	const srcRow = await pool.query(
		`SELECT id, last_hash, document_id FROM state_constitution_sources WHERE state_code = $1`,
		[source.stateCode]
	);
	const lastHash: string | null = srcRow.rows[0]?.last_hash ?? null;
	const existingDocId: string | null = srcRow.rows[0]?.document_id ?? null;

	// ── Stage A: Fetch ───────────────────────────────────────────────────────

	// Create placeholder document + job so SSE can stream progress
	const documentId = existingDocId ?? randomUUID();
	const jobId = randomUUID();

	// Look up jurisdiction id for the state
	const jRow = await pool.query(`SELECT id FROM jurisdictions WHERE code = $1`, [
		source.stateCode,
	]);
	const jurisdictionId: number | null = jRow.rows[0]?.id ?? null;

	if (!existingDocId) {
		await pool.query(
			`INSERT INTO library_documents
			   (id, title, source_type, corpus_type, jurisdiction_id,
			    processing_status, is_official, source_kind, source_confidence)
			 VALUES ($1, $2, 'fetched_url', 'constitution', $3, 'queued', $4, $5, $6)
			 ON CONFLICT (id) DO NOTHING`,
			[
				documentId,
				`${source.stateName} Constitution`,
				jurisdictionId,
				source.isOfficial,
				source.isOfficial ? 'official_state' : 'scraped',
				source.sourceConfidence,
			]
		);
	}

	await pool.query(
		`INSERT INTO ingestion_jobs
		   (id, document_id, stage, status, progress, started_by)
		 VALUES ($1, $2, 'queued', 'queued', 0, $3)`,
		[jobId, documentId, userId]
	);

	await pool.query(
		`UPDATE state_constitution_sources
		 SET last_fetch_status = 'running', updated_at = now()
		 WHERE state_code = $1`,
		[source.stateCode]
	);

	try {
		await setStage(jobId, 'extracting', 5, { state: source.stateCode });

		// ── Stage B: Fetch URL ─────────────────────────────────────────────────
		const fetchResult = await fetchConstitution(source, lastHash);

		if (fetchResult.skipped) {
			await completeJob(jobId, { skipped: true, reason: 'hash_unchanged' });
			await pool.query(
				`UPDATE state_constitution_sources
				 SET last_fetch_status = 'skipped', last_fetched_at = now(), updated_at = now()
				 WHERE state_code = $1`,
				[source.stateCode]
			);
			return {
				documentId,
				jobId,
				stateCode: source.stateCode,
				skipped: true,
				nodeCount: 0,
				chunkCount: 0,
				qdrantPointCount: 0,
			};
		}

		// ── Stage C: Extract text ──────────────────────────────────────────────
		await setStage(jobId, 'extracting', 20);

		let fullText = '';
		let normalizedResult = fetchResult.normalized;

		if (source.format === 'pdf') {
			// For PDFs, read back from MinIO and extract via pdf-parse
			const pdfBuffer = await getFile(BUCKET, fetchResult.rawMinioKey);

			try {
				const pdfParse = (await import('pdf-parse')).default;
				const data = await pdfParse(pdfBuffer);
				fullText = data.text;
				normalizedResult = normalizePlainText(fullText);
			} catch {
				// Store empty if extraction fails; can backfill later
				fullText = '';
			}
		} else {
			fullText = normalizedResult.textClean;
		}

		// ── Stage D: Legal structure + chunk ──────────────────────────────────
		await setStage(jobId, 'structuring', 35);

		const chunks = chunkLegalDocument(fullText, { maxTokens: 512, overlap: 64 });

		// Update document with metadata
		const fetchUrl = source.sourceUrl ?? source.discoveryUrl;
		await pool.query(
			`UPDATE library_documents
			 SET title = $1, official_url = $2, word_count = $3,
			     minio_key = $4, minio_key_normalized = $5,
			     source_hash = $6, fetched_at = now(),
			     source_kind = $7, source_confidence = $8,
			     is_official = $9, updated_at = now()
			 WHERE id = $10`,
			[
				normalizedResult.title || `${source.stateName} Constitution`,
				fetchUrl,
				normalizedResult.wordCount,
				fetchResult.rawMinioKey,
				fetchResult.normalizedMinioKey,
				fetchResult.hash,
				source.isOfficial ? 'official_state' : 'scraped',
				source.sourceConfidence,
				source.isOfficial,
				documentId,
			]
		);

		// Create version record
		const versionId = randomUUID();
		await pool.query(
			`INSERT INTO library_document_versions (id, document_id, version_label, source_date, is_current)
			 VALUES ($1, $2, 'v1', now(), true)
			 ON CONFLICT DO NOTHING`,
			[versionId, documentId]
		);

		await setStage(jobId, 'chunking', 45, { chunkCount: chunks.length });

		// ── Stage E: Build legal_nodes + insert legal_chunks ──────────────────
		const nodeMap = new Map<string, string>();
		const nodeRows: Array<{
			id: string;
			parentId: string | null;
			nodeType: string;
			heading: string;
			citationLabel: string | null;
			nodePath: string;
			fullText: string;
		}> = [];

		for (const chunk of chunks) {
			if (!chunk.sectionPath?.length) continue;
			for (let depth = 0; depth < chunk.sectionPath.length; depth++) {
				const pathKey = chunk.sectionPath
					.slice(0, depth + 1)
					.join('/')
					.toLowerCase()
					.replace(/\s+/g, '-');
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

				let nodeType = 'section';
				if (/^preamble/i.test(heading)) nodeType = 'preamble';
				else if (/^amendment\s+[ivxlcdm\d]+/i.test(heading)) nodeType = 'amendment';
				else if (/^article/i.test(heading)) nodeType = 'article';
				else if (/^chapter/i.test(heading)) nodeType = 'chapter';
				else if (/^\([a-z]\)/i.test(heading)) nodeType = 'subsection';

				const nodeText = chunks
					.filter((c) =>
						c.sectionPath
							?.join('/')
							.toLowerCase()
							.replace(/\s+/g, '-')
							.startsWith(pathKey)
					)
					.map((c) => c.text)
					.join('\n\n')
					.slice(0, 100_000);

				nodeRows.push({
					id: nodeId,
					parentId,
					nodeType,
					heading,
					citationLabel: heading,
					nodePath: pathKey,
					fullText: nodeText,
				});
			}
		}

		// Insert nodes with tags + rank_score
		for (const n of nodeRows) {
			const tags = tagNode(
				n.heading,
				n.fullText,
				n.nodeType,
				source.stateCode,
				source.sourceConfidence,
				source.isOfficial
			);
			const rankScore = computeRankScore(
				n.nodePath.split('/').length,
				n.nodeType,
				source.isOfficial,
				source.sourceConfidence
			);

			await pool.query(
				`INSERT INTO legal_nodes
				   (id, document_id, version_id, parent_node_id, node_type, heading,
				    citation_label, node_path, depth, full_text, text_clean, tags_json, rank_score)
				 VALUES ($1, $2, $3, $4, $5::legal_node_type, $6, $7, $8, $9, $10, $10, $11, $12)
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
					n.fullText,
					JSON.stringify(tags),
					rankScore,
				]
			);
		}

		// Insert chunks
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
				[
					chunkId,
					nodeId,
					chunk.chunkIndex,
					chunk.text,
					chunk.tokenCount ?? 0,
					chunk.startOffset,
					chunk.endOffset,
				]
			);
		}

		await setStage(jobId, 'embedding', 65, {
			nodeCount: nodeRows.length,
			chunkCount: chunkRows.length,
		});

		// ── Stage F: Embeddings → Postgres + Qdrant ───────────────────────────
		const embedTexts = chunkRows.map((c) => c.text.slice(0, 1024));
		const qdrantPoints: Array<{
			id: number;
			vector: number[];
			payload: Record<string, unknown>;
		}> = [];

		for (let i = 0; i < chunkRows.length; i += EMBED_BATCH) {
			const batch = chunkRows.slice(i, i + EMBED_BATCH);
			const textBatch = embedTexts.slice(i, i + EMBED_BATCH);

			try {
				const result = await generateEmbeddings(textBatch);
				const embeddings = result.vectors;
				for (let j = 0; j < batch.length; j++) {
					const vec = embeddings[j];
					if (!vec) continue;

					// Update pgvector
					await pool.query(`UPDATE legal_chunks SET embedding = $1 WHERE id = $2`, [
						`[${vec.join(',')}]`,
						batch[j].id,
					]);

					// Queue for Qdrant
					const pointId = Math.abs(
						Buffer.from(batch[j].id.replace(/-/g, ''), 'hex').readInt32BE(0)
					);
					qdrantPoints.push({
						id: pointId,
						vector: vec,
						payload: {
							chunk_id: batch[j].id,
							document_id: documentId,
							state_code: source.stateCode,
							state_name: source.stateName,
							corpus_type: 'constitution',
							is_official: source.isOfficial,
							chunk_index: batch[j].index,
							text: batch[j].text.slice(0, 500),
						},
					});

					// Store qdrant point id in postgres
					await pool.query(
						`UPDATE legal_chunks SET qdrant_point_id = $1 WHERE id = $2`,
						[String(pointId), batch[j].id]
					);
				}
			} catch {
				// Non-fatal: embeddings can be backfilled
			}

			const progress = 65 + Math.floor((i / chunkRows.length) * 20);
			await setStage(jobId, 'embedding', progress);
		}

		// Batch upsert to Qdrant (non-fatal)
		if (qdrantPoints.length > 0) {
			for (let i = 0; i < qdrantPoints.length; i += 100) {
				await upsertToQdrant(qdrantPoints.slice(i, i + 100));
			}
		}

		// ── Stage G: Tag + Neo4j ─────────────────────────────────────────────
		await setStage(jobId, 'graphing', 92);

		await syncNeo4j(
			documentId,
			source.stateCode,
			source.stateName,
			nodeRows.map((n) => ({
				id: n.id,
				parentId: n.parentId,
				heading: n.heading,
				nodeType: n.nodeType,
				nodePath: n.nodePath,
			}))
		);

		// ── Complete ─────────────────────────────────────────────────────────
		await completeJob(jobId, {
			stateCode: source.stateCode,
			nodeCount: nodeRows.length,
			chunkCount: chunkRows.length,
			qdrantPointCount: qdrantPoints.length,
			wordCount: normalizedResult.wordCount,
			hash: fetchResult.hash,
		});

		// Update source registry
		await pool.query(
			`UPDATE state_constitution_sources
			 SET last_hash = $1, last_fetched_at = now(), last_fetch_status = 'ok',
			     document_id = $2, updated_at = now()
			 WHERE state_code = $3`,
			[fetchResult.hash, documentId, source.stateCode]
		);

		return {
			documentId,
			jobId,
			stateCode: source.stateCode,
			skipped: false,
			nodeCount: nodeRows.length,
			chunkCount: chunkRows.length,
			qdrantPointCount: qdrantPoints.length,
		};
	} catch (err) {
		const e = err instanceof Error ? err : new Error(String(err));
		await failJob(jobId, e);
		await pool.query(
			`UPDATE state_constitution_sources
			 SET last_fetch_status = 'failed', updated_at = now()
			 WHERE state_code = $1`,
			[source.stateCode]
		);
		throw e;
	}
}
