import { json, type RequestEvent } from '@sveltejs/kit';
import crypto from 'crypto';
import { uploadFile } from '$lib/server/minio-client';
import db from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { createJob, updateJob } from '$lib/server/evidence-progress';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { extractTextHybrid } from '$lib/server/ocr/hybrid.js';
import { generateSingleEmbedding, generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { embedTexts } from '$lib/server/batch-embedder.js';
import { chunkLegalDocument, type LegalChunk } from '$lib/server/indexer/legal-chunker.js';
import { getEmbeddingCache, setEmbeddingCache, getVLMCache, setVLMCache } from '$lib/server/vector-cache.js';
import { extractEntities } from '$lib/server/analysis/entity-extraction.js';
import { detectForensicPatterns } from '$lib/server/analysis/forensics.js';
import { summarizeDocument } from '$lib/server/analysis/summarizer.js';
import { createAnalysisJob, updateAnalysisJob, completeAnalysisJob, failAnalysisJob } from '$lib/server/analysis/analysis-jobs.js';
import { embedGate, entityGate, forensicsGate, summarizeGate, gated, EMBED_BATCH_SIZE } from '$lib/server/analysis/concurrency-gate.js';
import { heavyRateLimiter } from '$lib/server/middleware/rate-limiter.js';
import { detectEvidenceType, inferLegalClassification } from '$lib/server/evidence/type-detector.js';
import { invalidateEvidenceCache, invalidateCaseCache } from '$lib/server/cache/invalidation.js';
import { triggerEvidenceGpuAnalysis } from '$lib/server/gpu/background-analyzer.js';

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
	// Rate limit: 10 uploads/min per client (heavy operation)
	const rateCheck = heavyRateLimiter.check(request);
	if (!rateCheck.allowed) {
		return json(
			{ error: `Rate limit exceeded. Try again in ${Math.ceil((rateCheck.resetTime - Date.now()) / 1000)}s` },
			{ status: 429 }
		);
	}

	const jobId = `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;

		if (!file || typeof file.arrayBuffer !== 'function') {
			return json({ error: 'No file provided' }, { status: 400 });
		}

		const caseId = formData.get('caseId')?.toString() || null;
		const title = formData.get('title')?.toString() || '';
		const description = formData.get('description')?.toString() || null;
		const userType = formData.get('evidenceType')?.toString();
		const autoType = detectEvidenceType(file.type, file.name);
		const evidenceType = (userType && userType !== 'UNKNOWN' ? userType : autoType);

		// Validate caseId is a valid UUID (PostgreSQL uuid type required)
		if (caseId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId)) {
			return json({
				error: `Invalid caseId format. Expected UUID, got: "${caseId}". Use crypto.randomUUID() or a valid case ID.`
			}, { status: 400 });
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
				${evidenceType},
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

		// 4b. Audit log — chain of custody
		import('$lib/server/audit/evidence-audit.js').then(({ logEvidenceAction }) => {
			logEvidenceAction(evidenceId, 'uploaded', {
				changes: { fileName: file.name, fileSize: file.size, mimeType: file.type, hash: fileHash, caseId },
			});
		}).catch(() => { /* audit is non-critical */ });

		// 5. Fire off text extraction + chunking + embedding (non-blocking)
		processAndEmbed(jobId, evidenceId, file.name, buffer, caseId, evidenceType).catch((err) => {
			console.error('[Upload] Background processing failed:', err);
			updateJob(jobId, { step: 'error', progress: 60, message: 'Embedding generation failed (upload succeeded)', error: String(err) });
		});

		// 6. Publish to RabbitMQ for async analysis tracking
		try {
			const { rabbitmq } = await import('$lib/server/queue/rabbitmq-manager-fixed.js');
			await rabbitmq.publishEvidenceProcess({
				evidenceId,
				text: '',
				caseId,
				fileName: file.name,
				metadata: { fileSize: file.size, mimeType: file.type, hash: fileHash }
			});
		} catch {
			// RabbitMQ publish is non-critical
		}

		// 7. Invalidate evidence and case caches
		await Promise.all([
			invalidateEvidenceCache(evidenceId, caseId, 'evidence_create'),
			caseId ? invalidateCaseCache(caseId, 'evidence_create') : Promise.resolve()
		]).catch(err => console.warn('[Upload] Cache invalidation failed:', err));

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
async function extractText(fileName: string, buffer: Buffer, mimeType?: string): Promise<{ text: string; method: string; doclingBlocks?: any[] }> {
	const isPDF = /\.pdf$/i.test(fileName);
	const isImage = /\.(png|jpg|jpeg|tiff|tif|bmp|webp)$/i.test(fileName);
	const isAudio = /\.(mp3|wav|m4a|ogg|flac|aac|wma)$/i.test(fileName) || (mimeType?.startsWith('audio/') ?? false);

	// Audio files: transcribe via Docling ASR
	if (isAudio) {
		try {
			const { isDoclingAvailable, transcribeAudio } = await import('$lib/server/docling.js');
			if (await isDoclingAvailable()) {
				const result = await transcribeAudio(buffer, mimeType || 'audio/wav');
				if (result.fullText.trim().length > 0) {
					return { text: result.fullText, method: 'docling-asr', doclingBlocks: result.blocks };
				}
			}
		} catch (err) {
			console.warn('[Upload] Audio transcription failed:', err);
		}
		return { text: `Audio evidence file: ${fileName}`, method: 'audio-placeholder' };
	}

	if (isPDF) {
		// Try Docling first for layout-aware PDF extraction (IBM granite-docling-258m)
		try {
			const { isDoclingAvailable, analyzeDocumentWithDocling } = await import('$lib/server/docling.js');
			if (await isDoclingAvailable()) {
				const doclingResult = await analyzeDocumentWithDocling({ fileBuffer: buffer, mimeType: 'application/pdf' });
				if (doclingResult.fullText.trim().length >= MIN_PDF_TEXT_LENGTH) {
					return { text: doclingResult.fullText, method: 'docling', doclingBlocks: doclingResult.blocks };
				}
				console.log(`[Upload] Docling text too short (${doclingResult.fullText.trim().length} chars), falling back`);
			}
		} catch (err) {
			console.warn('[Upload] Docling failed, falling back to pdf-parse:', err);
		}

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
		// Resize large images before OCR (max 1280px for VLM/Docling quality)
		let processBuffer = buffer;
		try {
			const sharp = (await import('sharp')).default;
			const meta = await sharp(buffer).metadata();
			if (meta.width && meta.width > 1280) {
				processBuffer = await sharp(buffer)
					.resize(1280, null, { fit: 'inside', withoutEnlargement: true })
					.toBuffer();
				console.log(`[Upload] Resized image ${meta.width}x${meta.height} -> 1280px for ${fileName}`);
			}
		} catch { /* sharp unavailable, use original buffer */ }

		const ocrResult = await extractTextHybrid(processBuffer, fileName);
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
	caseId: string | null,
	evidenceType: string = 'document'
): Promise<void> {
	updateJob(jobId, { step: 'embedding', progress: 65, message: 'Extracting text...' });

	const { text: fullText, method: extractionMethod, doclingBlocks } = await extractText(fileName, buffer);
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

	// Batch-embed chunks for parallelism (EMBED_BATCH_SIZE chunks per Ollama /api/embed call)
	for (let batchStart = 0; batchStart < legalChunks.length; batchStart += EMBED_BATCH_SIZE) {
		const batch = legalChunks.slice(batchStart, batchStart + EMBED_BATCH_SIZE);
		const texts = batch.map(c => c.text.slice(0, 8000));

		let batchEmbeddings: (number[] | null)[] = new Array(batch.length).fill(null);
		try {
			// Check cache first, collect misses
			const cacheResults = await Promise.all(
				texts.map(t => getEmbeddingCache(t, 'embeddinggemma:latest').catch(() => ({ entry: null })))
			);
			const needEmbed: { idx: number; text: string }[] = [];
			for (let i = 0; i < cacheResults.length; i++) {
				if (cacheResults[i].entry) {
					batchEmbeddings[i] = cacheResults[i].entry!.embedding;
				} else {
					needEmbed.push({ idx: i, text: texts[i] });
				}
			}

			// Batch-embed cache misses through concurrency gate (with auto binary Redis cache)
			if (needEmbed.length > 0) {
				const embeddings = await gated(embedGate, () =>
					embedTexts(needEmbed.map(n => n.text))
				);
				for (let j = 0; j < needEmbed.length; j++) {
					const embedding = embeddings[j] ? Array.from(embeddings[j]) : null;
					batchEmbeddings[needEmbed[j].idx] = embedding;
					if (embedding) {
						setEmbeddingCache(needEmbed[j].text, embedding, 'embeddinggemma:latest').catch(() => {});
					}
				}
			}
		} catch (err) {
			console.warn(`[Upload] Batch embedding failed at offset ${batchStart}:`, err);
		}

		// Store results for each chunk in this batch
		for (let i = 0; i < batch.length; i++) {
			const chunk = batch[i];
			const embedding = batchEmbeddings[i];
			if (!embedding || embedding.length === 0) continue;

			const chunkUUID = crypto.randomUUID();

			try {
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
			} catch (err) {
				console.warn(`[Upload] Chunk ${chunk.chunkIndex} pgvector store failed:`, err);
			}

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

	// Create pipeline job in analysis_jobs table (Drizzle ORM)
	let pipelineJobId: string | null = null;
	try {
		pipelineJobId = await createAnalysisJob({ evidenceId, caseId, jobType: 'upload_pipeline' });
		await updateAnalysisJob(pipelineJobId, { progress: '75' });
	} catch (err) {
		console.warn('[Upload] Pipeline job creation failed (non-fatal):', err);
	}

	// 6. Entity extraction: LLM structured (primary) + regex (fallback) + dedup
	updateJob(jobId, { step: 'embedding', progress: 93, message: 'Extracting entities...' });
	let entityJobId: string | null = null;
	try {
		entityJobId = await createAnalysisJob({ evidenceId, caseId, jobType: 'entity_extraction' });
	} catch { /* non-fatal */ }

	const [entities, forensicFlags] = await Promise.all([
		gated(entityGate, () => extractEntities(fullText.slice(0, 50_000))),
		gated(forensicsGate, () => Promise.resolve(detectForensicPatterns(fullText.slice(0, 50_000)))),
	]);
	console.log(`[Upload] ${entities.length} entities, ${forensicFlags.length} forensic flags for ${fileName}`);

	if (entityJobId) {
		try {
			await completeAnalysisJob(entityJobId, {
				entityCount: entities.length,
				types: [...new Set(entities.map(e => e.label))],
			});
		} catch { /* non-fatal */ }
	}

	// Record forensics job
	try {
		const forensicsJobId = await createAnalysisJob({ evidenceId, caseId, jobType: 'forensics' });
		await completeAnalysisJob(forensicsJobId, {
			flagCount: forensicFlags.length,
			types: forensicFlags.map(f => f.type),
		});
	} catch { /* non-fatal */ }

	// 6b. VLM image analysis via /api/vision/analyze (non-fatal, cached by SHA256)
	let visionAnalysis: { summary?: string; keyFindings?: string[]; suggestedTags?: string[] } | null = null;
	const isImage = /\.(png|jpg|jpeg|tiff|tif|bmp|webp)$/i.test(fileName);
	if (isImage) {
		try {
			// Check VLM cache first (SHA256 of image bytes → cached result)
			const imageHash = crypto.createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
			const { entry: cachedVLM } = await getVLMCache(imageHash, 'evidence');
			if (cachedVLM) {
				visionAnalysis = {
					summary: cachedVLM.result.description,
					keyFindings: cachedVLM.result.labels.map(l => `${l.label} (${(l.confidence * 100).toFixed(0)}%)`),
					suggestedTags: cachedVLM.result.labels.map(l => l.label),
				};
				console.log(`[Upload] VLM cache HIT for ${fileName} (hash=${imageHash.slice(0, 8)})`);
			} else {
				const formDataVLM = new FormData();
				formDataVLM.append('file', new Blob([new Uint8Array(buffer)]), fileName);
				const visionRes = await fetch('http://localhost:5173/api/vision/analyze', {
					method: 'POST',
					body: formDataVLM,
					signal: AbortSignal.timeout(30_000),
				});
				if (visionRes.ok) {
					visionAnalysis = await visionRes.json() as any;
					console.log(`[Upload] VLM analysis complete for ${fileName}: ${visionAnalysis?.keyFindings?.length ?? 0} findings`);
					// Cache VLM result for future dedup
					await setVLMCache(imageHash, {
						labels: (visionAnalysis?.suggestedTags ?? []).map(t => ({ label: t, confidence: 0.8 })),
						description: visionAnalysis?.summary ?? '',
						analysisType: 'evidence',
					}).catch(() => {});
				}
			}
		} catch (err) {
			console.warn('[Upload] VLM analysis skipped:', err);
		}
	}

	// 6c. LangExtract evidence profile (non-fatal)
	let evidenceProfile: any = null;
	if (fullText.trim().length > 100) {
		try {
			const { extractEvidenceProfile } = await import('$lib/server/services/langextract-service.js');
			evidenceProfile = await extractEvidenceProfile(fullText, evidenceType);
			if (evidenceProfile) {
				console.log(`[Upload] LangExtract profile: ${evidenceProfile.suggested_tags?.length ?? 0} tags, type=${evidenceProfile.evidence_type_classification}`);
			}
		} catch (err) {
			console.warn('[Upload] LangExtract profile skipped:', err);
		}
	}

	// 6d. Post-analysis evidence type refinement
	const refinedType = inferLegalClassification(evidenceType, fullText, entities, forensicFlags);
	// Also consider LangExtract classification if available
	const finalType = (evidenceProfile?.evidence_type_classification && evidenceProfile.evidence_type_classification !== evidenceType)
		? evidenceProfile.evidence_type_classification
		: refinedType;
	if (finalType !== evidenceType) {
		try {
			await db.execute(sql`UPDATE evidence SET evidence_type = ${finalType} WHERE id = ${evidenceId}`);
			console.log(`[Upload] Refined evidence_type: ${evidenceType} → ${finalType} for ${fileName}`);
		} catch (err) {
			console.warn('[Upload] Evidence type refinement failed (non-fatal):', err);
		}
	}

	// 7. Summarization via Ollama (non-fatal — skipped if Ollama unavailable)
	let summary = '';
	updateJob(jobId, { step: 'embedding', progress: 95, message: 'Generating summary...' });
	let summaryJobId: string | null = null;
	try {
		summaryJobId = await createAnalysisJob({ evidenceId, caseId, jobType: 'summarization' });
	} catch { /* non-fatal */ }

	try {
		summary = await gated(summarizeGate, () => summarizeDocument(fullText));
		if (summaryJobId) {
			await completeAnalysisJob(summaryJobId, { summaryLength: summary.length });
		}
	} catch (err) {
		console.warn('[Upload] Summarization skipped:', err);
		if (summaryJobId) {
			await failAnalysisJob(summaryJobId, String(err)).catch(() => {});
		}
	}

	// 7b. Embed summary for vector retrieval in Qdrant legal_documents (with auto binary cache)
	if (summary && summary.length > 50) {
		try {
			const embeddings = await gated(embedGate, () =>
				embedTexts([summary.slice(0, 4000)])
			);
			if (embeddings[0]?.length === 768) {
				const summaryEmbedding = Array.from(embeddings[0]);
				await qdrant.storeDocument({
					id: evidenceId,
					title: fileName,
					content: summary,
					contentEmbedding: summaryEmbedding,
					metadata: {
						document_type: 'evidence-summary',
						case_id: caseId,
						evidence_type: finalType,
						chunk_count: stored,
						entity_count: entities.length,
					}
				});
				console.log(`[Upload] Summary embedded in Qdrant legal_documents for ${fileName}`);
			}
		} catch (err) {
			console.warn('[Upload] Summary embedding failed (non-fatal):', err);
		}
	}

	// 7c. Auto-tag and mirror to pgvector + Qdrant + CouchDB (non-fatal)
	if (fullText.trim().length > 100) {
		try {
			const { autoTagDocument } = await import('$lib/server/ace/auto-tagger.js');
			const tagResult = await autoTagDocument({
				documentId: evidenceId,
				text: fullText.slice(0, 15_000),
				maxTags: 20
			});
			console.log(`[Upload] Auto-tagged ${fileName}: ${tagResult.tags.length} tags, ${tagResult.mirrored} mirrored`);
		} catch (err) {
			console.warn('[Upload] Auto-tagging failed (non-fatal):', err);
		}
	}

	// 8. Persist analysis results to evidence.metadata
	try {
		await db.execute(sql`
			UPDATE evidence SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
				entities: entities.slice(0, 200),
				forensicFlags,
				summary: summary.slice(0, 5000),
				entityCount: entities.length,
				extractionMethod,
				refinedEvidenceType: finalType,
				doclingBlocks: doclingBlocks?.slice(0, 50) ?? null,
				visionAnalysis: visionAnalysis ?? null,
				evidenceProfile: evidenceProfile ?? null,
				admissibilityIndicators: evidenceProfile?.admissibility_indicators ?? null,
				suggestedTags: [
					...(evidenceProfile?.suggested_tags ?? []),
					...(visionAnalysis?.suggestedTags ?? []),
				].filter(Boolean),
				analysisTimestamp: new Date().toISOString(),
			})}::jsonb
			WHERE id = ${evidenceId}
		`);
	} catch (err) {
		console.warn('[Upload] Analysis persistence failed (vectors are safe):', err);
	}

	// 9. GPU background analysis — fire-and-forget (similarity, clustering, case embedding)
	if (caseId && stored > 0) {
		triggerEvidenceGpuAnalysis(evidenceId, caseId);
	}

	// Complete pipeline job
	if (pipelineJobId) {
		try {
			await completeAnalysisJob(pipelineJobId, {
				chunks: stored,
				entities: entities.length,
				flags: forensicFlags.length,
				sections: sectionsSeen.size,
				citations: allCitations.length,
			});
		} catch { /* non-fatal */ }
	}

	const highSeverity = forensicFlags.filter(f => f.severity === 'high');

	updateJob(jobId, {
		step: 'complete',
		progress: 100,
		message: `Complete: ${stored} chunks, ${entities.length} entities, ${forensicFlags.length} flags${highSeverity.length ? ` (${highSeverity.length} HIGH)` : ''}, ${sectionsSeen.size} sections, ${allCitations.length} citations (${extractionMethod})`,
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

	// Ensure yorha_cases record exists (FK constraint: yorha_evidence_nodes.case_id → yorha_cases.id)
	await db.execute(sql`
		INSERT INTO yorha_cases (id, case_number, title, description, status, priority, created_by)
		SELECT id, COALESCE(case_number, 'AUTO-' || LEFT(id::text, 8)), title,
			COALESCE(description, ''), COALESCE(status, 'open'), COALESCE(priority, 'medium'), ${DEV_USER}
		FROM cases WHERE id = ${caseId}
		ON CONFLICT (id) DO NOTHING
	`);

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
 * Generate a 768-dim embedding. Checks Redis/memory cache first, then
 * tries gRPC → embeddinggemma → nomic-embed-text. Caches result (60min TTL).
 */
async function embedText(text: string): Promise<number[] | null> {
	const model = 'embeddinggemma:latest';

	// Check embedding cache (Memory Map → Redis) — skip re-embedding duplicate text
	try {
		const { entry: cached } = await getEmbeddingCache(text, model);
		if (cached) return cached.embedding;
	} catch { /* cache miss or unavailable */ }

	// Try gRPC embedding service first (fastest path when available)
	let embedding: number[] | null = null;
	try {
		const vec = await generateSingleEmbedding(text);
		if (vec && vec.length > 0) embedding = vec;
	} catch {
		// gRPC unavailable — fall through to direct Ollama
	}

	if (!embedding) {
		try {
			const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model, prompt: text }),
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
				embedding = data.embedding;
			} else {
				const data = await res.json();
				embedding = data.embedding;
			}
		} catch {
			return null;
		}
	}

	// Cache the fresh embedding — fire-and-forget (60min TTL in vector-cache.ts)
	if (embedding) {
		setEmbeddingCache(text, embedding, model).catch(() => {});
	}

	return embedding;
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