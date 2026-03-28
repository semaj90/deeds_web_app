import { json, type RequestEvent } from '@sveltejs/kit';
import crypto from 'crypto';
import { uploadFile } from '$lib/server/minio-client';
import { db } from '$lib/server/db/client';
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
import { traceEmbedding } from '$lib/server/observability/langfuse.js';
import { triggerEvidenceGpuAnalysis } from '$lib/server/gpu/background-analyzer.js';
import { extractSectionsFromText, detectSectionsHeuristic, type LangExtractSection } from '$lib/server/services/langextract-service.js';

import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { redis } from '$lib/server/redis.js';
import { classifyDocument } from '$lib/server/nlp/analyzer.js';
import { createYOLOService } from '$lib/server/yolo.js';
import { ollamaFetch } from '$lib/server/ollama.js';

const evidenceUploadSchema = z.object({
	title: z.string().max(256).optional(),
	description: z.string().max(10000).optional(),
	caseId: z.string().uuid('Invalid caseId format. Expected UUID, use crypto.randomUUID() or a valid case ID.').optional(),
	evidenceType: z.string().max(100).optional()
});

const BUCKET = ENV.MINIO_EVIDENCE_BUCKET;
const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/** Min text length before we try OCR fallback for scanned PDFs */
const MIN_PDF_TEXT_LENGTH = 50;

/** Extraction cache TTL: 7 days — stable results keyed by file hash */
const EXTRACTION_CACHE_TTL = 7 * 24 * 60 * 60;
const EXTRACTION_CACHE_PREFIX = 'extraction:text:';

type StageStatus = 'pending' | 'success' | 'warning' | 'skipped' | 'failed';

type StageRecord = {
  status: StageStatus;
  detail?: string;
  metrics?: Record<string, unknown>;
  updatedAt: string;
};

type ProcessingDiagnostics = {
  startedAt: string;
  completedAt: string | null;
  stages: Record<string, StageRecord>;
  warnings: Array<{ stage: string; detail: string; at: string }>;
};

function createProcessingDiagnostics(): ProcessingDiagnostics {
  return {
    startedAt: new Date().toISOString(),
    completedAt: null,
    stages: {},
    warnings: [],
  };
}

function markStage(
  diagnostics: ProcessingDiagnostics,
  stage: string,
  status: StageStatus,
  detail?: string,
  metrics?: Record<string, unknown>
): void {
  diagnostics.stages[stage] = {
    status,
    detail,
    metrics,
    updatedAt: new Date().toISOString(),
  };
  if (status === 'warning' || status === 'failed') {
    diagnostics.warnings.push({
      stage,
      detail: detail ?? status,
      at: diagnostics.stages[stage].updatedAt,
    });
  }
}

async function persistProcessingDiagnostics(
  evidenceId: string,
  diagnostics: ProcessingDiagnostics,
  extraMetadata: Record<string, unknown> = {}
): Promise<void> {
  await db.execute(sql`
		UPDATE evidence SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      processingDiagnostics: diagnostics,
      ...extraMetadata,
    })}::jsonb
		WHERE id = ${evidenceId}
	`);
}

/** Check Redis for cached extraction result by file SHA-256 hash. */
async function getCachedExtraction(
  fileHash: string
): Promise<{ text: string; method: string; doclingBlocks?: Record<string, unknown>[] } | null> {
  try {
    const cached = await redis.get(`${EXTRACTION_CACHE_PREFIX}${fileHash}`);
    if (cached) return JSON.parse(cached);
  } catch {
    /* cache unavailable */
  }
  return null;
}

/** Cache extraction result in Redis keyed by file SHA-256 hash. */
async function setCachedExtraction(
  fileHash: string,
  result: { text: string; method: string; doclingBlocks?: Record<string, unknown>[] }
): Promise<void> {
  try {
    // Only cache results with meaningful text (>50 chars)
    if (result.text.length < 50) return;
    await redis.set(
      `${EXTRACTION_CACHE_PREFIX}${fileHash}`,
      JSON.stringify({
        text: result.text,
        method: result.method,
        doclingBlocks: result.doclingBlocks?.slice(0, 50),
      }),
      'EX',
      EXTRACTION_CACHE_TTL
    );
  } catch {
    /* cache unavailable */
  }
}

/**
 * POST /api/evidence/upload
 * Pipeline: MinIO → PostgreSQL → text extraction (pdf-parse + OCR fallback) → chunk → embed → pgvector + Qdrant
 */
export async function POST({ request, locals }: RequestEvent) {
  // Auth guard: reject unauthenticated uploads
  if (!locals.user?.id) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: 10 uploads/min per client (heavy operation)
  const rateCheck = heavyRateLimiter.check(request);
  if (!rateCheck.allowed) {
    return json(
      {
        error: `Rate limit exceeded. Try again in ${Math.ceil((rateCheck.resetTime - Date.now()) / 1000)}s`,
      },
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

    // Validate form fields with Zod
    const formFields = {
      title: formData.get('title')?.toString() || undefined,
      description: formData.get('description')?.toString() || undefined,
      caseId: formData.get('caseId')?.toString() || undefined,
      evidenceType: formData.get('evidenceType')?.toString() || undefined,
    };
    const parsed = evidenceUploadSchema.safeParse(formFields);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const caseId = parsed.data.caseId ?? null;
    const title = parsed.data.title ?? '';
    const description = parsed.data.description ?? null;
    const userType = parsed.data.evidenceType;
    const autoType = detectEvidenceType(file.type, file.name);
    const evidenceType = userType && userType !== 'UNKNOWN' ? userType : autoType;

    if (file.size > MAX_FILE_SIZE) {
      return json(
        { error: `File too large. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
        { status: 400 }
      );
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
    const resultRows = Array.isArray(insertResult) ? insertResult : (insertResult as { rows?: Record<string, any>[] }).rows ?? [];
    const inserted = { id: (resultRows[0] as Record<string, any>)?.id };

    const evidenceId = inserted.id;
    updateJob(jobId, {
      evidenceId,
      step: 'db-insert',
      progress: 60,
      message: 'Database record created',
    });

    // 4b. Audit log — chain of custody
    import('$lib/server/audit/evidence-audit.js')
      .then(({ logEvidenceAction }) => {
        logEvidenceAction(evidenceId, 'uploaded', {
          changes: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            hash: fileHash,
            caseId,
          },
        });
      })
      .catch(() => {
        /* audit is non-critical */
      });

    // 5. Fire off text extraction + chunking + embedding (non-blocking)
    processAndEmbed(jobId, evidenceId, file.name, buffer, caseId, evidenceType).catch((err) => {
      console.error('[Upload] Background processing failed:', err);
      updateJob(jobId, {
        step: 'error',
        progress: 60,
        message: 'Embedding generation failed (upload succeeded)',
        error: String(err),
      });
    });

    // 6. Publish to RabbitMQ for async analysis tracking
    try {
      const { rabbitmq } = await import('$lib/server/queue/rabbitmq-manager-fixed.js');
      await rabbitmq.publishEvidenceProcess({
        evidenceId,
        text: '',
        caseId,
        fileName: file.name,
        metadata: { fileSize: file.size, mimeType: file.type, hash: fileHash },
      });
    } catch {
      // RabbitMQ publish is non-critical
    }

    // 7. Invalidate evidence and case caches
    await Promise.all([
      invalidateEvidenceCache(evidenceId, caseId, 'evidence_create'),
      caseId ? invalidateCaseCache(caseId, 'evidence_create') : Promise.resolve(),
    ]).catch((err) => console.warn('[Upload] Cache invalidation failed:', err));

    return json(
      {
        id: evidenceId,
        jobId,
        status: 'uploaded',
        fileName: file.name,
        minioKey: objectKey,
        hash: fileHash,
      },
      { status: 201 }
    );
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
async function extractText(
  fileName: string,
  buffer: Buffer,
  mimeType?: string
): Promise<{ text: string; method: string; doclingBlocks?: Record<string, unknown>[] }> {
  const isPDF = /\.pdf$/i.test(fileName);
  const isImage = /\.(png|jpg|jpeg|tiff|tif|bmp|webp)$/i.test(fileName);
  const isAudio =
    /\.(mp3|wav|m4a|ogg|flac|aac|wma)$/i.test(fileName) ||
    (mimeType?.startsWith('audio/') ?? false);

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
      const { isDoclingAvailable, analyzeDocumentWithDocling } = await import(
        '$lib/server/docling.js'
      );
      if (await isDoclingAvailable()) {
        const doclingResult = await analyzeDocumentWithDocling({
          fileBuffer: buffer,
          mimeType: 'application/pdf',
        });
        if (doclingResult.fullText.trim().length >= MIN_PDF_TEXT_LENGTH) {
          return {
            text: doclingResult.fullText,
            method: 'docling',
            doclingBlocks: doclingResult.blocks,
          };
        }
        console.log(
          `[Upload] Docling text too short (${doclingResult.fullText.trim().length} chars), falling back`
        );
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
      console.log(
        `[Upload] PDF text too short (${text.trim().length} chars), trying OCR for ${fileName}`
      );
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
    // Resize large images before OCR (max 1280px — Tesseract quality sweet-spot)
    // Note: VLM resize to Gemma3 native 896×896 is handled separately inside /api/vision/analyze
    let processBuffer = buffer;
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buffer).metadata();
      if (meta.width && meta.width > 1280) {
        processBuffer = await sharp(buffer)
          .resize(1280, null, { fit: 'inside', withoutEnlargement: true })
          .toBuffer();
        console.log(
          `[Upload] Resized image ${meta.width}x${meta.height} -> 1280px for ${fileName}`
        );
      }
    } catch {
      /* sharp unavailable, use original buffer */
    }

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
 * Find the best-matching legal section type for a chunk based on character offset overlap.
 * Returns the section_type with the greatest overlap, or null if no overlap.
 */
function findChunkSectionType(
  chunkStart: number,
  chunkEnd: number,
  sections: LangExtractSection[]
): string | null {
  let bestType: string | null = null;
  let bestOverlap = 0;
  for (const s of sections) {
    const overlapStart = Math.max(chunkStart, s.start_offset);
    const overlapEnd = Math.min(chunkEnd, s.end_offset);
    const overlap = overlapEnd - overlapStart;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestType = s.section_type;
    }
  }
  return bestType;
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
  const diagnostics = createProcessingDiagnostics();
  markStage(diagnostics, 'extraction', 'pending', 'Awaiting text extraction');
  markStage(diagnostics, 'chunking', 'pending', 'Awaiting chunk generation');
  markStage(diagnostics, 'embedding', 'pending', 'Awaiting chunk embeddings');
  markStage(diagnostics, 'vector_storage', 'pending', 'Awaiting pgvector persistence');
  markStage(diagnostics, 'qdrant_index', 'pending', 'Awaiting Qdrant upsert');
  markStage(diagnostics, 'graph', 'pending', 'Awaiting graph node generation');
  markStage(diagnostics, 'entities', 'pending', 'Awaiting entity extraction');
  markStage(diagnostics, 'forensics', 'pending', 'Awaiting forensic analysis');
  markStage(diagnostics, 'vision', 'pending', 'Awaiting image analysis');
  markStage(
    diagnostics,
    'classification',
    'pending',
    'Awaiting LangExtract and NLP classification'
  );
  markStage(diagnostics, 'summary', 'pending', 'Awaiting summary generation');
  markStage(diagnostics, 'summary_embedding', 'pending', 'Awaiting summary embedding');
  markStage(diagnostics, 'auto_tagging', 'pending', 'Awaiting auto-tagging');
  markStage(diagnostics, 'metadata_persist', 'pending', 'Awaiting metadata persistence');
  markStage(diagnostics, 'gpu_analysis', 'pending', 'Awaiting background GPU analysis');
  markStage(diagnostics, 'pipeline_job', 'pending', 'Awaiting pipeline job creation');

  updateJob(jobId, { step: 'embedding', progress: 65, message: 'Extracting text...' });

  // Check extraction cache by file hash (SHA-256 keyed, 7-day TTL)
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  let extractionResult = await getCachedExtraction(fileHash);
  if (extractionResult) {
    console.log(
      `[Upload] Extraction cache HIT for ${fileName} (hash=${fileHash.slice(0, 8)}, method=${extractionResult.method})`
    );
    markStage(
      diagnostics,
      'extraction',
      'success',
      `Extraction cache hit via ${extractionResult.method}`,
      {
        cacheHit: true,
        method: extractionResult.method,
      }
    );
  } else {
    extractionResult = await extractText(fileName, buffer);
    setCachedExtraction(fileHash, extractionResult).catch(() => {});
    markStage(
      diagnostics,
      'extraction',
      'success',
      `Extracted text via ${extractionResult.method}`,
      {
        cacheHit: false,
        method: extractionResult.method,
        textLength: extractionResult.text.length,
      }
    );
  }

  const { text: fullText, method: extractionMethod, doclingBlocks } = extractionResult;
  if (!fullText.trim()) {
    markStage(diagnostics, 'chunking', 'skipped', 'No text extracted');
    markStage(diagnostics, 'embedding', 'skipped', 'No text extracted');
    markStage(diagnostics, 'vector_storage', 'skipped', 'No text extracted');
    markStage(diagnostics, 'qdrant_index', 'skipped', 'No text extracted');
    markStage(diagnostics, 'graph', 'skipped', 'No text extracted');
    markStage(diagnostics, 'entities', 'skipped', 'No text extracted');
    markStage(diagnostics, 'forensics', 'skipped', 'No text extracted');
    markStage(
      diagnostics,
      'vision',
      /\.(png|jpg|jpeg|tiff|tif|bmp|webp)$/i.test(fileName) ? 'warning' : 'skipped',
      'Image analysis unavailable because OCR returned no text'
    );
    markStage(diagnostics, 'classification', 'skipped', 'No text extracted');
    markStage(diagnostics, 'summary', 'skipped', 'No text extracted');
    markStage(diagnostics, 'summary_embedding', 'skipped', 'No summary produced');
    markStage(diagnostics, 'auto_tagging', 'skipped', 'No text extracted');
    diagnostics.completedAt = new Date().toISOString();
    await persistProcessingDiagnostics(evidenceId, diagnostics, {
      extractionMethod,
      analysisTimestamp: diagnostics.completedAt,
    });
    updateJob(jobId, {
      step: 'complete',
      progress: 100,
      message: 'Upload complete (no text to embed)',
    });
    return;
  }

  console.log(
    `[Upload] Extracted ${fullText.length} chars via ${extractionMethod} from ${fileName}`
  );

  // Structure-aware chunking: detects ARTICLE/SECTION/§ headings, preserves section paths
  const legalChunks = chunkLegalDocument(fullText, { maxTokens: 512, overlap: 128 });
  const hasStructure = legalChunks.some((c) => c.sectionPath.length > 0);
  console.log(
    `[Upload] ${legalChunks.length} chunks, structure=${hasStructure ? 'legal' : 'flat'}`
  );
  markStage(diagnostics, 'chunking', 'success', `Generated ${legalChunks.length} legal chunk(s)`, {
    chunkCount: legalChunks.length,
    hasStructure,
  });

  // Extract legal sections via LangExtract (facts, issues, holdings, etc.) for chunk tagging
  let sectionMap: LangExtractSection[] = [];
  try {
    const result = await extractSectionsFromText(fullText.slice(0, 50_000), evidenceId, 'case');
    sectionMap = result.sections;
    console.log(`[Upload] LangExtract: ${sectionMap.length} sections extracted for ${fileName}`);
  } catch {
    try {
      sectionMap = detectSectionsHeuristic(fullText.slice(0, 50_000), evidenceId).sections;
      console.log(
        `[Upload] LangExtract unavailable, heuristic: ${sectionMap.length} sections for ${fileName}`
      );
    } catch {
      /* proceed without sections */
    }
  }

  updateJob(jobId, {
    step: 'embedding',
    progress: 70,
    message: `Generating embeddings for ${legalChunks.length} chunk(s)...`,
  });

  let stored = 0;
  let vectorStoreFailures = 0;
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
    const texts = batch.map((c) => c.text.slice(0, 8000));

    let batchEmbeddings: (number[] | null)[] = new Array(batch.length).fill(null);
    try {
      // Check cache first, collect misses
      const cacheResults = await Promise.all(
        texts.map((t) =>
          getEmbeddingCache(t, 'embeddinggemma:latest').catch(() => ({ entry: null }))
        )
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
        const embeddings = await gated(embedGate, () => embedTexts(needEmbed.map((n) => n.text)));
        for (let j = 0; j < needEmbed.length; j++) {
          const embedding = embeddings[j] ? Array.from(embeddings[j]) : null;
          batchEmbeddings[needEmbed[j].idx] = embedding;
          if (embedding) {
            setEmbeddingCache(needEmbed[j].text, embedding, 'embeddinggemma:latest').catch(
              () => {}
            );
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
      const sectionType = findChunkSectionType(chunk.startOffset, chunk.endOffset, sectionMap);

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
          sectionType,
        });
      } catch (err) {
        console.warn(`[Upload] Chunk ${chunk.chunkIndex} pgvector store failed:`, err);
        vectorStoreFailures++;
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
          section_type: sectionType,
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
    updateJob(jobId, {
      step: 'embedding',
      progress: pct,
      message: `Embedded ${stored}/${legalChunks.length} chunks`,
    });
  }

  markStage(
    diagnostics,
    'embedding',
    stored > 0 ? 'success' : 'warning',
    `Embedded ${stored} of ${legalChunks.length} chunk(s)`,
    {
      chunkCount: legalChunks.length,
      embeddedCount: stored,
    }
  );
  markStage(
    diagnostics,
    'vector_storage',
    vectorStoreFailures > 0 ? 'warning' : 'success',
    vectorStoreFailures > 0
      ? `${vectorStoreFailures} chunk vector store operation(s) failed`
      : `Stored ${stored} chunk vector(s) in pgvector`,
    { stored, failures: vectorStoreFailures }
  );

  // Batch upsert to Qdrant evidence_items collection
  if (qdrantPoints.length > 0) {
    updateJob(jobId, { step: 'embedding', progress: 87, message: 'Indexing in Qdrant...' });
    try {
      await qdrant.batchUpsert({
        collection: 'evidence',
        points: qdrantPoints,
      });
      console.log(`[Upload] Upserted ${qdrantPoints.length} points to Qdrant evidence_items`);
      markStage(
        diagnostics,
        'qdrant_index',
        'success',
        `Upserted ${qdrantPoints.length} point(s) to Qdrant`,
        {
          pointCount: qdrantPoints.length,
        }
      );
    } catch (err) {
      console.warn('[Upload] Qdrant upsert failed (pgvector data is safe):', err);
      markStage(
        diagnostics,
        'qdrant_index',
        'warning',
        'Qdrant upsert failed; pgvector data remains available',
        {
          pointCount: qdrantPoints.length,
        }
      );
    }
  } else {
    markStage(diagnostics, 'qdrant_index', 'skipped', 'No chunk embeddings available for Qdrant');
  }

  // Create graph nodes in yorha_evidence_nodes for each section
  if (sectionsSeen.size > 0 && caseId) {
    updateJob(jobId, {
      step: 'embedding',
      progress: 92,
      message: `Building graph (${sectionsSeen.size} sections)...`,
    });
    try {
      await createGraphNodes(evidenceId, caseId, fileName, sectionsSeen);
      console.log(`[Upload] Created ${sectionsSeen.size} graph nodes for ${fileName}`);
      markStage(diagnostics, 'graph', 'success', `Created ${sectionsSeen.size} graph node(s)`, {
        sectionCount: sectionsSeen.size,
      });
    } catch (err) {
      console.warn('[Upload] Graph node creation failed (vectors are safe):', err);
      markStage(
        diagnostics,
        'graph',
        'warning',
        'Graph node creation failed; vector data remains available',
        {
          sectionCount: sectionsSeen.size,
        }
      );
    }
  } else {
    markStage(
      diagnostics,
      'graph',
      'skipped',
      sectionsSeen.size === 0
        ? 'No section graph nodes detected'
        : 'Missing caseId for graph node creation',
      {
        sectionCount: sectionsSeen.size,
      }
    );
  }

  // Collect all unique citations for cross-referencing
  const allCitations = [...new Set(legalChunks.flatMap((c) => c.citations))];

  // Create pipeline job in analysis_jobs table (Drizzle ORM)
  let pipelineJobId: string | null = null;
  try {
    pipelineJobId = await createAnalysisJob({ evidenceId, caseId, jobType: 'upload_pipeline' });
    await updateAnalysisJob(pipelineJobId, { progress: '75' });
    markStage(diagnostics, 'pipeline_job', 'success', 'Created upload pipeline analysis job');
  } catch (err) {
    console.warn('[Upload] Pipeline job creation failed (non-fatal):', err);
    markStage(diagnostics, 'pipeline_job', 'warning', 'Pipeline analysis job creation failed');
  }

  // 6. Entity extraction: LLM structured (primary) + regex (fallback) + dedup
  updateJob(jobId, { step: 'embedding', progress: 93, message: 'Extracting entities...' });
  let entityJobId: string | null = null;
  try {
    entityJobId = await createAnalysisJob({ evidenceId, caseId, jobType: 'entity_extraction' });
  } catch {
    /* non-fatal */
  }

  const [entities, forensicFlags] = await Promise.all([
    gated(entityGate, () => extractEntities(fullText.slice(0, 50_000))),
    gated(forensicsGate, () => Promise.resolve(detectForensicPatterns(fullText.slice(0, 50_000)))),
  ]);
  console.log(
    `[Upload] ${entities.length} entities, ${forensicFlags.length} forensic flags for ${fileName}`
  );
  markStage(diagnostics, 'entities', 'success', `Extracted ${entities.length} entities`, {
    entityCount: entities.length,
  });
  markStage(
    diagnostics,
    'forensics',
    'success',
    `Detected ${forensicFlags.length} forensic flag(s)`,
    { flagCount: forensicFlags.length }
  );

  if (entityJobId) {
    try {
      await completeAnalysisJob(entityJobId, {
        entityCount: entities.length,
        types: [...new Set(entities.map((e) => e.label))],
      });
    } catch {
      /* non-fatal */
    }
  }

  // Record forensics job
  try {
    const forensicsJobId = await createAnalysisJob({ evidenceId, caseId, jobType: 'forensics' });
    await completeAnalysisJob(forensicsJobId, {
      flagCount: forensicFlags.length,
      types: forensicFlags.map((f) => f.type),
    });
  } catch {
    /* non-fatal */
  }

  // 6a-ii. Persist entities + forensic flags to normalized tables (no cap)
  if (entities.length > 0) {
    try {
      const entityRows = entities.map((e) => ({
        evidenceId,
        caseId: caseId ?? null,
        entityText: e.text.slice(0, 5000),
        entityLabel: e.label.slice(0, 50),
        confidence: e.score ?? null,
        startOffset: e.start ?? null,
        endOffset: e.end ?? null,
        source: 'llm' as const,
      }));
      // Batch insert in chunks of 500 (Drizzle has no cap, but PG has param limit)
      for (let i = 0; i < entityRows.length; i += 500) {
        await db.execute(sql`
					INSERT INTO evidence_entities (evidence_id, case_id, entity_text, entity_label, confidence, start_offset, end_offset, source)
					SELECT * FROM jsonb_to_recordset(${JSON.stringify(entityRows.slice(i, i + 500))}::jsonb)
					AS t(evidence_id uuid, case_id uuid, entity_text text, entity_label varchar, confidence real, start_offset int, end_offset int, source varchar)
				`);
      }
      console.log(
        `[Upload] Persisted ${entities.length} entities to evidence_entities for ${fileName}`
      );
    } catch (err) {
      console.warn('[Upload] Entity normalization failed (non-fatal, JSONB fallback intact):', err);
      markStage(
        diagnostics,
        'entities',
        'warning',
        'Entity normalization failed; JSON metadata fallback retained',
        { entityCount: entities.length }
      );
    }
  }

  if (forensicFlags.length > 0) {
    try {
      const flagRows = forensicFlags.map((f) => ({
        evidenceId,
        caseId: caseId ?? null,
        flagType: f.type.slice(0, 50),
        description: f.description.slice(0, 5000),
        severity: f.severity ?? 'medium',
        metadata: f.metadata ?? null,
      }));
      await db.execute(sql`
				INSERT INTO evidence_forensic_flags (evidence_id, case_id, flag_type, description, severity, metadata)
				SELECT * FROM jsonb_to_recordset(${JSON.stringify(flagRows)}::jsonb)
				AS t(evidence_id uuid, case_id uuid, flag_type varchar, description text, severity varchar, metadata jsonb)
			`);
      console.log(
        `[Upload] Persisted ${forensicFlags.length} forensic flags to evidence_forensic_flags for ${fileName}`
      );
    } catch (err) {
      console.warn(
        '[Upload] Forensic flag normalization failed (non-fatal, JSONB fallback intact):',
        err
      );
      markStage(
        diagnostics,
        'forensics',
        'warning',
        'Forensic flag normalization failed; JSON metadata fallback retained',
        { flagCount: forensicFlags.length }
      );
    }
  }

  // 6b. YOLO + VLM image analysis in parallel (both independent, non-fatal)
  const isImage = /\.(png|jpg|jpeg|tiff|tif|bmp|webp)$/i.test(fileName);
  let yoloDetections: { objects: { class: string; confidence: number }[]; layout: Record<string, unknown>; modelType: string } | null = null;
  let visionAnalysis: {
    summary?: string;
    keyFindings?: string[];
    suggestedTags?: string[];
  } | null = null;

  if (isImage) {
    const [yoloResult, vlmResult] = await Promise.allSettled([
      // YOLO object detection
      (async () => {
        const yolo = createYOLOService();
        if (await yolo.isModelAvailable()) {
          const result = await yolo.analyzeDocument(buffer, fileName);
          const objectLabels = result.objects?.map((o) => o.class) ?? [];
          console.log(
            `[Upload] YOLO detected ${result.objects?.length ?? 0} objects [${objectLabels.slice(0, 5).join(', ')}] in ${fileName} (${result.modelType}, ${result.processingTime}ms)`
          );
          return {
            objects: result.objects ?? [],
            layout: result.layout,
            modelType: result.modelType,
          };
        }
        return null;
      })(),
      // VLM vision analysis (cached by SHA256)
      (async () => {
        const imageHash = crypto.createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
        const { entry: cachedVLM } = await getVLMCache(imageHash, 'evidence');
        if (cachedVLM) {
          console.log(`[Upload] VLM cache HIT for ${fileName} (hash=${imageHash.slice(0, 8)})`);
          return {
            summary: cachedVLM.result.description,
            keyFindings: cachedVLM.result.labels.map(
              (l) => `${l.label} (${(l.confidence * 100).toFixed(0)}%)`
            ),
            suggestedTags: cachedVLM.result.labels.map((l) => l.label),
          };
        }
        const formDataVLM = new FormData();
        formDataVLM.append('file', new Blob([new Uint8Array(buffer)]), fileName);
        const visionRes = await fetch(`${ENV.PUBLIC_API_URL}/api/vision/analyze`, {
          method: 'POST',
          body: formDataVLM,
          signal: AbortSignal.timeout(30_000),
        });
        if (visionRes.ok) {
          const result = (await visionRes.json()) as Record<string, any>;
          console.log(
            `[Upload] VLM analysis complete for ${fileName}: ${result?.keyFindings?.length ?? 0} findings`
          );
          await setVLMCache(imageHash, {
            labels: (result?.suggestedTags ?? []).map((t: string) => ({
              label: t,
              confidence: 0.8,
            })),
            description: result?.summary ?? '',
            analysisType: 'evidence',
          }).catch(() => {});
          return result;
        }
        return null;
      })(),
    ]);

    yoloDetections = yoloResult.status === 'fulfilled' ? yoloResult.value : null;
    visionAnalysis = vlmResult.status === 'fulfilled' ? vlmResult.value : null;
    if (yoloResult.status === 'rejected')
      console.warn('[Upload] YOLO detection skipped:', yoloResult.reason);
    if (vlmResult.status === 'rejected')
      console.warn('[Upload] VLM analysis skipped:', vlmResult.reason);
    if (yoloResult.status === 'rejected' || vlmResult.status === 'rejected') {
      markStage(
        diagnostics,
        'vision',
        'warning',
        'One or more image analysis passes were skipped',
        {
          yoloStatus: yoloResult.status,
          vlmStatus: vlmResult.status,
        }
      );
    } else {
      markStage(diagnostics, 'vision', 'success', 'Completed image analysis passes', {
        yoloObjects: yoloDetections?.objects?.length ?? 0,
        vlmFindings: visionAnalysis?.keyFindings?.length ?? 0,
      });
    }
  } else {
    markStage(diagnostics, 'vision', 'skipped', 'File type is not image evidence');
  }

  // 6c. LangExtract + NLP classification in parallel (both independent, non-fatal)
  let evidenceProfile: Record<string, any> | null = null;
  let nlpClassification: {
    documentType: string;
    practiceArea: string;
    confidence: number;
    keyPhrases: string[];
  } | null = null;

  if (fullText.trim().length > 100) {
    const [langResult, nlpResult] = await Promise.allSettled([
      (async () => {
        const { extractEvidenceProfile } = await import(
          '$lib/server/services/langextract-service.js'
        );
        const profile = await extractEvidenceProfile(fullText, evidenceType);
        if (profile)
          console.log(
            `[Upload] LangExtract profile: ${profile.suggested_tags?.length ?? 0} tags, type=${profile.evidence_type_classification}`
          );
        return profile;
      })(),
      (async () => {
        const result = await classifyDocument(fullText.slice(0, 3000));
        console.log(
          `[Upload] NLP classification: ${result.documentType} (${result.practiceArea}, ${(result.confidence * 100).toFixed(0)}%) for ${fileName}`
        );
        return {
          documentType: result.documentType,
          practiceArea: result.practiceArea,
          confidence: result.confidence,
          keyPhrases: result.keyPhrases,
        };
      })(),
    ]);

    evidenceProfile = langResult.status === 'fulfilled' ? langResult.value : null;
    nlpClassification = nlpResult.status === 'fulfilled' ? nlpResult.value : null;
    if (langResult.status === 'rejected')
      console.warn('[Upload] LangExtract profile skipped:', langResult.reason);
    if (nlpResult.status === 'rejected')
      console.warn('[Upload] NLP classification skipped:', nlpResult.reason);
    markStage(
      diagnostics,
      'classification',
      langResult.status === 'rejected' || nlpResult.status === 'rejected' ? 'warning' : 'success',
      langResult.status === 'rejected' || nlpResult.status === 'rejected'
        ? 'LangExtract or NLP classification partially skipped'
        : 'Completed LangExtract and NLP classification',
      {
        hasEvidenceProfile: Boolean(evidenceProfile),
        hasNlpClassification: Boolean(nlpClassification),
      }
    );
  } else {
    markStage(
      diagnostics,
      'classification',
      'skipped',
      'Text too short for LangExtract and NLP classification',
      {
        textLength: fullText.trim().length,
      }
    );
  }

  // 6d. Post-analysis evidence type refinement
  const refinedType = inferLegalClassification(evidenceType, fullText, entities, forensicFlags);
  // Also consider LangExtract classification if available
  const finalType =
    evidenceProfile?.evidence_type_classification &&
    evidenceProfile.evidence_type_classification !== evidenceType
      ? evidenceProfile.evidence_type_classification
      : refinedType;
  if (finalType !== evidenceType) {
    try {
      await db.execute(
        sql`UPDATE evidence SET evidence_type = ${finalType} WHERE id = ${evidenceId}`
      );
      console.log(`[Upload] Refined evidence_type: ${evidenceType} → ${finalType} for ${fileName}`);
    } catch (err) {
      console.warn('[Upload] Evidence type refinement failed (non-fatal):', err);
      markStage(
        diagnostics,
        'classification',
        'warning',
        'Evidence type refinement update failed',
        {
          requestedType: evidenceType,
          finalType,
        }
      );
    }
  }

  // 7. Summarization via Ollama (non-fatal — skipped if Ollama unavailable)
  let summary = '';
  updateJob(jobId, { step: 'embedding', progress: 95, message: 'Generating summary...' });
  let summaryJobId: string | null = null;
  try {
    summaryJobId = await createAnalysisJob({ evidenceId, caseId, jobType: 'summarization' });
  } catch {
    /* non-fatal */
  }

  try {
    summary = await gated(summarizeGate, () => summarizeDocument(fullText));
    if (summaryJobId) {
      await completeAnalysisJob(summaryJobId, { summaryLength: summary.length });
    }
    markStage(diagnostics, 'summary', 'success', `Generated summary (${summary.length} chars)`, {
      summaryLength: summary.length,
    });
  } catch (err) {
    console.warn('[Upload] Summarization skipped:', err);
    if (summaryJobId) {
      await failAnalysisJob(summaryJobId, String(err)).catch(() => {});
    }
    markStage(diagnostics, 'summary', 'warning', 'Summarization skipped');
  }

  // 7b. Embed summary for vector retrieval in Qdrant legal_documents (with auto binary cache)
  if (summary && summary.length > 50) {
    try {
      const embeddings = await gated(embedGate, () => embedTexts([summary.slice(0, 4000)]));
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
          },
        });
        console.log(`[Upload] Summary embedded in Qdrant legal_documents for ${fileName}`);
        markStage(
          diagnostics,
          'summary_embedding',
          'success',
          'Stored summary embedding in legal_documents',
          {
            summaryLength: summary.length,
          }
        );
      }
    } catch (err) {
      console.warn('[Upload] Summary embedding failed (non-fatal):', err);
      markStage(diagnostics, 'summary_embedding', 'warning', 'Summary embedding failed');
    }
  } else {
    markStage(
      diagnostics,
      'summary_embedding',
      'skipped',
      'Summary unavailable or too short for embedding',
      {
        summaryLength: summary.length,
      }
    );
  }

  // 7c. Auto-tag and mirror to pgvector + Qdrant + CouchDB (non-fatal)
  if (fullText.trim().length > 100) {
    try {
      const { autoTagDocument } = await import('$lib/server/ace/auto-tagger.js');
      const tagResult = await autoTagDocument({
        documentId: evidenceId,
        text: fullText.slice(0, 15_000),
        maxTags: 20,
      });
      console.log(
        `[Upload] Auto-tagged ${fileName}: ${tagResult.tags.length} tags, ${tagResult.mirrored} mirrored`
      );
      markStage(
        diagnostics,
        'auto_tagging',
        'success',
        `Generated ${tagResult.tags.length} auto-tag(s)`,
        {
          tagCount: tagResult.tags.length,
          mirrored: tagResult.mirrored,
        }
      );
    } catch (err) {
      console.warn('[Upload] Auto-tagging failed (non-fatal):', err);
      markStage(diagnostics, 'auto_tagging', 'warning', 'Auto-tagging failed');
    }
  } else {
    markStage(diagnostics, 'auto_tagging', 'skipped', 'Text too short for auto-tagging', {
      textLength: fullText.trim().length,
    });
  }

  // 8. Persist analysis results to evidence.metadata
  try {
    diagnostics.completedAt = new Date().toISOString();
    markStage(
      diagnostics,
      'metadata_persist',
      'success',
      'Persisting analysis metadata and processing diagnostics'
    );
    await persistProcessingDiagnostics(evidenceId, diagnostics, {
      entities: entities.slice(0, 200),
      forensicFlags,
      summary: summary.slice(0, 5000),
      entityCount: entities.length,
      extractionMethod,
      refinedEvidenceType: finalType,
      doclingBlocks: doclingBlocks?.slice(0, 50) ?? null,
      visionAnalysis: visionAnalysis ?? null,
      yoloDetections: yoloDetections ?? null,
      nlpClassification: nlpClassification ?? null,
      evidenceProfile: evidenceProfile ?? null,
      admissibilityIndicators: evidenceProfile?.admissibility_indicators ?? null,
      langextractSections:
        sectionMap.length > 0
          ? sectionMap.map((s) => ({ type: s.section_type, confidence: s.confidence }))
          : null,
      sectionTypeDistribution:
        sectionMap.length > 0
          ? Object.fromEntries(
              [...new Set(sectionMap.map((s) => s.section_type))].map((t) => [
                t,
                sectionMap.filter((s) => s.section_type === t).length,
              ])
            )
          : null,
      suggestedTags: [
        ...(evidenceProfile?.suggested_tags ?? []),
        ...(visionAnalysis?.suggestedTags ?? []),
        ...(yoloDetections?.objects?.map((o) => `detected:${o.class}`) ?? []),
      ].filter(Boolean),
      analysisTimestamp: diagnostics.completedAt,
    });
  } catch (err) {
    console.warn('[Upload] Analysis persistence failed (vectors are safe):', err);
    markStage(
      diagnostics,
      'metadata_persist',
      'warning',
      'Analysis metadata persistence failed; vectors remain available'
    );
  }

  // 9. GPU background analysis — fire-and-forget (similarity, clustering, case embedding)
  if (caseId && stored > 0) {
    triggerEvidenceGpuAnalysis(evidenceId, caseId);
    markStage(diagnostics, 'gpu_analysis', 'success', 'Triggered background GPU analysis');
  } else {
    markStage(
      diagnostics,
      'gpu_analysis',
      'skipped',
      caseId
        ? 'No stored chunks for background GPU analysis'
        : 'Missing caseId for background GPU analysis',
      {
        stored,
      }
    );
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
    } catch {
      /* non-fatal */
    }
  }

  const highSeverity = forensicFlags.filter((f) => f.severity === 'high');

  updateJob(jobId, {
    step: 'complete',
    progress: 100,
    message: `Complete: ${stored} chunks, ${entities.length} entities, ${forensicFlags.length} flags${highSeverity.length ? ` (${highSeverity.length} HIGH)` : ''}, ${sectionsSeen.size} sections, ${allCitations.length} citations (${extractionMethod})`,
  });
}

/** Escape a string for safe use in raw SQL (single-quote doubling) */
function escapeSql(s: string): string {
	return `'${s.replace(/'/g, "''")}'`;
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

	// Build all node rows in memory, then batch INSERT
	const nodeRows: Array<{ id: string; heading: string; path: string[]; chunkCount: number }> = [];
	for (const [sectionKey, section] of sections) {
		const nodeId = crypto.randomUUID();
		nodeIds.set(sectionKey, nodeId);
		nodeRows.push({ id: nodeId, heading: section.heading, path: section.path, chunkCount: section.chunkIds.length });
	}

	// Batch INSERT nodes (single round-trip instead of N)
	if (nodeRows.length > 0) {
		const nodeValues = nodeRows.map(n =>
			`('${n.id}', '${caseId}', ${escapeSql(n.heading.slice(0, 500))}, ${escapeSql(`Section from ${fileName}: ${n.path.join(' > ')}`)}, 'document-section', ${escapeSql(fileName)}, ${escapeSql(`evidence/${evidenceId}/section/${n.path.join('/')}`)}, '${JSON.stringify(n.path).replace(/'/g, "''")}'::jsonb, '${JSON.stringify({ chunkCount: n.chunkCount, sectionPath: n.path }).replace(/'/g, "''")}'::jsonb, 'active', '${DEV_USER}')`
		).join(',\n');
		await db.execute(sql.raw(`
			INSERT INTO yorha_evidence_nodes
				(id, case_id, title, description, evidence_type, source, file_path, ai_tags, key_entities, status, created_by)
			VALUES ${nodeValues}
		`));
	}

	// Batch INSERT edges (single round-trip instead of N)
	const edgeValues: string[] = [];
	for (const [key, section] of sections) {
		if (section.path.length > 1) {
			const parentPath = section.path.slice(0, -1).join(' > ');
			const parentId = nodeIds.get(parentPath);
			const childId = nodeIds.get(key);
			if (parentId && childId) {
				edgeValues.push(
					`('${caseId}', '${parentId}', '${childId}', 'HAS_SECTION', 100, ${escapeSql(`${section.path.slice(0, -1).join(' > ')} contains ${section.heading}`)}, '${DEV_USER}')`
				);
			}
		}
	}
	if (edgeValues.length > 0) {
		await db.execute(sql.raw(`
			INSERT INTO yorha_evidence_connections
				(case_id, source_node_id, target_node_id, connection_type, strength, description, created_by)
			VALUES ${edgeValues.join(',\n')}
		`));
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
			embedding = await traceEmbedding(text, model, async () => {
				const res = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model, prompt: text }),
					signal: AbortSignal.timeout(30_000),
				});

				if (!res.ok) {
					// Fallback to nomic-embed-text
					const fallback = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
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
			});
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
			${metadata}::jsonb
		)
	`);
}