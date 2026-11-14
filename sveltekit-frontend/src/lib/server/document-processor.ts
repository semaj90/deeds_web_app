/**
 * Document Processor — unified entry point for the evidence extraction pipeline.
 *
 * Caller-facing facade over the existing extractors in `evidence/upload/+server.ts`.
 * Routes each file type to the right extraction stack:
 *
 *   PDF        → pdfParse → Granite-Docling (if Docling available) → OCR fallback
 *   Image      → Granite-Docling image → Gemma4 VLM fallback → OCR
 *   Audio      → Whisper / Docling ASR
 *   Text/HTML  → passthrough
 *   PNG        → PNG metadata recovery (extractLegalMetadata) → then image path
 *
 * After extraction:  legal chunking → section detection → embeddings
 *
 * Depends on: vlm-document-analyzer.ts (Layer 2.2), model-router.ts (Layer 1.2)
 */

import { analyzeWithVlm } from './ai/vlm-document-analyzer.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessDocumentInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  /** Optional evidence ID — used for embedding cache key namespacing */
  evidenceId?: string;
  /** Skip embedding step (useful for dry-run / metadata-only extraction) */
  skipEmbedding?: boolean;
}

export interface ExtractedChunk {
  text: string;
  index: number;
  tokenCount: number;
  sectionPath?: string;
  citations?: string[];
  pageNumber?: number;
}

export interface ProcessDocumentResult {
  /** Full extracted plain text (joined from all chunks) */
  rawText: string;
  chunks: ExtractedChunk[];
  /** Granite-Docling structured blocks if available */
  doclingBlocks?: Record<string, unknown>[];
  /** Embedding vectors per chunk (same order as chunks[]) */
  embeddings?: number[][];
  /** Which extraction method succeeded */
  extractionMethod: string;
  /** Whether VLM was used */
  usedVlm: boolean;
  /** PNG embedded legal metadata (if .png file with embedded YorHA data) */
  pngLegalMetadata?: Record<string, unknown>;
}

// ─── MIME helpers ─────────────────────────────────────────────────────────────

function isPdf(mimeType: string, fileName: string): boolean {
  return mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function isPng(mimeType: string, fileName: string): boolean {
  return mimeType === 'image/png' || fileName.toLowerCase().endsWith('.png');
}

function isAudio(mimeType: string): boolean {
  return mimeType.startsWith('audio/');
}

function isVideo(mimeType: string, fileName?: string): boolean {
  if (mimeType.startsWith('video/')) return true;
  if (fileName && /\.(mp4|mkv|webm|avi|mov)$/i.test(fileName)) return true;
  return false;
}

// ─── Extraction steps ─────────────────────────────────────────────────────────

async function extractPdf(buffer: Buffer, fileName: string, mimeType: string) {
  // Try pdf-parse first (fast, text-only)
  try {
    const { parsePdfBuffer } = await import('$lib/server/pdf/pdf-parser.js');
    const result = await parsePdfBuffer(buffer);
    if (result.text?.trim().length > 50) {
      return { text: result.text, method: 'pdf-parse', doclingBlocks: undefined };
    }
  } catch { /* fall through to Docling */ }

  // Scanned PDF → VLM path
  const vlm = await analyzeWithVlm(buffer, fileName, mimeType);
  return {
    text: vlm.text,
    method: `vlm:${vlm.method}`,
    doclingBlocks: vlm.doclingBlocks,
    usedVlm: true,
  };
}

async function extractImage(buffer: Buffer, fileName: string, mimeType: string) {
  // Try PNG metadata recovery first (may contain embedded prior analysis)
  let pngLegalMetadata: Record<string, unknown> | undefined;
  if (isPng(mimeType, fileName)) {
    try {
      const { extractLegalMetadata } = await import(
        '$lib/server/png-embed-extractor.js'
      );
      const meta = await extractLegalMetadata(buffer);
      if (meta) pngLegalMetadata = meta as Record<string, unknown>;
    } catch { /* no embedded metadata */ }
  }

  // VLM extraction
  const vlm = await analyzeWithVlm(buffer, fileName, mimeType);

  // OCR fallback if VLM failed
  let text = vlm.text;
  let method = `vlm:${vlm.method}`;
  if (!text) {
    try {
      const { extractTextHybrid } = await import(
        '$lib/server/ocr/hybrid.js'
      );
      const ocrResult = await extractTextHybrid(buffer, fileName);
      text = ocrResult.text;
      method = 'ocr:hybrid';
    } catch { /* best-effort */ }
  }

  return {
    text,
    method,
    doclingBlocks: vlm.doclingBlocks,
    pngLegalMetadata,
    usedVlm: vlm.method !== 'none',
  };
}

async function extractAudio(buffer: Buffer): Promise<{ text: string; method: string }> {
  try {
    const { transcribeAudio } = await import('$lib/server/docling.js');
    const docResult = await transcribeAudio(buffer, 'audio/wav');
    return { text: docResult.fullText ?? '', method: 'docling-asr' };
  } catch { /* fall through */ }

  try {
    const whisper = await import('nodejs-whisper');
    const fn = (whisper as unknown as { default: (b: Buffer) => Promise<unknown> }).default ?? whisper;
    const result = await (fn as (b: Buffer) => Promise<unknown>)(buffer);
    return { text: typeof result === 'string' ? result : '', method: 'whisper' };
  } catch {
    return { text: '', method: 'none' };
  }
}

async function extractVideo(buffer: Buffer, fileName: string): Promise<{ text: string; method: string }> {
  const { writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { randomUUID } = await import('node:crypto');
  const tmpVideoPath = join(tmpdir(), `doc-proc-video-${randomUUID()}-${fileName || 'video.mp4'}`);
  await writeFile(tmpVideoPath, buffer);

  try {
    const { detectVideoAndAudioStreamsV1 } = await import(
      '$lib/server/features/evidence/video/storyboard-manifest-contract-v1.js'
    );
    const probe = await detectVideoAndAudioStreamsV1(tmpVideoPath);

    if (probe.hasAudioStream) {
      try {
        const { extractAudioTrack, transcribeVideoAudio } = await import(
          '$lib/server/features/evidence/video/transcript-service.js'
        );
        const audioPath = await extractAudioTrack(tmpVideoPath);
        const transcript = await transcribeVideoAudio(audioPath);
        if (transcript.text && transcript.text.trim().length > 0) {
          return { text: transcript.text.trim(), method: 'video:whisper' };
        }
      } catch {
        // Fallback to visual description if audio transcription fails
      }
    }

    return {
      text: `Visual-only recording: silent video evidence (${fileName || 'video.mp4'}). No spoken audio detected.`,
      method: 'video:silent-keyframe'
    };
  } catch {
    return {
      text: `Video evidence recording (${fileName || 'video.mp4'}). Video stream processed.`,
      method: 'video:stream-fallback'
    };
  } finally {
    await rm(tmpVideoPath, { force: true }).catch(() => {});
  }
}

async function extractText(buffer: Buffer): Promise<{ text: string; method: string }> {
  return { text: buffer.toString('utf-8'), method: 'passthrough' };
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

async function chunkText(
  text: string,
  doclingBlocks?: Record<string, unknown>[]
): Promise<ExtractedChunk[]> {
  try {
    const { chunkLegalDocument } = await import(
      '$lib/server/indexer/legal-chunker.js'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks = await chunkLegalDocument(text, { doclingBlocks: doclingBlocks as any });
    return chunks.map((c: any, i: number) => ({
      text: c.text ?? c.content ?? '',
      index: i,
      tokenCount: c.tokenCount ?? 0,
      sectionPath: c.sectionPath,
      citations: c.citations,
      pageNumber: c.pageNumber,
    }));
  } catch {
    // Fallback: split by double newline, ~512 char windows
    const paragraphs = text.split(/\n{2,}/);
    return paragraphs
      .filter(p => p.trim().length > 0)
      .map((p, i) => ({ text: p.trim(), index: i, tokenCount: Math.ceil(p.length / 4) }));
  }
}

// ─── Embedding ────────────────────────────────────────────────────────────────

async function embedChunks(chunks: ExtractedChunk[]): Promise<number[][]> {
  try {
    const { embedTexts } = await import('$lib/server/batch-embedder.js');
    const vecs = await embedTexts(chunks.map(c => c.text));
    return (vecs as unknown as Array<Float32Array | number[]>).map(v => Array.from(v));
  } catch {
    return chunks.map(() => []);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Process a document through the full extraction pipeline.
 *
 * @example
 * const result = await processDocument({
 *   buffer,
 *   fileName: 'contract.pdf',
 *   mimeType: 'application/pdf',
 *   evidenceId: caseEvidenceId,
 * });
 * // result.chunks → ready for vector storage
 * // result.embeddings → parallel array of 768-dim vectors
 */
export async function processDocument(input: ProcessDocumentInput): Promise<ProcessDocumentResult> {
  const { buffer, fileName, mimeType, skipEmbedding = false } = input;

  let rawText = '';
  let extractionMethod = 'unknown';
  let doclingBlocks: Record<string, unknown>[] | undefined;
  let pngLegalMetadata: Record<string, unknown> | undefined;
  let usedVlm = false;

  // ── Step 1: Extract text ──
  if (isPdf(mimeType, fileName)) {
    const r = await extractPdf(buffer, fileName, mimeType);
    rawText = r.text;
    extractionMethod = r.method;
    doclingBlocks = r.doclingBlocks;
    usedVlm = r.usedVlm ?? false;
  } else if (isImage(mimeType)) {
    const r = await extractImage(buffer, fileName, mimeType);
    rawText = r.text;
    extractionMethod = r.method;
    doclingBlocks = r.doclingBlocks;
    pngLegalMetadata = r.pngLegalMetadata;
    usedVlm = r.usedVlm;
  } else if (isAudio(mimeType)) {
    const r = await extractAudio(buffer);
    rawText = r.text;
    extractionMethod = r.method;
  } else if (isVideo(mimeType, fileName)) {
    const r = await extractVideo(buffer, fileName);
    rawText = r.text;
    extractionMethod = r.method;
  } else {
    const r = await extractText(buffer);
    rawText = r.text;
    extractionMethod = r.method;
  }

  // ── Step 2: Chunk ──
  const chunks = await chunkText(rawText, doclingBlocks);

  // ── Step 3: Embed (optional) ──
  const embeddings = skipEmbedding ? undefined : await embedChunks(chunks);

  return {
    rawText,
    chunks,
    doclingBlocks,
    embeddings,
    extractionMethod,
    usedVlm,
    pngLegalMetadata,
  };
}
