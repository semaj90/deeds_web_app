import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chunkLegalDocument, type LegalChunk } from '$lib/server/indexer/legal-chunker.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import { createHash, randomBytes } from 'crypto';
import { db } from '$lib/server/db/client';
import { yorhaEvidenceNodes, yorhaEvidenceConnections } from '$lib/server/db/schema-postgres.js';
import { extractTextHybrid } from '$lib/server/ocr/hybrid.js';
import { createYOLOService } from '$lib/server/yolo.js';
import {
  createAceIngestJob,
  updateAceIngestJob,
  type AceIngestStep,
} from '$lib/server/ace-ingest-progress.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

const aceIngestSchema = z.object({
	url: z.string().min(1, 'url is required').max(5000),
	caseId: z.string().max(200).optional(),
	title: z.string().max(500).optional()
});

const textFilePattern = /\.(txt|md|csv|json|xml|html|htm|log|yaml|yml)$/i;
const pdfFilePattern = /\.pdf$/i;
const imageFilePattern = /\.(png|jpg|jpeg|tiff|tif|bmp|webp)$/i;
const MIN_EXTRACTED_TEXT_LENGTH = 30;
const MIN_PDF_TEXT_LENGTH = 100;
const ACE_EMBED_BATCH_TIMEOUT_MS = ENV.ACE_EMBED_BATCH_TIMEOUT_MS;

type ProgressEmitter = (stage: string, progress: number, extra?: Record<string, unknown>) => void;

type ParsedIngestRequest =
  | { kind: 'url'; url: string; caseId?: string; title?: string }
  | { kind: 'file'; file: File; caseId?: string; title?: string };

type ResolvedIngestSource = {
  plainText: string;
  docTitle: string;
  sourceHash: string;
  sourceUrl: string;
  sourceDomain: string;
  documentType: string;
  filePath: string;
  fileType: string;
  resultMeta?: Record<string, unknown>;
  responseMeta?: Record<string, unknown>;
};

type YoloSummary = {
  objectLabels: string[];
  layoutRegions: string[];
};

type PreparedIngest = {
  resolved: ResolvedIngestSource;
  chunks: LegalChunk[];
  contentPreview: string;
  totalTokens: number;
};

function createAceJobId(): string {
  return `ace-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

function normalizeProgressPercent(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

function normalizeAceStep(stage: string): AceIngestStep {
  switch (stage) {
    case 'fetching':
    case 'extracting':
    case 'chunking':
    case 'embedding':
    case 'storing':
    case 'graph':
    case 'neo4j_sync':
    case 'deferred':
    case 'complete':
      return stage;
    default:
      return 'starting';
  }
}

function describeProgress(stage: string, extra?: Record<string, unknown>): string {
  switch (stage) {
    case 'fetching':
      return `Fetching ${typeof extra?.url === 'string' ? extra.url : 'source'}...`;
    case 'extracting':
      return `Extracting text from ${typeof extra?.filename === 'string' ? extra.filename : 'file'}...`;
    case 'chunking':
      return typeof extra?.chunks === 'number'
        ? `Prepared ${extra.chunks} chunks for indexing.`
        : 'Preparing document chunks...';
    case 'embedding': {
      const embedded = typeof extra?.embedded === 'number' ? extra.embedded : null;
      const total = typeof extra?.total === 'number' ? extra.total : null;
      if (embedded !== null && total !== null) {
        return `Embedding ${embedded} of ${total} chunks...`;
      }
      return 'Generating embeddings...';
    }
    case 'storing':
      return 'Storing vectors and metadata...';
    case 'graph':
      return 'Creating graph nodes and links...';
    case 'neo4j_sync':
      return 'Syncing graph relationships...';
    case 'deferred':
      return 'Background retrieval indexing deferred.';
    case 'complete':
      return 'Ingest completed.';
    default:
      return 'Processing ingest job...';
  }
}

function isEmbeddingTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return (
    error.name === 'TimeoutError' ||
    error.message.includes('The operation was aborted due to timeout')
  );
}

async function generateEmbeddingsForAce(texts: string[]) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      generateEmbeddings(texts),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const timeoutError = new Error(
            `ACE background embedding exceeded ${ACE_EMBED_BATCH_TIMEOUT_MS}ms`
          );
          timeoutError.name = 'TimeoutError';
          reject(timeoutError);
        }, ACE_EMBED_BATCH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function createProgressEmitter(jobId: string): ProgressEmitter {
  return (stage, progress, extra) => {
    updateAceIngestJob(jobId, {
      step: normalizeAceStep(stage),
      progress: normalizeProgressPercent(progress),
      message: describeProgress(stage, extra),
    });
  };
}

function buildResponsePreview(text: string, maxLength = 800): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength) + '...';
}

/**
 * POST /api/ace/ingest
 * Ingest a web URL: fetch → strip HTML → chunk → embed → store in Qdrant legal_documents.
 *
 * Query params:
 *   ?stream=true  — return SSE progress events instead of JSON
 *
 * Body: { url: string, caseId?: string, title?: string }
 * Returns: { success, url, title, chunksCreated, embeddingModel, totalMs }
 */
export const POST: RequestHandler = async ({ request, url: reqUrl, locals }) => {
  const start = performance.now();
  const wantStream = reqUrl.searchParams.get('stream') === 'true';

  const user = locals.user;
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let ingestRequest: ParsedIngestRequest;
  try {
    ingestRequest = await parseIngestRequest(request);
  } catch (error) {
    return json({ error: 'Invalid input' }, { status: 400 });
  }

  const jobId = createAceJobId();
  createAceIngestJob({
    jobId,
    userId: user.id,
    sourceType: ingestRequest.kind,
    caseId: ingestRequest.caseId ?? null,
    title: ingestRequest.title ?? null,
    filename: ingestRequest.kind === 'file' ? ingestRequest.file.name : null,
  });

  const jobEmit = createProgressEmitter(jobId);

  // If streaming, return SSE response
  if (wantStream) {
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (stage: string, progress: number, extra?: Record<string, unknown>) => {
          jobEmit(stage, progress, extra);
          const data = JSON.stringify({ stage, progress, ...extra });
          controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        };

        try {
          const result = await ingestSource(ingestRequest, user.id, start, emit);
          updateAceIngestJob(jobId, {
            step: 'complete',
            progress: 100,
            message: 'Ingest completed.',
            result,
          });
          emit('complete', 1.0, { result });
        } catch (e) {
          updateAceIngestJob(jobId, {
            step: 'error',
            progress: 100,
            message: 'Ingestion failed.',
            error: 'Ingestion failed',
          });
          const data = JSON.stringify({ stage: 'error', progress: 0, error: 'Ingestion failed' });
          controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // Non-streaming mode — existing JSON response
  try {
    if (ingestRequest.kind === 'file') {
      const prepared = await prepareIngest(ingestRequest, start, jobEmit);

      updateAceIngestJob(jobId, {
        step: 'queued',
        progress: 40,
        message: 'Preview ready, background indexing queued.',
      });

      void continueIngestIndexing(prepared, ingestRequest, user.id, start, jobEmit)
        .then((result) => {
          updateAceIngestJob(jobId, {
            step: 'complete',
            progress: 100,
            message: 'Background indexing complete.',
            result,
          });
        })
        .catch((error) => {
          console.error('[api/ace/ingest] Background indexing failed:', error);
          if (isEmbeddingTimeoutError(error)) {
            const message =
              'Background retrieval indexing deferred because the embedding service timed out.';
            updateAceIngestJob(jobId, {
              step: 'deferred',
              progress: 100,
              message,
              result: buildDeferredIndexingResult(prepared, ingestRequest, start, message),
            });
            return;
          }

          updateAceIngestJob(jobId, {
            step: 'error',
            progress: 100,
            message: 'Background indexing failed.',
            error: 'Ingestion failed',
          });
        });

      return json(
        buildPreparedResponse(prepared, ingestRequest, {
          jobId,
          embeddingModel: null,
          graphNodeId: null,
          indexingStatus: 'queued',
          totalMs: Math.round(performance.now() - start),
          statusStep: 'queued',
          statusProgress: 40,
          statusMessage: 'Preview ready, background indexing queued.',
        })
      );
    }

    const result = await ingestSource(ingestRequest, user.id, start, jobEmit);
    updateAceIngestJob(jobId, {
      step: 'complete',
      progress: 100,
      message: 'Ingest completed.',
      result,
    });
    return json({
      ...result,
      jobId,
      statusStep: 'complete',
      statusProgress: 100,
      statusMessage: 'Ingest completed.',
    });
  } catch (e) {
    console.error('[api/ace/ingest] Failed:', e);
    updateAceIngestJob(jobId, {
      step: 'error',
      progress: 100,
      message: 'Ingestion failed.',
      error: 'Ingestion failed',
    });
    return json({ error: 'Ingestion failed', jobId }, { status: 500 });
  }
};

async function prepareIngest(
  input: ParsedIngestRequest,
  start: number,
  emit?: ProgressEmitter
): Promise<PreparedIngest> {
  const resolved =
    input.kind === 'url'
      ? await resolveUrlSource(input, emit)
      : await resolveFileSource(input, emit);

  emit?.('chunking', 0.35);
  const chunks = chunkLegalDocument(resolved.plainText, { maxTokens: 400, overlap: 50 });
  if (chunks.length === 0) {
    throw new Error('Document produced no chunks');
  }

  emit?.('chunking', 0.4, { chunks: chunks.length });

  return {
    resolved,
    chunks,
    contentPreview: buildResponsePreview(resolved.plainText),
    totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
  };
}

function buildPreparedResponse(
  prepared: PreparedIngest,
  input: ParsedIngestRequest,
  options: {
    jobId?: string | null;
    embeddingModel: string | null;
    graphNodeId: string | null;
    indexingStatus: 'queued' | 'completed' | 'deferred';
    totalMs: number;
    statusStep?: string | null;
    statusProgress?: number | null;
    statusMessage?: string | null;
  }
) {
  return {
    success: true,
    jobId: options.jobId ?? null,
    attachmentSourceHash: prepared.resolved.sourceHash,
    sourceType: input.kind,
    url: input.kind === 'url' ? prepared.resolved.sourceUrl : undefined,
    filename: input.kind === 'file' ? input.file.name || prepared.resolved.docTitle : undefined,
    title: prepared.resolved.docTitle,
    domain: prepared.resolved.sourceDomain,
    chunksCreated: prepared.chunks.length,
    totalTokens: prepared.totalTokens,
    embeddingModel: options.embeddingModel,
    caseId: input.caseId || null,
    graphNodeId: options.graphNodeId,
    totalMs: options.totalMs,
    contentPreview: prepared.contentPreview,
    indexingStatus: options.indexingStatus,
    statusStep: options.statusStep ?? null,
    statusProgress: options.statusProgress ?? null,
    statusMessage: options.statusMessage ?? null,
    ...prepared.resolved.responseMeta,
  };
}

function buildDeferredIndexingResult(
  prepared: PreparedIngest,
  input: ParsedIngestRequest,
  start: number,
  message: string
) {
  return buildPreparedResponse(prepared, input, {
    jobId: null,
    embeddingModel: null,
    graphNodeId: null,
    indexingStatus: 'deferred',
    totalMs: Math.round(performance.now() - start),
    statusStep: 'deferred',
    statusProgress: 100,
    statusMessage: message,
  });
}

async function continueIngestIndexing(
  prepared: PreparedIngest,
  input: ParsedIngestRequest,
  userId: string,
  start: number,
  emit?: ProgressEmitter
) {
  const { embeddingModel, graphNodeId } = await persistPreparedIngest(
    prepared,
    input,
    userId,
    emit
  );

  return buildPreparedResponse(prepared, input, {
    jobId: null,
    embeddingModel,
    graphNodeId,
    indexingStatus: 'completed',
    totalMs: Math.round(performance.now() - start),
    statusStep: 'complete',
    statusProgress: 100,
    statusMessage: 'Ingest completed.',
  });
}

async function parseIngestRequest(request: Request): Promise<ParsedIngestRequest> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const fileEntry = formData.get('file');
    if (!(fileEntry instanceof File) || fileEntry.size === 0) {
      throw new Error('file is required');
    }

    const caseIdValue = formData.get('caseId');
    const titleValue = formData.get('title');
    return {
      kind: 'file',
      file: fileEntry,
      caseId:
        typeof caseIdValue === 'string' && caseIdValue.trim().length > 0
          ? caseIdValue.trim()
          : undefined,
      title:
        typeof titleValue === 'string' && titleValue.trim().length > 0
          ? titleValue.trim()
          : undefined,
    };
  }

  const rawBody = await request.json();
  const ingestParsed = aceIngestSchema.safeParse(rawBody);
  if (!ingestParsed.success) {
    throw new Error(ingestParsed.error.issues[0]?.message ?? 'Invalid input');
  }

  return {
    kind: 'url',
    url: ingestParsed.data.url,
    caseId: ingestParsed.data.caseId,
    title: ingestParsed.data.title,
  };
}

async function ingestSource(
  input: ParsedIngestRequest,
  userId: string,
  start: number,
  emit?: ProgressEmitter
) {
  const prepared = await prepareIngest(input, start, emit);
  const { embeddingModel, graphNodeId } = await persistPreparedIngest(
    prepared,
    input,
    userId,
    emit
  );

  return buildPreparedResponse(prepared, input, {
    embeddingModel,
    graphNodeId,
    indexingStatus: 'completed',
    totalMs: Math.round(performance.now() - start),
  });
}

async function persistPreparedIngest(
  prepared: PreparedIngest,
  input: ParsedIngestRequest,
  userId: string,
  emit?: ProgressEmitter
) {
  const chunkTexts = prepared.chunks.map((chunk) => chunk.text);
  const batchSize = 16;
  const allVectors: number[][] = [];
  let embeddingModel = '';

  for (let index = 0; index < chunkTexts.length; index += batchSize) {
    const batch = chunkTexts.slice(index, index + batchSize);
    const result = await generateEmbeddingsForAce(batch);
    allVectors.push(...result.vectors);
    if (!embeddingModel) embeddingModel = result.model;
    emit?.(
      'embedding',
      0.4 + (0.3 * Math.min(index + batchSize, chunkTexts.length)) / chunkTexts.length,
      {
        embedded: allVectors.length,
        total: chunkTexts.length,
      }
    );
  }

  emit?.('storing', 0.75);
  const points = buildPoints(prepared.chunks, allVectors, prepared.resolved, input.caseId, userId);
  await qdrant.client.upsert(qdrant.collections.documents, { wait: true, points });

  emit?.('graph', 0.85);
  const graphNodeId = await createGraphNode(
    prepared.chunks,
    input.caseId,
    prepared.resolved.docTitle,
    prepared.resolved.sourceDomain,
    prepared.resolved.sourceUrl,
    prepared.resolved.sourceHash,
    userId,
    prepared.resolved.plainText,
    allVectors,
    prepared.resolved.documentType,
    prepared.resolved.filePath,
    prepared.resolved.fileType
  );

  if (graphNodeId && input.caseId) {
    emit?.('neo4j_sync', 0.9);
    import('$lib/server/graph/pg-neo4j-sync.js')
      .then(({ syncIngestedContent }) =>
        syncIngestedContent(
          graphNodeId,
          input.caseId!,
          prepared.resolved.docTitle,
          prepared.resolved.sourceUrl
        )
      )
      .catch(() => {
        /* non-fatal */
      });
  }

  return { embeddingModel, graphNodeId };
}

async function resolveUrlSource(
  input: Extract<ParsedIngestRequest, { kind: 'url' }>,
  emit?: ProgressEmitter
): Promise<ResolvedIngestSource> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only http/https URLs are supported');
    }
  } catch {
    throw new Error('Invalid URL');
  }

  // SSRF protection: block internal/private IPs and cloud metadata
  const { validateExternalUrl } = await import('$lib/server/security/url-validator.js');
  const urlCheck = validateExternalUrl(input.url);
  if (!urlCheck.valid) {
    throw new Error(urlCheck.error ?? 'URL not allowed');
  }

  emit?.('fetching', 0.1, { url: input.url });
  const fetchRes = await fetch(input.url, {
    headers: {
      'User-Agent': 'ACE-Ingest/1.0 (Legal AI Research)',
      Accept: 'text/html, application/xhtml+xml, text/plain',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!fetchRes.ok) {
    throw new Error(`Fetch failed: HTTP ${fetchRes.status}`);
  }

  const contentType = fetchRes.headers.get('content-type') ?? '';
  const rawHtml = await fetchRes.text();
  if (!rawHtml || rawHtml.length < 50) {
    throw new Error('Page returned empty or very short content');
  }

  const plainText = stripHtml(rawHtml, contentType.includes('text/plain'));
  if (plainText.length < MIN_EXTRACTED_TEXT_LENGTH) {
    throw new Error('No extractable text content found');
  }

  return {
    plainText,
    docTitle: input.title || extractTitle(rawHtml) || parsedUrl.hostname,
    sourceHash: createHash('sha256').update(input.url).digest('hex').slice(0, 12),
    sourceUrl: input.url,
    sourceDomain: parsedUrl.hostname,
    documentType: 'web_ingest',
    filePath: `web:${parsedUrl.hostname}`,
    fileType: contentType || 'text/html',
  };
}

async function resolveFileSource(
  input: Extract<ParsedIngestRequest, { kind: 'file' }>,
  emit?: ProgressEmitter
): Promise<ResolvedIngestSource> {
  emit?.('extracting', 0.1, {
    filename: input.file.name,
    mimeType: input.file.type || 'application/octet-stream',
  });
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const extraction = await extractUploadedFile(input.file, buffer);
  if (extraction.text.trim().length < MIN_EXTRACTED_TEXT_LENGTH) {
    throw new Error('No extractable text content found in file');
  }

  const sourceKey = `${input.file.name}:${input.file.size}:${input.file.lastModified}`;
  return {
    plainText: extraction.text,
    docTitle: input.title || input.file.name,
    sourceHash: createHash('sha256').update(sourceKey).digest('hex').slice(0, 12),
    sourceUrl: `ace-file:${encodeURIComponent(input.file.name)}`,
    sourceDomain: 'local-file',
    documentType: extraction.documentType,
    filePath: `upload:${input.file.name}`,
    fileType: input.file.type || getFileExtension(input.file.name) || 'application/octet-stream',
    resultMeta: {
      extraction_method: extraction.method,
      yolo_labels: extraction.yolo?.objectLabels ?? null,
      layout_regions: extraction.yolo?.layoutRegions ?? null,
    },
    responseMeta: {
      extractionMethod: extraction.method,
      yoloLabels: extraction.yolo?.objectLabels ?? [],
      layoutRegions: extraction.yolo?.layoutRegions ?? [],
    },
  };
}

async function extractUploadedFile(
  file: File,
  buffer: Buffer
): Promise<{ text: string; method: string; documentType: string; yolo?: YoloSummary }> {
  const fileName = file.name;
  const mimeType = file.type || undefined;

  if (pdfFilePattern.test(fileName)) {
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
          return { text: doclingResult.fullText, method: 'docling', documentType: 'pdf_ingest' };
        }
      }
    } catch (error) {
      console.warn('[ace/ingest] Docling PDF extraction failed:', error);
    }

    try {
      const pdfParse = (await import('pdf-parse')).default;
      const parsed = await pdfParse(buffer);
      const text = parsed.text?.trim() ?? '';
      if (text.length >= MIN_PDF_TEXT_LENGTH) {
        return { text, method: 'pdf-parse', documentType: 'pdf_ingest' };
      }

      // Scanned PDF — try Granite-Docling (renders pages to images)
      try {
        const { isGraniteDoclingAvailable, analyzePdfWithGraniteDocling } =
          await import('$lib/server/analysis/granite-docling.js');
        if (await isGraniteDoclingAvailable()) {
          const gdResult = await analyzePdfWithGraniteDocling(buffer);
          if (gdResult.fullText.trim().length >= MIN_PDF_TEXT_LENGTH) {
            return { text: gdResult.fullText, method: 'granite-docling-pdf', documentType: 'pdf_ingest' };
          }
        }
      } catch (gdErr) {
        console.warn('[ace/ingest] Granite-Docling PDF failed:', gdErr);
      }

      const ocrResult = await extractTextHybrid(buffer, fileName);
      if (ocrResult.text.trim().length > text.length) {
        return {
          text: ocrResult.text,
          method: `ocr-${ocrResult.method}`,
          documentType: 'pdf_ingest',
        };
      }

      return { text, method: 'pdf-parse', documentType: 'pdf_ingest' };
    } catch (error) {
      console.warn('[ace/ingest] PDF parse failed, trying OCR:', error);
      const ocrResult = await extractTextHybrid(buffer, fileName);
      return {
        text: ocrResult.text,
        method: `ocr-${ocrResult.method}`,
        documentType: 'pdf_ingest',
      };
    }
  }

  if (imageFilePattern.test(fileName) || mimeType?.startsWith('image/')) {
    // Try Granite-Docling first for layout-aware document understanding
    try {
      const { isGraniteDoclingAvailable, analyzeImageWithGraniteDocling } =
        await import('$lib/server/analysis/granite-docling.js');
      if (await isGraniteDoclingAvailable()) {
        const gdResult = await analyzeImageWithGraniteDocling(buffer);
        if (gdResult.fullText.trim().length >= MIN_PDF_TEXT_LENGTH) {
          const yolo = await analyzeImageWithYolo(buffer, fileName);
          return {
            text: gdResult.fullText,
            method: 'granite-docling',
            documentType: 'image_ingest',
            yolo,
          };
        }
      }
    } catch (err) {
      console.warn('[ace/ingest] Granite-Docling failed, falling back to OCR:', err);
    }

    const ocrResult = await extractTextHybrid(buffer, fileName);
    const yolo = await analyzeImageWithYolo(buffer, fileName);
    return {
      text: ocrResult.text,
      method: `ocr-${ocrResult.method}`,
      documentType: 'image_ingest',
      yolo,
    };
  }

  if (textFilePattern.test(fileName) || mimeType?.startsWith('text/')) {
    return { text: buffer.toString('utf-8'), method: 'utf8', documentType: 'text_ingest' };
  }

  throw new Error(
    'Unsupported file type. Upload PDF, TXT, Markdown, JSON, CSV, HTML, or image files.'
  );
}

async function analyzeImageWithYolo(
  buffer: Buffer,
  fileName: string
): Promise<YoloSummary | undefined> {
  try {
    const yolo = createYOLOService();
    if (!(await yolo.isModelAvailable())) {
      return undefined;
    }

    const result = await yolo.analyzeDocument(buffer, fileName);
    return {
      objectLabels: [...new Set((result.objects ?? []).map((item) => item.class))],
      layoutRegions: [...new Set((result.layout?.regions ?? []).map((region) => region.type))],
    };
  } catch (error) {
    console.warn('[ace/ingest] YOLO analysis failed:', error);
    return undefined;
  }
}

function getFileExtension(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName);
  return match?.[0].toLowerCase() ?? '';
}

/** Build Qdrant points array from chunks + vectors. */
function buildPoints(
  chunks: LegalChunk[],
  allVectors: number[][],
  resolved: ResolvedIngestSource,
  caseId: string | undefined,
  userId: string
) {
  return chunks.map((chunk, idx) => {
    const chunkId = `ace-${resolved.sourceHash}-${idx}`;
    return {
      id: deterministicPointId(chunkId),
      vector: { content: allVectors[idx] },
      payload: {
        title: resolved.docTitle,
        content_preview: chunk.text.substring(0, 500),
        full_text: chunk.text,
        document_type: resolved.documentType,
        source_url: resolved.sourceUrl,
        source_hash: resolved.sourceHash,
        source_domain: resolved.sourceDomain,
        case_id: caseId || null,
        chunk_index: idx,
        total_chunks: chunks.length,
        section_path: chunk.sectionPath,
        heading: chunk.heading,
        citations_found: chunk.citations,
        token_count: chunk.tokenCount,
        file_path: resolved.filePath,
        file_type: resolved.fileType,
        ...resolved.resultMeta,
        ingested_by: userId,
        ingested_at: new Date().toISOString(),
      },
    };
  });
}

/** Create KAG graph node + auto-discover connections. Returns nodeId or null. */
async function createGraphNode(
  chunks: LegalChunk[],
  caseId: string | undefined,
  docTitle: string,
  hostname: string,
  sourceUrl: string,
  sourceHash: string,
  userId: string,
  plainText: string,
  allVectors: number[][],
  documentType: string,
  filePath: string,
  fileType: string
): Promise<string | null> {
  if (!caseId) return null;

  try {
    const allCitations = chunks.flatMap((c) => c.citations ?? []);
    const uniqueCitations = [...new Set(allCitations)].slice(0, 20);

    const [node] = await db
      .insert(yorhaEvidenceNodes)
      .values({
        case_id: caseId,
        title: docTitle,
        description: `ACE-ingested ${documentType.replace(/_/g, ' ')} from ${hostname}. ${chunks.length} chunks, ${chunks.reduce((s, c) => s + c.tokenCount, 0)} tokens.`,
        evidence_type: documentType,
        source: sourceUrl,
        file_path: filePath || `ace:${sourceHash}`,
        file_type: fileType,
        ai_tags: uniqueCitations.length > 0 ? uniqueCitations : null,
        key_entities:
          uniqueCitations.length > 0 ? { citations: uniqueCitations, domain: hostname } : null,
        relevance_score: 50,
        status: 'active',
        created_by: Number(userId),
      })
      .returning({ id: yorhaEvidenceNodes.id });

    const graphNodeId = node?.id ?? null;

    // Auto-discover related evidence via Qdrant similarity
    if (graphNodeId && allVectors.length > 0) {
      try {
        const { results: similar } = await qdrant.hybridSearch({
          collection: 'evidence_items',
          query: plainText.slice(0, 300),
          queryEmbedding: allVectors[0],
          limit: 5,
          scoreThreshold: 0.65,
        });

        for (const hit of similar) {
          const evidenceId = (hit.payload as Record<string, unknown>)?.evidence_id;
          if (!evidenceId) continue;

          const existingNodes = await db
            .execute(
              sql`
						SELECT id FROM yorha_evidence_nodes
						WHERE case_id = ${caseId}
						AND (source ILIKE ${'%' + evidenceId + '%'} OR id::text = ${evidenceId})
						LIMIT 1
					`
            )
            .catch(() => ({ rows: [] }));

          const targetId = String((existingNodes.rows[0] as Record<string, unknown>)?.id ?? '');
          if (targetId && targetId !== graphNodeId) {
            await db
              .insert(yorhaEvidenceConnections)
              .values({
                case_id: caseId,
                source_node_id: graphNodeId,
                target_node_id: targetId,
                connection_type: 'semantic_similarity',
                strength: Math.round((hit.score ?? 0.5) * 100),
                description: `Auto-discovered similarity between ingested source and existing evidence`,
                confidence_score: Math.round((hit.score ?? 0.5) * 100),
                created_by: Number(userId),
              })
              .onConflictDoNothing();
          }
        }
      } catch (e) {
        console.warn('[ace/ingest] Connection discovery failed:', (e as Error).message);
      }
    }

    return graphNodeId;
  } catch (e) {
    console.warn('[ace/ingest] Graph node creation failed:', (e as Error).message);
    return null;
  }
}

/**
 * Strip HTML tags, scripts, styles, and normalize whitespace.
 * For text/plain content, just normalize whitespace.
 */
function stripHtml(html: string, isPlainText: boolean): string {
	if (isPlainText) {
		return html.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
	}

	let text = html;
	text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
	text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
	text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
	text = text.replace(/<!--[\s\S]*?-->/g, '');
	text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n');
	text = text.replace(/<br\s*\/?>/gi, '\n');
	text = text.replace(/<[^>]+>/g, ' ');
	text = text.replace(/&amp;/g, '&');
	text = text.replace(/&lt;/g, '<');
	text = text.replace(/&gt;/g, '>');
	text = text.replace(/&quot;/g, '"');
	text = text.replace(/&#39;/g, "'");
	text = text.replace(/&nbsp;/g, ' ');
	text = text.replace(/[ \t]+/g, ' ');
	text = text.replace(/\n[ \t]+/g, '\n');
	text = text.replace(/\n{3,}/g, '\n\n');
	return text.trim();
}

/**
 * Extract <title> from HTML.
 */
function extractTitle(html: string): string | null {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (!match) return null;
	const title = match[1].replace(/<[^>]+>/g, '').trim();
	return title.length > 0 && title.length < 200 ? title : null;
}
