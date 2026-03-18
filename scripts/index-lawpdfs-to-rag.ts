/**
 * Legal-aware indexer for lawpdfs/
 *
 * Full RAG pipeline — self-contained (no $lib aliases):
 * - Direct postgres.js for DB writes
 * - Direct Ollama HTTP for embeddings (768-dim)
 * - Direct Qdrant HTTP for vector upsert
 * - Direct MinIO SDK for file upload
 *
 * Pipeline per file:
 *  1. Hash + dedupe check
 *  2. Upload to MinIO
 *  3. Create evidence record
 *  4. Parse PDF page-by-page (pdfjs-dist)
 *  5. Legal-aware chunking (Article/Section/§) or generic fallback
 *  6. Insert evidence_chunks
 *  7. Dual-write to legacy statutes + statute_chunks
 *  8. Build legal tree (library_documents + legal_nodes)
 *  9. Create legal_chunks with embeddings (the searchable data)
 * 10. Upsert to Qdrant for ANN search
 *
 * Usage:
 *   npx tsx scripts/index-lawpdfs-to-rag.ts
 */

import { readdir, stat, readFile, access } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { createHash } from 'crypto';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

// ── Direct connections (no $lib aliases) ─────────────────────────────────

// @ts-ignore — postgres.js default export
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';

const sql = postgres(DATABASE_URL, { max: 5, idle_timeout: 30 });

// ── Path resolution ──────────────────────────────────────────────────────

const __filename_resolved = fileURLToPath(import.meta.url);
const __dirname_resolved = dirname(__filename_resolved);
const REPO_ROOT = join(__dirname_resolved, '..');
const LAWPDFS_DIR = join(REPO_ROOT, 'lawpdfs');

const DEFAULT_CASE_ID = '00000000-0000-0000-0000-000000000001';
const MINIO_BUCKET = 'evidence';

// ── Types ────────────────────────────────────────────────────────────────

interface IndexResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ file: string; error: string }>;
  stats: {
    evidenceRows: number;
    evidenceChunks: number;
    statutes: number;
    statuteChunks: number;
    libraryDocs: number;
    legalNodes: number;
    legalChunks: number;
    embeddings: number;
    qdrantPoints: number;
  };
}

interface ParsedPdfPage {
  pageNumber: number;
  text: string;
}

interface ParsedPdfResult {
  totalPages: number;
  fullText: string;
  pages: ParsedPdfPage[];
}

interface GenericChunk {
  text: string;
  chunkIndex: number;
  sectionPath: string[];
  heading: string;
  startOffset: number;
  endOffset: number;
  tokenCount: number;
  citations: string[];
  pageStart?: number;
  pageEnd?: number;
}

interface LegalSection {
  heading: string;
  text: string;
  level: number;
  startOffset: number;
  endOffset: number;
  children: LegalSection[];
  path?: string[];
}

// Running stats
const STATS = {
  evidenceRows: 0,
  evidenceChunks: 0,
  statutes: 0,
  statuteChunks: 0,
  libraryDocs: 0,
  legalNodes: 0,
  legalChunks: 0,
  embeddings: 0,
  qdrantPoints: 0,
};

// ── Ollama Embedding Client ──────────────────────────────────────────────

/**
 * Generate embeddings via Ollama HTTP API.
 * Uses batch /api/embed endpoint, falls back to sequential /api/embeddings.
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Batch endpoint (preferred)
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts.map(t => t.slice(0, 2048)), // Truncate to model's max
        keep_alive: '24h',
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.embeddings && data.embeddings.length === texts.length) {
        STATS.embeddings += texts.length;
        return data.embeddings;
      }
    }
  } catch {
    // Fall through to sequential
  }

  // Sequential fallback
  const results: number[][] = [];
  for (const text of texts) {
    try {
      const resp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          prompt: text.slice(0, 2048),
          keep_alive: '24h',
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.embedding) {
          results.push(data.embedding);
          STATS.embeddings++;
          continue;
        }
      }
    } catch {
      // Skip this text
    }
    results.push([]); // Empty embedding for failed texts
  }
  return results;
}

async function generateSingleEmbedding(text: string): Promise<number[] | null> {
  const [embedding] = await generateEmbeddings([text]);
  return embedding && embedding.length > 0 ? embedding : null;
}

// ── Qdrant Client ────────────────────────────────────────────────────────

function deterministicPointId(key: string): number {
  const hash = createHash('md5').update(key).digest();
  const raw = hash.readUInt32BE(0);
  return raw % 2147483648; // Positive int32
}

async function qdrantUpsertBatch(
  collection: string,
  points: Array<{ id: number; vector: Record<string, number[]>; payload: Record<string, unknown> }>
): Promise<number> {
  if (points.length === 0) return 0;

  // Ensure collection exists
  try {
    const checkResp = await fetch(`${QDRANT_URL}/collections/${collection}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!checkResp.ok) {
      // Create collection
      await fetch(`${QDRANT_URL}/collections/${collection}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: {
            content: { size: 768, distance: 'Cosine' },
          },
          on_disk_payload: true,
          quantization_config: {
            scalar: { type: 'int8', quantile: 0.99, always_ram: true },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      console.log(`  Created Qdrant collection: ${collection}`);
    }
  } catch {
    console.warn(`  Qdrant unavailable — skipping vector upsert`);
    return 0;
  }

  // Batch upsert (50 points per batch)
  let upserted = 0;
  const batchSize = 50;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    try {
      const resp = await fetch(`${QDRANT_URL}/collections/${collection}/points?wait=false`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: batch }),
        signal: AbortSignal.timeout(30_000),
      });
      if (resp.ok) {
        upserted += batch.length;
      }
    } catch {
      console.warn(`  Qdrant batch upsert failed for batch ${i / batchSize}`);
    }
  }

  STATS.qdrantPoints += upserted;
  return upserted;
}

// ── MinIO Upload (optional) ──────────────────────────────────────────────

async function tryUploadToMinio(filepath: string, filename: string): Promise<string> {
  const objectName = `lawpdfs/${safeSlug(filename)}${extname(filename).toLowerCase() || '.pdf'}`;

  try {
    const mod = await import('../sveltekit-frontend/src/lib/server/minio-client');
    const fileBuffer = await readFile(filepath);
    await mod.uploadFile(MINIO_BUCKET, objectName, fileBuffer as Buffer, {
      'Content-Type': 'application/pdf',
    });
    console.log(`  Uploaded to MinIO: ${MINIO_BUCKET}/${objectName}`);
  } catch {
    console.warn(`  MinIO unavailable — using placeholder path`);
  }

  return objectName;
}

// ── Utility functions ────────────────────────────────────────────────────

function normalizeFilename(filename: string): string {
  return filename.replace(/\s+/g, ' ').trim();
}

function safeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function computeFileHash(filepath: string): Promise<string> {
  const data = await readFile(filepath);
  return createHash('sha256').update(data).digest('hex');
}

function extractJurisdiction(filename: string): string {
  const lower = filename.toLowerCase();
  if (
    lower.includes('california') ||
    lower.includes('ca constitution') ||
    lower.includes('ca_constitution') ||
    /\bca\b/.test(lower)
  ) return 'CA';
  if (lower.includes('texas') || /\btx\b/.test(lower)) return 'TX';
  if (lower.includes('new york') || /\bny\b/.test(lower)) return 'NY';
  if (lower.includes('washington')) return 'WA';
  if (lower.includes('kentucky')) return 'KY';
  if (
    lower.includes('federal') ||
    lower.includes('usdoj') ||
    lower.includes('u.s.') ||
    lower.includes('usc') ||
    lower.includes('united states') ||
    lower.includes('us_constitution')
  ) return 'Fed-US';
  return 'Other';
}

function extractTags(filename: string): string[] {
  const tags = new Set<string>();
  const lower = filename.toLowerCase();

  if (lower.includes('constitution')) tags.add('constitution');
  if (lower.includes('code')) tags.add('statute');
  if (lower.includes('bill text')) tags.add('legislation');
  if (lower.includes('court of appeal')) tags.add('case-law');
  if (lower.includes('people v.')) tags.add('criminal-case');
  if (lower.includes('regulation')) tags.add('regulation');
  if (lower.includes('legislative') && lower.includes('index')) tags.add('legislative-index');
  if (lower.includes('legislative') && lower.includes('digest')) tags.add('legislative-digest');
  if (lower.includes('trafficking')) tags.add('human-trafficking');
  if (lower.includes('sexual abuse') || lower.includes('sex offender')) tags.add('sexual-abuse');
  if (lower.includes('child')) tags.add('child-related');
  if (lower.includes('federal prison') || lower.includes('correctional')) tags.add('corrections');
  if (lower.includes('habeas corpus')) tags.add('habeas-corpus');
  if (lower.includes('insider trading')) tags.add('insider-trading');
  if (lower.includes('fraud')) tags.add('fraud');
  if (lower.includes('obstruction')) tags.add('obstruction');

  const jurisdiction = extractJurisdiction(filename);
  if (jurisdiction === 'CA') tags.add('california');
  if (jurisdiction === 'TX') tags.add('texas');
  if (jurisdiction === 'NY') tags.add('new-york');
  if (jurisdiction === 'WA') tags.add('washington');
  if (jurisdiction === 'KY') tags.add('kentucky');
  if (jurisdiction === 'Fed-US') tags.add('federal');

  return [...tags];
}

function detectCorpusType(tags: string[]): string {
  if (tags.includes('constitution')) return 'constitution';
  if (tags.includes('statute')) return 'statute';
  if (tags.includes('case-law') || tags.includes('criminal-case')) return 'case';
  if (tags.includes('legislation')) return 'bill';
  if (tags.includes('regulation')) return 'regulation';
  if (tags.includes('legislative-index') || tags.includes('legislative-digest')) return 'other';
  return 'other';
}

// ── Directory validation ─────────────────────────────────────────────────

async function ensureLawpdfsDirExists(): Promise<void> {
  try {
    await access(LAWPDFS_DIR, fsConstants.R_OK);
  } catch {
    throw new Error(`lawpdfs directory not found at: ${LAWPDFS_DIR}`);
  }
}

// ── Dedupe check ─────────────────────────────────────────────────────────

async function checkExistingEvidence(
  filename: string,
  contentHash: string
): Promise<string | null> {
  const existing = await sql`
    SELECT id FROM evidence
    WHERE title = ${filename}
      AND (metadata->>'contentHash') = ${contentHash}
    LIMIT 1
  `;
  return existing.length > 0 ? (existing[0].id as string) : null;
}

// ── Evidence record creation ─────────────────────────────────────────────

async function createEvidenceRecord(
  filename: string,
  fileSize: number,
  minioObjectName: string,
  contentHash: string
): Promise<string> {
  const jurisdiction = extractJurisdiction(filename);
  const tags = extractTags(filename);
  const corpusType = detectCorpusType(tags);

  const metadata = {
    jurisdiction,
    corpusType,
    contentHash,
    ingestionSource: 'lawpdfs-bulk-indexer',
    originalFilename: filename,
    minioObjectName,
  };

  console.log(`  Creating evidence: ${filename}`);
  console.log(`     Jurisdiction: ${jurisdiction} | Corpus: ${corpusType} | Tags: ${tags.join(', ') || 'none'}`);

  // Generate evidence number: LP-YYYYMMDD-XXX (auto-incrementing per run)
  const evidenceNumber = `LP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(STATS.evidenceRows + 1).padStart(3, '0')}`;
  const description = `Legal document: ${corpusType} — ${jurisdiction}`;

  const result = await sql`
    INSERT INTO evidence (
      case_id, title, description, file_path, file_type, file_size,
      hash, source, metadata, tags, evidence_number, type,
      created_at, updated_at
    ) VALUES (
      ${DEFAULT_CASE_ID}, ${filename}, ${description},
      ${minioObjectName}, ${'application/pdf'}, ${fileSize},
      ${contentHash}, ${'lawpdfs-indexer'},
      ${sql.json(metadata)}, ${sql.json(tags)},
      ${evidenceNumber}, ${'document'},
      NOW(), NOW()
    )
    RETURNING id
  `;

  STATS.evidenceRows++;
  return result[0].id as string;
}

// ── PDF parsing ──────────────────────────────────────────────────────────

async function parsePdf(filepath: string): Promise<ParsedPdfResult> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const dataBuffer = await readFile(filepath);
  const uint8Array = new Uint8Array(dataBuffer);

  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const pages: ParsedPdfPage[] = [];
  let fullText = '';

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item: unknown) => {
        if (typeof item === 'object' && item !== null && 'str' in item) {
          return String((item as { str?: string }).str ?? '');
        }
        return '';
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    pages.push({ pageNumber: pageNum, text: pageText });
    fullText += `${pageText}\n\n`;
  }

  return { totalPages, fullText: fullText.trim(), pages };
}

// ── Legal chunker (with fallback) ────────────────────────────────────────

async function tryLegalChunk(fullText: string): Promise<GenericChunk[] | null> {
  try {
    const mod = await import(
      '../sveltekit-frontend/src/lib/server/indexer/legal-chunker'
    );

    if (typeof mod.chunkLegalDocument === 'function') {
      console.log('     Using legal-chunker.ts (structure-aware)');
      const chunks = mod.chunkLegalDocument(fullText, {
        maxTokens: 512,
        overlap: 128,
        minSectionLength: 30,
      });

      if (chunks.length > 0) return chunks;
      console.warn('     legal-chunker returned 0 chunks, falling back');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`     legal-chunker unavailable (${msg}), using generic splitter`);
  }
  return null;
}

async function createChunks(fullText: string): Promise<GenericChunk[]> {
  const legalChunks = await tryLegalChunk(fullText);
  if (legalChunks) return legalChunks;

  console.log('     Using generic text splitter fallback');
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ['\n\n', '\n', '. ', '; ', ' ', ''],
  });

  const textChunks = await splitter.splitText(fullText);
  return textChunks.map((text, idx) => ({
    text,
    chunkIndex: idx,
    sectionPath: [],
    heading: '',
    startOffset: 0,
    endOffset: text.length,
    tokenCount: text.split(/\s+/).length,
    citations: [],
  }));
}

// ── Page range estimation ────────────────────────────────────────────────

function estimateChunkPage(
  chunkText: string,
  pages: ParsedPdfPage[]
): { pageStart: number; pageEnd: number } {
  const needle = chunkText.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!needle) return { pageStart: 1, pageEnd: 1 };

  for (const page of pages) {
    const normalizedPage = page.text.replace(/\s+/g, ' ').trim();
    if (normalizedPage.includes(needle)) {
      return { pageStart: page.pageNumber, pageEnd: page.pageNumber };
    }
  }
  return { pageStart: 1, pageEnd: 1 };
}

// ── Step 6: Evidence chunk insertion ─────────────────────────────────────

async function insertEvidenceChunks(
  evidenceId: string,
  filename: string,
  parsed: ParsedPdfResult,
  chunks: GenericChunk[]
): Promise<number> {
  const existingResult = await sql`
    SELECT COUNT(*) as count FROM evidence_chunks WHERE evidence_id = ${evidenceId}
  `;
  if (Number(existingResult[0]?.count ?? 0) > 0) {
    console.log(`     Evidence chunks already exist — skipping`);
    return 0;
  }

  await sql`BEGIN`;
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const pageRange = chunk.pageStart
        ? { pageStart: chunk.pageStart, pageEnd: chunk.pageEnd ?? chunk.pageStart }
        : estimateChunkPage(chunk.text, parsed.pages);

      const chunkMetadata = {
        filename,
        totalPages: parsed.totalPages,
        heading: chunk.heading || null,
        sectionPath: chunk.sectionPath.length > 0 ? chunk.sectionPath : null,
        citations: chunk.citations.length > 0 ? chunk.citations : null,
        tokenCount: chunk.tokenCount,
        pageStart: pageRange.pageStart,
        pageEnd: pageRange.pageEnd,
      };

      await sql`
        INSERT INTO evidence_chunks (evidence_id, chunk_index, content, page_number, metadata)
        VALUES (${evidenceId}, ${i}, ${chunk.text}, ${pageRange.pageStart}, ${JSON.stringify(chunkMetadata)})
      `;
    }
    await sql`COMMIT`;
    STATS.evidenceChunks += chunks.length;
    return chunks.length;
  } catch (txErr) {
    await sql`ROLLBACK`;
    throw txErr;
  }
}

// ── Step 7: Legacy statutes dual-write ───────────────────────────────────

async function writeToStatutes(
  filename: string,
  fullText: string,
  chunks: GenericChunk[]
): Promise<string | null> {
  const jurisdiction = extractJurisdiction(filename);
  const tags = extractTags(filename);
  const corpusType = detectCorpusType(tags);
  const title = filename.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  try {
    const existing = await sql`SELECT id FROM statutes WHERE title = ${title} LIMIT 1`;
    if (existing.length > 0) {
      console.log(`     Statute already exists: ${existing[0].id}`);
      return existing[0].id as string;
    }

    await sql`BEGIN`;
    const statuteResult = await sql`
      INSERT INTO statutes (title, content, jurisdiction, category, created_at, updated_at)
      VALUES (${title}, ${fullText.slice(0, 50000)}, ${jurisdiction}, ${corpusType}, NOW(), NOW())
      RETURNING id
    `;
    const statuteId = statuteResult[0].id as string;

    for (let i = 0; i < chunks.length; i++) {
      await sql`
        INSERT INTO statute_chunks (statute_id, chunk_index, content, created_at)
        VALUES (${statuteId}, ${i}, ${chunks[i].text}, NOW())
      `;
    }

    await sql`COMMIT`;
    STATS.statutes++;
    STATS.statuteChunks += chunks.length;
    console.log(`  Statute written: ${statuteId} (${chunks.length} chunks)`);
    return statuteId;
  } catch (err) {
    await sql`ROLLBACK`;
    console.warn(`     Statute dual-write failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Step 8: Legal tree (library_documents + legal_nodes) ────────────────

async function resolveJurisdictionId(code: string): Promise<number | null> {
  const lower = code.toLowerCase();
  const existing = await sql`SELECT id FROM jurisdictions WHERE lower(code) = ${lower} LIMIT 1`;
  if (existing.length > 0) return existing[0].id as number;

  const nameMap: Record<string, { name: string; level: string }> = {
    'fed-us': { name: 'Federal (US)', level: 'federal' },
    'federal': { name: 'Federal', level: 'federal' },
    'ca': { name: 'California', level: 'state' },
    'tx': { name: 'Texas', level: 'state' },
    'ny': { name: 'New York', level: 'state' },
    'wa': { name: 'Washington', level: 'state' },
    'ky': { name: 'Kentucky', level: 'state' },
    'other': { name: 'Other', level: 'other' },
  };
  const info = nameMap[lower] ?? { name: code, level: 'other' };

  try {
    const inserted = await sql`
      INSERT INTO jurisdictions (code, name, level) VALUES (${lower}, ${info.name}, ${info.level})
      ON CONFLICT (code) DO NOTHING RETURNING id
    `;
    if (inserted.length > 0) return inserted[0].id as number;
    const retry = await sql`SELECT id FROM jurisdictions WHERE lower(code) = ${lower} LIMIT 1`;
    return retry.length > 0 ? (retry[0].id as number) : null;
  } catch {
    return null;
  }
}

async function buildLegalTree(
  filename: string,
  contentHash: string,
  parsed: ParsedPdfResult
): Promise<{ documentId: string | null; nodeIds: string[] }> {
  // Try to load the legal-chunker for structural parsing
  let mod;
  try {
    mod = await import('../sveltekit-frontend/src/lib/server/indexer/legal-chunker');
  } catch {
    return { documentId: null, nodeIds: [] };
  }

  if (typeof mod.parseSections !== 'function') return { documentId: null, nodeIds: [] };

  const sections: LegalSection[] = mod.parseSections(parsed.fullText);
  if (sections.length <= 1 && !sections[0]?.heading) {
    return { documentId: null, nodeIds: [] };
  }

  console.log('     Building hierarchical structure (legal_nodes)');

  const jurisdiction = extractJurisdiction(filename);
  const tags = extractTags(filename);
  const corpusType = detectCorpusType(tags);
  const title = filename.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const corpusTypeDbValue = ['constitution', 'statute', 'regulation', 'bill', 'case', 'glossary', 'treatise'].includes(corpusType)
    ? corpusType : 'other';

  try {
    await sql`BEGIN`;

    const jurisdictionId = await resolveJurisdictionId(jurisdiction);

    // Check existing
    const existingDoc = await sql`SELECT id FROM library_documents WHERE source_hash = ${contentHash} LIMIT 1`;
    if (existingDoc.length > 0) {
      await sql`COMMIT`;
      console.log(`     Library document already exists: ${existingDoc[0].id}`);
      return { documentId: existingDoc[0].id as string, nodeIds: [] };
    }

    const minioKey = `lawpdfs/${filename.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`;
    const docResult = await sql`
      INSERT INTO library_documents (
        source_type, corpus_type, jurisdiction_id, title, source_hash,
        minio_key, page_count, processing_status, source_kind,
        created_at, updated_at
      ) VALUES (
        'upload', ${corpusTypeDbValue}::corpus_type, ${jurisdictionId},
        ${title}, ${contentHash}, ${minioKey}, ${parsed.totalPages},
        'structuring'::processing_status, 'uploaded_pdf',
        NOW(), NOW()
      )
      RETURNING id
    `;
    const documentId = docResult[0].id as string;
    STATS.libraryDocs++;

    // Recursive node insertion
    const nodeIds: string[] = [];
    const typeMapping: Record<number, string> = {
      [-1]: 'section', 0: 'part', 1: 'title', 2: 'chapter', 3: 'article', 4: 'section', 5: 'subsection'
    };

    async function insertNode(seq: LegalSection, parentId: string | null, siblingOrder: number, depth: number) {
      const pageRange = estimateChunkPage(seq.text, parsed.pages);
      const nodeType = typeMapping[seq.level] || 'section';
      const cleanText = seq.text.replace(/\s+/g, ' ').trim();
      const nodePath = (seq.path ?? []).join('/') || `node-${siblingOrder}`;

      const nodeResult = await sql`
        INSERT INTO legal_nodes (
          document_id, parent_node_id, node_type, ordinal, heading, node_path, depth,
          page_start, page_end, char_start, char_end, full_text, text_clean
        ) VALUES (
          ${documentId}, ${parentId}, ${nodeType}::legal_node_type, ${String(siblingOrder)},
          ${seq.heading || 'Untitled'}, ${nodePath}, ${depth},
          ${pageRange.pageStart}, ${pageRange.pageEnd}, ${seq.startOffset}, ${seq.endOffset},
          ${seq.text}, ${cleanText}
        )
        RETURNING id
      `;
      const nodeId = nodeResult[0].id as string;
      nodeIds.push(nodeId);
      STATS.legalNodes++;

      for (let i = 0; i < seq.children.length; i++) {
        await insertNode(seq.children[i], nodeId, i, depth + 1);
      }
    }

    for (let i = 0; i < sections.length; i++) {
      await insertNode(sections[i], null, i, 0);
    }

    await sql`
      UPDATE library_documents
      SET processing_status = 'chunking'::processing_status, updated_at = NOW()
      WHERE id = ${documentId}
    `;

    await sql`COMMIT`;
    console.log(`     Saved ${nodeIds.length} nodes to legal tree (doc: ${documentId})`);
    return { documentId, nodeIds };
  } catch (err) {
    await sql`ROLLBACK`;
    console.warn(`     Legal tree failed: ${err instanceof Error ? err.message : String(err)}`);
    return { documentId: null, nodeIds: [] };
  }
}

// ── Step 9: Create legal_chunks with embeddings ─────────────────────────

/**
 * For each legal_node, chunk its text, embed it, and insert into legal_chunks.
 * This is what makes the /api/library/search endpoint work.
 */
async function createLegalChunksWithEmbeddings(
  documentId: string,
  nodeIds: string[]
): Promise<number> {
  if (nodeIds.length === 0) return 0;

  console.log(`     Creating legal_chunks with embeddings for ${nodeIds.length} nodes...`);

  // Fetch node texts
  const nodes = await sql`
    SELECT id, full_text, heading, page_start, page_end, char_start, char_end
    FROM legal_nodes
    WHERE id = ANY(${nodeIds})
    ORDER BY depth, ordinal
  `;

  // Sub-chunk each node's text (max ~500 tokens per chunk for embedding quality)
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 150,
    separators: ['\n\n', '\n', '. ', '; ', ' ', ''],
  });

  let totalChunks = 0;
  const qdrantPoints: Array<{ id: number; vector: Record<string, number[]>; payload: Record<string, unknown> }> = [];

  // Process nodes in batches of 5 for embedding efficiency
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    const nodeText = node.full_text as string;
    const nodeId = node.id as string;

    if (!nodeText || nodeText.trim().length < 20) continue;

    // Sub-chunk the node text
    const subChunks = await splitter.splitText(nodeText);
    if (subChunks.length === 0) continue;

    // Generate embeddings for all chunks of this node (batch)
    const embeddings = await generateEmbeddings(subChunks);

    // Insert legal_chunks
    await sql`BEGIN`;
    try {
      for (let ci = 0; ci < subChunks.length; ci++) {
        const chunkText = subChunks[ci];
        const embedding = embeddings[ci];
        const tokenCount = chunkText.split(/\s+/).length;

        if (embedding && embedding.length === 768) {
          // Insert with embedding
          const embeddingStr = `[${embedding.join(',')}]`;
          await sql`
            INSERT INTO legal_chunks (
              legal_node_id, chunk_index, chunk_text, token_count,
              page_start, page_end, char_start, char_end,
              embedding
            ) VALUES (
              ${nodeId}, ${ci}, ${chunkText}, ${tokenCount},
              ${node.page_start}, ${node.page_end},
              ${node.char_start}, ${node.char_end},
              ${embeddingStr}::vector
            )
            ON CONFLICT (legal_node_id, chunk_index) DO NOTHING
          `;

          // Prepare Qdrant point
          const pointKey = `legal-chunk:${nodeId}:${ci}`;
          qdrantPoints.push({
            id: deterministicPointId(pointKey),
            vector: { content: embedding },
            payload: {
              chunk_id: pointKey,
              document_id: documentId,
              node_id: nodeId,
              heading: node.heading || '',
              snippet: chunkText.slice(0, 400),
              page_start: node.page_start,
              page_end: node.page_end,
              chunk_index: ci,
              source: 'legal_library',
            },
          });
        } else {
          // Insert without embedding (FTS-only via tsv trigger)
          await sql`
            INSERT INTO legal_chunks (
              legal_node_id, chunk_index, chunk_text, token_count,
              page_start, page_end, char_start, char_end
            ) VALUES (
              ${nodeId}, ${ci}, ${chunkText}, ${tokenCount},
              ${node.page_start}, ${node.page_end},
              ${node.char_start}, ${node.char_end}
            )
            ON CONFLICT (legal_node_id, chunk_index) DO NOTHING
          `;
        }
        totalChunks++;
      }
      await sql`COMMIT`;
    } catch (err) {
      await sql`ROLLBACK`;
      console.warn(`     legal_chunks insert failed for node ${nodeId}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Progress indicator every 20 nodes
    if ((ni + 1) % 20 === 0) {
      console.log(`     ... processed ${ni + 1}/${nodes.length} nodes, ${totalChunks} chunks so far`);
    }
  }

  STATS.legalChunks += totalChunks;

  // Step 10: Upsert to Qdrant (batch)
  if (qdrantPoints.length > 0) {
    const upserted = await qdrantUpsertBatch('legal_documents', qdrantPoints);
    if (upserted > 0) {
      console.log(`     Qdrant: ${upserted} points upserted to legal_documents`);
    }
  }

  // Mark document as complete
  try {
    await sql`
      UPDATE library_documents
      SET processing_status = 'complete'::processing_status, updated_at = NOW()
      WHERE id = ${documentId}
    `;
  } catch { /* non-fatal */ }

  return totalChunks;
}

/**
 * Fallback: when legal tree fails, create legal_chunks directly from generic chunks.
 * Creates a library_document + flat legal_nodes, then chunks with embeddings.
 */
async function createFlatLegalChunks(
  filename: string,
  contentHash: string,
  parsed: ParsedPdfResult,
  chunks: GenericChunk[]
): Promise<number> {
  const jurisdiction = extractJurisdiction(filename);
  const tags = extractTags(filename);
  const corpusType = detectCorpusType(tags);
  const title = filename.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const corpusTypeDbValue = ['constitution', 'statute', 'regulation', 'bill', 'case', 'glossary', 'treatise'].includes(corpusType)
    ? corpusType : 'other';

  try {
    // Check existing
    const existingDoc = await sql`SELECT id FROM library_documents WHERE source_hash = ${contentHash} LIMIT 1`;
    if (existingDoc.length > 0) {
      return 0; // Already processed
    }

    await sql`BEGIN`;

    const jurisdictionId = await resolveJurisdictionId(jurisdiction);
    const minioKey = `lawpdfs/${filename.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`;

    const docResult = await sql`
      INSERT INTO library_documents (
        source_type, corpus_type, jurisdiction_id, title, source_hash,
        minio_key, page_count, processing_status, source_kind,
        created_at, updated_at
      ) VALUES (
        'upload', ${corpusTypeDbValue}::corpus_type, ${jurisdictionId},
        ${title}, ${contentHash}, ${minioKey}, ${parsed.totalPages},
        'chunking'::processing_status, 'uploaded_pdf',
        NOW(), NOW()
      )
      RETURNING id
    `;
    const documentId = docResult[0].id as string;
    STATS.libraryDocs++;

    // Create a single root node for flat documents
    const nodeResult = await sql`
      INSERT INTO legal_nodes (
        document_id, parent_node_id, node_type, ordinal, heading, node_path, depth,
        page_start, page_end, char_start, char_end, full_text, text_clean
      ) VALUES (
        ${documentId}, ${null}, 'document'::legal_node_type, '0',
        ${title}, 'root', 0,
        1, ${parsed.totalPages}, 0, ${parsed.fullText.length},
        ${parsed.fullText.slice(0, 100000)}, ${parsed.fullText.replace(/\s+/g, ' ').trim().slice(0, 100000)}
      )
      RETURNING id
    `;
    const rootNodeId = nodeResult[0].id as string;
    STATS.legalNodes++;

    await sql`COMMIT`;

    // Now create legal_chunks with embeddings
    const embeddingBatchSize = 8;
    let totalChunks = 0;
    const qdrantPoints: Array<{ id: number; vector: Record<string, number[]>; payload: Record<string, unknown> }> = [];

    for (let i = 0; i < chunks.length; i += embeddingBatchSize) {
      const batch = chunks.slice(i, i + embeddingBatchSize);
      const texts = batch.map(c => c.text);
      const embeddings = await generateEmbeddings(texts);

      await sql`BEGIN`;
      try {
        for (let j = 0; j < batch.length; j++) {
          const chunkIdx = i + j;
          const chunkText = batch[j].text;
          const embedding = embeddings[j];
          const tokenCount = chunkText.split(/\s+/).length;
          const pageRange = batch[j].pageStart
            ? { pageStart: batch[j].pageStart!, pageEnd: batch[j].pageEnd ?? batch[j].pageStart! }
            : estimateChunkPage(chunkText, parsed.pages);

          if (embedding && embedding.length === 768) {
            const embeddingStr = `[${embedding.join(',')}]`;
            await sql`
              INSERT INTO legal_chunks (
                legal_node_id, chunk_index, chunk_text, token_count,
                page_start, page_end, embedding
              ) VALUES (
                ${rootNodeId}, ${chunkIdx}, ${chunkText}, ${tokenCount},
                ${pageRange.pageStart}, ${pageRange.pageEnd},
                ${embeddingStr}::vector
              )
              ON CONFLICT (legal_node_id, chunk_index) DO NOTHING
            `;

            const pointKey = `legal-chunk:${rootNodeId}:${chunkIdx}`;
            qdrantPoints.push({
              id: deterministicPointId(pointKey),
              vector: { content: embedding },
              payload: {
                chunk_id: pointKey,
                document_id: documentId,
                node_id: rootNodeId,
                heading: title,
                snippet: chunkText.slice(0, 400),
                page_start: pageRange.pageStart,
                page_end: pageRange.pageEnd,
                chunk_index: chunkIdx,
                source: 'legal_library',
              },
            });
          } else {
            await sql`
              INSERT INTO legal_chunks (
                legal_node_id, chunk_index, chunk_text, token_count,
                page_start, page_end
              ) VALUES (
                ${rootNodeId}, ${chunkIdx}, ${chunkText}, ${tokenCount},
                ${pageRange.pageStart}, ${pageRange.pageEnd}
              )
              ON CONFLICT (legal_node_id, chunk_index) DO NOTHING
            `;
          }
          totalChunks++;
        }
        await sql`COMMIT`;
      } catch (err) {
        await sql`ROLLBACK`;
        console.warn(`     Flat chunk batch failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      if ((i + embeddingBatchSize) % 40 === 0 && i > 0) {
        console.log(`     ... ${totalChunks} chunks embedded so far`);
      }
    }

    STATS.legalChunks += totalChunks;

    // Qdrant upsert
    if (qdrantPoints.length > 0) {
      const upserted = await qdrantUpsertBatch('legal_documents', qdrantPoints);
      if (upserted > 0) {
        console.log(`     Qdrant: ${upserted} points upserted`);
      }
    }

    // Mark complete
    try {
      await sql`
        UPDATE library_documents
        SET processing_status = 'complete'::processing_status, updated_at = NOW()
        WHERE id = ${documentId}
      `;
    } catch { /* non-fatal */ }

    return totalChunks;
  } catch (err) {
    console.warn(`     Flat legal chunks failed: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

// ── Main pipeline per file ───────────────────────────────────────────────

async function processFile(filepath: string, filename: string): Promise<void> {
  // 1. Compute content hash for dedupe
  const contentHash = await computeFileHash(filepath);

  // 2. Check if already indexed (by source_hash in library_documents)
  const existingDoc = await sql`
    SELECT id FROM library_documents WHERE source_hash = ${contentHash} LIMIT 1
  `;
  if (existingDoc.length > 0) {
    console.log(`  Already indexed: ${existingDoc[0].id} — skipping`);
    return;
  }

  // 3. Upload to MinIO (optional)
  const minioObjectName = await tryUploadToMinio(filepath, filename);

  // 4. Parse PDF
  console.log(`  Parsing PDF: ${filename}`);
  const parsed = await parsePdf(filepath);
  console.log(`     ${parsed.fullText.length} chars from ${parsed.totalPages} pages`);

  if (!parsed.fullText || parsed.fullText.trim().length < 50) {
    throw new Error('PDF parsing failed or document is empty');
  }

  // 5. Legal-aware chunking
  const chunks = await createChunks(parsed.fullText);
  console.log(`     ${chunks.length} chunks created`);

  const withHeadings = chunks.filter(c => c.heading);
  const withCitations = chunks.filter(c => c.citations.length > 0);
  if (withHeadings.length > 0) console.log(`     ${withHeadings.length} chunks have section headings`);
  if (withCitations.length > 0) console.log(`     ${withCitations.length} chunks contain citations`);

  // 6. Dual-write to legacy statutes + statute_chunks
  await writeToStatutes(filename, parsed.fullText, chunks);

  // 7. Build legal tree (library_documents + legal_nodes)
  const { documentId, nodeIds } = await buildLegalTree(filename, contentHash, parsed);

  // 8. Create legal_chunks with embeddings (makes search work)
  if (documentId && nodeIds.length > 0) {
    const legalChunkCount = await createLegalChunksWithEmbeddings(documentId, nodeIds);
    console.log(`  ${legalChunkCount} legal_chunks created with embeddings`);
  } else {
    // Fallback: create flat legal_chunks from generic chunks
    console.log(`     Creating flat legal_chunks with embeddings`);
    const flatChunkCount = await createFlatLegalChunks(filename, contentHash, parsed, chunks);
    console.log(`  ${flatChunkCount} flat legal_chunks created with embeddings`);
  }
}

// ── Batch orchestrator ───────────────────────────────────────────────────

async function indexLawpdfs(): Promise<IndexResult> {
  console.log('Starting legal-aware lawpdfs indexing...\n');
  console.log(`LAWPDFS_DIR: ${LAWPDFS_DIR}`);
  console.log(`DATABASE:    ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`OLLAMA:      ${OLLAMA_URL}`);
  console.log(`QDRANT:      ${QDRANT_URL}`);
  console.log(`MODEL:       ${EMBEDDING_MODEL}\n`);

  const result: IndexResult = {
    total: 0,
    success: 0,
    failed: 0,
    errors: [],
    stats: { ...STATS },
  };

  await ensureLawpdfsDirExists();

  // Verify Ollama connectivity
  try {
    const ollamaResp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (ollamaResp.ok) {
      const data = await ollamaResp.json();
      const models = (data.models ?? []).map((m: { name: string }) => m.name);
      console.log(`Ollama models: ${models.join(', ')}`);
      if (!models.some((m: string) => m.includes('embeddinggemma'))) {
        console.warn(`WARNING: ${EMBEDDING_MODEL} not found in Ollama — embeddings will fail`);
      }
    }
  } catch {
    console.warn('WARNING: Ollama not reachable — embeddings will be skipped');
  }

  // Verify DB connectivity
  try {
    const dbTest = await sql`SELECT 1 AS ok`;
    console.log('Database: connected\n');
  } catch (err) {
    throw new Error(`Database connection failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const files = await readdir(LAWPDFS_DIR);
  const pdfFiles = files
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.localeCompare(b));

  result.total = pdfFiles.length;
  console.log(`Found ${pdfFiles.length} PDF files\n`);

  for (let i = 0; i < pdfFiles.length; i++) {
    const filename = normalizeFilename(pdfFiles[i]);
    const filepath = join(LAWPDFS_DIR, pdfFiles[i]);

    console.log(`[${i + 1}/${pdfFiles.length}] Processing: ${filename}`);

    try {
      await processFile(filepath, filename);
      result.success++;
      console.log('');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${errorMsg}\n`);
      result.failed++;
      result.errors.push({ file: filename, error: errorMsg });
    }
  }

  result.stats = { ...STATS };
  return result;
}

// ── Entry point ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('==========================================================');
  console.log('  Legal Library Indexer — Full RAG Pipeline');
  console.log('  DB + Embeddings + Legal Tree + Qdrant');
  console.log('==========================================================\n');

  const startTime = Date.now();

  try {
    const result = await indexLawpdfs();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('==========================================================');
    console.log('  Indexing Complete');
    console.log('==========================================================\n');
    console.log(`Total files:        ${result.total}`);
    console.log(`Success:            ${result.success}`);
    console.log(`Failed:             ${result.failed}`);
    console.log(`Duration:           ${duration}s\n`);
    console.log('--- Pipeline Stats ---');
    console.log(`Evidence rows:      ${result.stats.evidenceRows}`);
    console.log(`Evidence chunks:    ${result.stats.evidenceChunks}`);
    console.log(`Statutes:           ${result.stats.statutes}`);
    console.log(`Statute chunks:     ${result.stats.statuteChunks}`);
    console.log(`Library documents:  ${result.stats.libraryDocs}`);
    console.log(`Legal nodes:        ${result.stats.legalNodes}`);
    console.log(`Legal chunks:       ${result.stats.legalChunks}`);
    console.log(`Embeddings gen'd:   ${result.stats.embeddings}`);
    console.log(`Qdrant points:      ${result.stats.qdrantPoints}`);

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      for (const { file, error } of result.errors) {
        console.log(`  - ${file}: ${error}`);
      }
    }

    console.log('\nDone!\n');

    // Close postgres connection pool
    await sql.end();
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('\nFatal error:', err);
    await sql.end();
    process.exit(1);
  }
}

// Safe main-module detection for Windows
const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1];
const isMainModule = Boolean(
  invokedFilePath && currentFilePath === invokedFilePath
);

if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { indexLawpdfs, processFile };
