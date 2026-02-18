import { json, type RequestEvent } from '@sveltejs/kit';
import crypto from 'crypto';
import { uploadFile } from '$lib/server/minio-client';
import db from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { createJob, updateJob } from '$lib/server/evidence-progress';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { extractTextHybrid } from '$lib/server/ocr/hybrid.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { chunkLegalDocument, type LegalChunk } from '$lib/server/indexer/legal-chunker.js';

import { ENV } from '$lib/server/env.server.js';
const BUCKET = ENV.MINIO_EVIDENCE_BUCKET;
const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/** Min text length before we try OCR fallback for scanned PDFs */
const MIN_PDF_TEXT_LENGTH = 50;

/**
 * POST /api/evidence/upload
 * Pipeline: MinIO → PostgreSQL → text extraction (pdf-parse + OCR fallback) → chunk → embed → pgvector + Qdrant
 */
export async function POST({ request }: RequestEvent) {
	const jobId = `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		const caseId = formData.get('caseId')?.toString() || null;
		const title = formData.get('title')?.toString() || '';
		const description = formData.get('description')?.toString() || null;
		const evidenceType = (formData.get('evidenceType')?.toString() || 'UNKNOWN').toUpperCase();

		if (!file || typeof file.arrayBuffer !== 'function') {
			return json({ error: 'No file provided' }, { status: 400 });
		}

		if (file.size > MAX_FILE_SIZE) {
			return json({ error: `File too large. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB.` }, { status: 400 });
		}

		// Register job for progress tracking
		createJob(jobId);
		updateJob(jobId, { step: 'uploading', progress: 10, message: `Uploading ${file.name}...` });

		// 1. Read file into buffer
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// 2. Compute SHA-256 hash
		updateJob(jobId, { step: 'hashing', progress: 20, message: 'Computing file hash...' });
		const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

		// 3. Upload to MinIO
		updateJob(jobId, { step: 'storing', progress: 30, message: 'Storing in MinIO...' });
		const ext = file.name.split('.').pop() ?? 'bin';
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const objectKey = `evidence/${caseId ?? 'default'}/${timestamp}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

		await uploadFile(BUCKET, objectKey, buffer, {
			'Content-Type': file.type || 'application/octet-stream',
			'X-Evidence-Hash': fileHash,
		});

		const minioUrl = `minio://${BUCKET}/${objectKey}`;

		// 4. Insert into PostgreSQL (raw SQL — Drizzle schema out of sync with actual DB columns)
		updateJob(jobId, { step: 'db-insert', progress: 50, message: 'Saving to database...' });

		const evidenceNumber = `EV-${Date.now().toString(36).toUpperCase()}`;
		const insertResult = await db.execute(sql`
			INSERT INTO evidence (case_id, evidence_number, title, type, summary, description,
				evidence_type, file_type, file_url, file_name, file_size, hash, uploaded_at)
			VALUES (
				${caseId ?? '00000000-0000-0000-0000-000000000000'},
				${evidenceNumber},
				${title || file.name},
				'document',
				${description || `Uploaded file: ${file.name}`},
				${description},
				${evidenceType.toLowerCase()},
				${file.type},
				${minioUrl},
				${file.name},
				${file.size},
				${'sha256:' + fileHash},
				NOW()
			)
			RETURNING id
		`);
		const inserted = { id: (insertResult as any).rows?.[0]?.id ?? (insertResult as any)[0]?.id };

		const evidenceId = inserted.id;
		updateJob(jobId, { evidenceId, step: 'db-insert', progress: 60, message: 'Database record created' });

		// 5. Fire off text extraction + chunking + embedding (non-blocking)
		processAndEmbed(jobId, evidenceId, file.name, buffer, caseId).catch((err) => {
			console.error('[Upload] Background processing failed:', err);
			updateJob(jobId, { step: 'error', progress: 60, message: 'Embedding generation failed (upload succeeded)', error: String(err) });
		});

		return json({
			id: evidenceId,
			jobId,
			status: 'uploaded',
			fileName: file.name,
			minioKey: objectKey,
			hash: fileHash,
		}, { status: 201 });

	} catch (err) {
		console.error('[Upload] Pipeline error:', err);
		updateJob(jobId, { step: 'error', progress: 0, message: 'Upload failed', error: String(err) });
		return json({ error: 'Upload failed', jobId }, { status: 500 });
	}
}

/**
 * Extract text from a file buffer based on extension.
 * PDF: pdf-parse first, then OCR fallback if text is too short (scanned PDFs).
 * Images: OCR via Tesseract (native CLI) → tesseract.js fallback.
 * Text files: UTF-8 decode.
 */
async function extractText(fileName: string, buffer: Buffer): Promise<{ text: string; method: string }> {
	const isPDF = /\.pdf$/i.test(fileName);
	const isImage = /\.(png|jpg|jpeg|tiff|tif|bmp|webp)$/i.test(fileName);

	if (isPDF) {
		try {
			const pdfParse = (await import('pdf-parse')).default;
			const parsed = await pdfParse(buffer);
			const text = parsed.text ?? '';

			// If pdf-parse got enough text, use it
			if (text.trim().length >= MIN_PDF_TEXT_LENGTH) {
				return { text, method: 'pdf-parse' };
			}

			// Scanned PDF — pdf-parse returned near-empty text, try OCR
			console.log(`[Upload] PDF text too short (${text.trim().length} chars), trying OCR for ${fileName}`);
			const ocrResult = await extractTextHybrid(buffer, fileName);
			if (ocrResult.text.trim().length > text.trim().length) {
				return { text: ocrResult.text, method: `ocr-${ocrResult.method}` };
			}

			// OCR didn't improve — return whatever pdf-parse gave us
			return { text, method: 'pdf-parse' };
		} catch (err) {
			console.warn('[Upload] PDF parse failed, trying OCR:', err);
			try {
				const ocrResult = await extractTextHybrid(buffer, fileName);
				return { text: ocrResult.text, method: `ocr-${ocrResult.method}` };
			} catch {
				return { text: '', method: 'failed' };
			}
		}
	}

	if (isImage) {
		const ocrResult = await extractTextHybrid(buffer, fileName);
		return { text: ocrResult.text, method: `ocr-${ocrResult.method}` };
	}

	const isTextBased = /\.(txt|md|docx|html|csv|json|xml|log)$/i.test(fileName);
	if (isTextBased) {
		return { text: buffer.toString('utf-8'), method: 'utf8' };
	}

	return { text: `Evidence file: ${fileName}`, method: 'filename-only' };
}

/**
 * Background processing: extract text → legal-aware chunk → embed → pgvector + Qdrant + graph nodes.
 */
async function processAndEmbed(
	jobId: string,
	evidenceId: string,
	fileName: string,
	buffer: Buffer,
	caseId: string | null
): Promise<void> {
	updateJob(jobId, { step: 'embedding', progress: 65, message: 'Extracting text...' });

	const { text: fullText, method: extractionMethod } = await extractText(fileName, buffer);
	if (!fullText.trim()) {
		updateJob(jobId, { step: 'complete', progress: 100, message: 'Upload complete (no text to embed)' });
		return;
	}

	console.log(`[Upload] Extracted ${fullText.length} chars via ${extractionMethod} from ${fileName}`);

	// Structure-aware chunking: detects ARTICLE/SECTION/§ headings, preserves section paths
	const legalChunks = chunkLegalDocument(fullText, { maxTokens: 512, overlap: 128 });
	const hasStructure = legalChunks.some(c => c.sectionPath.length > 0);
	console.log(`[Upload] ${legalChunks.length} chunks, structure=${hasStructure ? 'legal' : 'flat'}`);

	updateJob(jobId, { step: 'embedding', progress: 70, message: `Generating embeddings for ${legalChunks.length} chunk(s)...` });

	let stored = 0;
	const qdrantPoints: Array<{
		id: string;
		vector: { content: number[] };
		payload: Record<string, unknown>;
	}> = [];

	// Track unique sections for graph node creation
	const sectionsSeen = new Map<string, { heading: string; path: string[]; chunkIds: string[] }>();

	for (const chunk of legalChunks) {
		try {
			const embedding = await embedText(chunk.text.slice(0, 8000));
			if (embedding) {
				const chunkUUID = crypto.randomUUID();

				// Store in pgvector with full legal metadata
				await storeChunkVector(evidenceId, chunk.chunkIndex, chunk.text.slice(0, 4000), embedding, {
					model: 'embeddinggemma:latest',
					extractionMethod,
					fileName,
					sectionPath: chunk.sectionPath,
					heading: chunk.heading,
					citations: chunk.citations,
					startOffset: chunk.startOffset,
					endOffset: chunk.endOffset,
					tokenCount: chunk.tokenCount,
				});

				// Collect for Qdrant batch upsert
				qdrantPoints.push({
					id: chunkUUID,
					vector: { content: embedding },
					payload: {
						evidence_id: evidenceId,
						case_id: caseId,
						chunk_index: chunk.chunkIndex,
						file_name: fileName,
						content_preview: chunk.text.slice(0, 500),
						extraction_method: extractionMethod,
						section_path: chunk.sectionPath,
						heading: chunk.heading,
						citations: chunk.citations,
						token_count: chunk.tokenCount,
						created_at: new Date().toISOString(),
					},
				});

				// Track section for graph
				if (chunk.sectionPath.length > 0) {
					const sectionKey = chunk.sectionPath.join(' > ');
					const existing = sectionsSeen.get(sectionKey);
					if (existing) {
						existing.chunkIds.push(chunkUUID);
					} else {
						sectionsSeen.set(sectionKey, {
							heading: chunk.heading,
							path: chunk.sectionPath,
							chunkIds: [chunkUUID],
						});
					}
				}

				stored++;
			}
		} catch (err) {
			console.warn(`[Upload] Chunk ${chunk.chunkIndex} embedding failed:`, err);
		}

		const pct = 70 + Math.round((stored / legalChunks.length) * 15);
		updateJob(jobId, { step: 'embedding', progress: pct, message: `Embedded ${stored}/${legalChunks.length} chunks` });
	}

	// Batch upsert to Qdrant evidence_items collection
	if (qdrantPoints.length > 0) {
		updateJob(jobId, { step: 'embedding', progress: 87, message: 'Indexing in Qdrant...' });
		try {
			await qdrant.batchUpsert({
				collection: 'evidence',
				points: qdrantPoints,
			});
			console.log(`[Upload] Upserted ${qdrantPoints.length} points to Qdrant evidence_items`);
		} catch (err) {
			console.warn('[Upload] Qdrant upsert failed (pgvector data is safe):', err);
		}
	}

	// Create graph nodes in yorha_evidence_nodes for each section
	if (sectionsSeen.size > 0 && caseId) {
		updateJob(jobId, { step: 'embedding', progress: 92, message: `Building graph (${sectionsSeen.size} sections)...` });
		try {
			await createGraphNodes(evidenceId, caseId, fileName, sectionsSeen);
			console.log(`[Upload] Created ${sectionsSeen.size} graph nodes for ${fileName}`);
		} catch (err) {
			console.warn('[Upload] Graph node creation failed (vectors are safe):', err);
		}
	}

	// Collect all unique citations for cross-referencing
	const allCitations = [...new Set(legalChunks.flatMap(c => c.citations))];

	updateJob(jobId, {
		step: 'complete',
		progress: 100,
		message: `Upload complete: ${stored}/${legalChunks.length} chunks, ${sectionsSeen.size} sections, ${allCitations.length} citations (${extractionMethod})`,
	});
}

/**
 * Create yorha_evidence_nodes for each section and connect them with edges.
 */
async function createGraphNodes(
	evidenceId: string,
	caseId: string,
	fileName: string,
	sections: Map<string, { heading: string; path: string[]; chunkIds: string[] }>
): Promise<void> {
	const DEV_USER = '00000000-0000-0000-0000-000000000001';
	const nodeIds: Map<string, string> = new Map();

	// Create a node for each section
	for (const [sectionKey, section] of sections) {
		const nodeId = crypto.randomUUID();
		nodeIds.set(sectionKey, nodeId);

		await db.execute(sql`
			INSERT INTO yorha_evidence_nodes
				(id, case_id, title, description, evidence_type, source, file_path,
				 ai_tags, key_entities, status, created_by)
			VALUES (
				${nodeId},
				${caseId},
				${section.heading.slice(0, 500)},
				${`Section from ${fileName}: ${section.path.join(' > ')}`},
				'document-section',
				${fileName},
				${`evidence/${evidenceId}/section/${section.path.join('/')}`},
				${JSON.stringify(section.path)}::jsonb,
				${JSON.stringify({ chunkCount: section.chunkIds.length, sectionPath: section.path })}::jsonb,
				'active',
				${DEV_USER}
			)
		`);
	}

	// Create HAS_SECTION edges: parent section → child section
	const sectionKeys = [...sections.keys()];
	for (const key of sectionKeys) {
		const section = sections.get(key)!;
		if (section.path.length > 1) {
			// Find parent by removing last segment
			const parentPath = section.path.slice(0, -1).join(' > ');
			const parentId = nodeIds.get(parentPath);
			const childId = nodeIds.get(key);
			if (parentId && childId) {
				await db.execute(sql`
					INSERT INTO yorha_evidence_connections
						(case_id, source_node_id, target_node_id, connection_type, strength, description, created_by)
					VALUES (
						${caseId}, ${parentId}, ${childId}, 'HAS_SECTION', 100,
						${`${section.path.slice(0, -1).join(' > ')} contains ${section.heading}`},
						${DEV_USER}
					)
				`);
			}
		}
	}
}

/**
 * Generate a 768-dim embedding. Tries gRPC first, then HTTP/Ollama, then nomic fallback.
 */
async function embedText(text: string): Promise<number[] | null> {
	// Try gRPC embedding service first (fastest path when available)
	try {
		const vec = await generateSingleEmbedding(text);
		if (vec && vec.length > 0) return vec;
	} catch {
		// gRPC unavailable — fall through to direct Ollama
	}

	try {
		const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text }),
			signal: AbortSignal.timeout(30_000),
		});

		if (!res.ok) {
			// Fallback to nomic-embed-text
			const fallback = await fetch(`${OLLAMA_URL}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: 'nomic-embed-text:latest', prompt: text }),
				signal: AbortSignal.timeout(30_000),
			});
			if (!fallback.ok) return null;
			const data = await fallback.json();
			return data.embedding;
		}

		const data = await res.json();
		return data.embedding;
	} catch {
		return null;
	}
}

/**
 * Store a chunk embedding into evidence_vectors using raw SQL
 * (Drizzle schema is out of sync with actual DB columns).
 *
 * Actual DB schema:
 *   evidence_vectors(id uuid, evidence_id uuid, chunk_index int, content text,
 *                    embedding vector(768), analysis_type text, metadata jsonb, created_at timestamp)
 */
async function storeChunkVector(
	evidenceId: string,
	chunkIndex: number,
	content: string,
	embedding: number[],
	metadata: Record<string, unknown>
): Promise<void> {
	const vectorStr = `[${embedding.join(',')}]`;
	await db.execute(sql`
		INSERT INTO evidence_vectors (evidence_id, chunk_index, content, embedding, analysis_type, metadata)
		VALUES (
			${evidenceId},
			${chunkIndex},
			${content},
			${sql.raw(`'${vectorStr}'::vector`)},
			'upload-embedding',
			${JSON.stringify(metadata)}::jsonb
		)
	`);
}