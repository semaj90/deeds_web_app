/**
 * Legal-aware lawpdfs → legal library + evidence indexer  (v2)
 *
 * Dual-write pipeline in one pass:
 *
 * LIBRARY PATH (new legal corpus):
 *   library_documents → library_document_versions (is_current=true)
 *   → legal_nodes (Article/Chapter/Section hierarchy via legal-chunker.ts)
 *   → legal_chunks (text + embedding + pgvector + Qdrant)
 *
 * EVIDENCE PATH (existing RAG pipeline):
 *   evidence table row (case-linked, backward-compat with existing searches)
 *
 * v2 improvements:
 *   - Hash computed first; skip upload + index if content unchanged
 *   - Transaction wraps all DB writes per document (atomic)
 *   - library_document_versions row created (is_current=true)
 *   - Dual evidence table write for legacy RAG query compat
 *   - basename removed from imports (was unused)
 *   - DRY_RUN=1 support for safe previewing
 *   - Progress logged every 25 chunks during embedding
 *
 * Usage:
 *   cd sveltekit-frontend
 *   npx tsx scripts/index-lawpdfs-to-rag.ts
 *
 *   # Preview only (no writes):
 *   DRY_RUN=1 npx tsx scripts/index-lawpdfs-to-rag.ts
 *
 * Required env (auto-loaded from repo-root .env):
 *   DATABASE_URL, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY,
 *   MINIO_LIBRARY_BUCKET, OLLAMA_BASE_URL, QDRANT_URL
 */

import { readdir, stat, readFile, access } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import pg from 'pg';
import { Client as MinioClient } from 'minio';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

// ── Env loading ───────────────────────────────────────────────────────────────
// Try dotenv; silently skip if not installed (env may already be populated)
try {
	const dotenv = await import('dotenv');
	const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
	dotenv.config({ path: envPath });
} catch { /* dotenv not installed — use process.env directly */ }

// ── Legal chunker (no $lib imports — safe to import via relative path) ────────
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — tsx resolves .ts via relative path
import { chunkLegalDocument } from '../src/lib/server/indexer/legal-chunker.js';
import type { LegalChunk } from '../src/lib/server/indexer/legal-chunker.js';

// ── Config ────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = join(__dirname, '..', '..');
const LAWPDFS_DIR = join(REPO_ROOT, 'lawpdfs');

const DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/$/, '');
const EMBED_MODEL = process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';
const MINIO_BUCKET = process.env.MINIO_LIBRARY_BUCKET ?? 'legal-library';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'legal_documents';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_CASE_ID = '00000000-0000-0000-0000-000000000001';
const DRY_RUN = process.env.DRY_RUN === '1';

// ── DB pool (raw pg — no $lib) ────────────────────────────────────────────────
const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL });

// ── MinIO client (raw — no $lib) ──────────────────────────────────────────────
const minioEndpointRaw = process.env.MINIO_ENDPOINT ?? 'localhost:9000';
const minioEndpoint = minioEndpointRaw.split(':')[0];
const minioPort = minioEndpointRaw.includes(':')
  ? parseInt(minioEndpointRaw.split(':')[1], 10)
  : parseInt(process.env.MINIO_PORT ?? '9000', 10);

const minio = new MinioClient({
  endPoint: minioEndpoint,
  port: minioPort,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
});

// ── Types ────────────────────────────────────────────────────────────────────
interface IndexResult {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  errors: Array<{ file: string; error: string }>;
}

// ── Corpus classification ─────────────────────────────────────────────────────
function classifyCorpusType(
  filename: string
): 'constitution' | 'statute' | 'regulation' | 'bill' | 'case' | 'other' {
  const lower = filename.toLowerCase();
  if (lower.includes('constitution')) return 'constitution';
  if (lower.includes('code') || lower.includes('usc') || lower.includes('statute'))
    return 'statute';
  if (lower.includes('regulation') || lower.includes('cfr') || lower.includes('rule'))
    return 'regulation';
  if (
    lower.includes('bill') ||
    lower.includes('sb ') ||
    lower.includes('ab ') ||
    lower.includes('hr ')
  )
    return 'bill';
  if (
    lower.includes('v.') ||
    lower.includes('people v') ||
    lower.includes('court of appeal') ||
    lower.includes('opinion')
  )
    return 'case';
  return 'other';
}

function extractJurisdictionCode(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('california') || lower.includes(' ca ') || lower.includes('_ca_')) return 'ca';
  if (lower.includes('texas') || lower.includes(' tx ') || lower.includes('_tx_')) return 'tx';
  if (lower.includes('new york') || lower.includes(' ny ') || lower.includes('_ny_')) return 'ny';
  if (lower.includes('florida') || lower.includes(' fl ') || lower.includes('_fl_')) return 'fl';
  if (
    lower.includes('federal') ||
    lower.includes('u.s.c') ||
    lower.includes('usc') ||
    lower.includes('usdoj') ||
    lower.includes('united states')
  )
    return 'federal';
  return 'other';
}

function extractTags(filename: string): string[] {
  const tags = new Set<string>();
  const lower = filename.toLowerCase();
  if (lower.includes('constitution')) tags.add('constitution');
  if (lower.includes('code')) tags.add('statute');
  if (lower.includes('trafficking')) tags.add('human-trafficking');
  if (lower.includes('sexual abuse') || lower.includes('sex offender')) tags.add('sexual-abuse');
  if (lower.includes('child')) tags.add('child-related');
  if (lower.includes('habeas corpus')) tags.add('habeas-corpus');
  if (lower.includes('fraud')) tags.add('fraud');
  if (lower.includes('privacy')) tags.add('privacy');
  if (lower.includes('search and seizure')) tags.add('search-and-seizure');
  tags.add(extractJurisdictionCode(filename));
  tags.add(classifyCorpusType(filename));
  return [...tags];
}

// ── MinIO helpers ─────────────────────────────────────────────────────────────
async function ensureMinIOBucket(): Promise<void> {
  if (DRY_RUN) return;
  try {
    const exists = await minio.bucketExists(MINIO_BUCKET);
    if (!exists) {
      await minio.makeBucket(MINIO_BUCKET);
      console.log(`  MinIO bucket '${MINIO_BUCKET}' created.`);
    }
  } catch (err) {
    console.warn(
      `  ⚠ MinIO unavailable — uploads will be skipped (${err instanceof Error ? err.message : err})`
    );
  }
}

function computeMinioKey(filename: string): string {
  const slug = filename
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `lawpdfs/raw/${slug}${extname(filename).toLowerCase() || '.pdf'}`;
}

async function uploadToMinIO(objectKey: string, buffer: Buffer): Promise<boolean> {
  if (DRY_RUN) {
    console.log(`  [DRY_RUN] Would upload: ${MINIO_BUCKET}/${objectKey}`);
    return true;
  }
  try {
    await minio.putObject(MINIO_BUCKET, objectKey, buffer, buffer.length, {
      'Content-Type': 'application/pdf',
    });
    return true;
  } catch (err) {
    console.warn(`  ⚠ MinIO upload skipped: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

// ── Embedding via Ollama HTTP ─────────────────────────────────────────────────
async function embedText(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { embedding?: number[] };
    return json.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────
async function ensureQdrantCollection(): Promise<void> {
  const listRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`);
  if (listRes.status === 404) {
    await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: 768, distance: 'Cosine', on_disk: true },
        hnsw_config: { on_disk: true },
      }),
    });
    console.log(`  Qdrant collection '${QDRANT_COLLECTION}' created.`);
  }
}

async function upsertToQdrant(
  points: Array<{
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  }>
): Promise<void> {
  if (points.length === 0) return;
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points?wait=false`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`  Qdrant upsert warning: ${text}`);
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function getOrCreateJurisdiction(code: string): Promise<number | null> {
  const res = await pool.query<{ id: number }>(
    'SELECT id FROM jurisdictions WHERE code = $1 LIMIT 1',
    [code]
  );
  if (res.rows.length > 0) return res.rows[0].id;
  // For unknown jurisdictions, skip the FK (nullable column)
  return null;
}

async function setDocumentStatus(docId: string, status: string): Promise<void> {
  await pool.query(
    'UPDATE library_documents SET processing_status = $1, updated_at = now() WHERE id = $2',
    [status, docId]
  );
}

// ── Core indexer ──────────────────────────────────────────────────────────────
async function indexPdf(filepath: string, filename: string): Promise<'indexed' | 'skipped'> {
  // Step 1: Hash first — enables cheap dedupe before any I/O
  const buffer = await readFile(filepath);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const fileStat = await stat(filepath);

  // Step 2: Skip unchanged documents
  const existing = await pool.query<{ id: string; processing_status: string }>(
    `SELECT id, processing_status FROM library_documents WHERE source_hash = $1 LIMIT 1`,
    [hash]
  );
  if (existing.rows.length > 0 && existing.rows[0].processing_status === 'complete') {
    console.log(`  ↷ Skipped (hash unchanged, already complete): ${existing.rows[0].id}`);
    return 'skipped';
  }

  // Step 3: Parse PDF
  console.log(`  Parsing PDF...`);
  const pdfParse = (await import('pdf-parse')).default;
  const pdfData = await pdfParse(buffer);
  const fullText = pdfData.text ?? '';
  const pageCount = pdfData.numpages ?? 1;
  if (!fullText || fullText.trim().length < 50) {
    throw new Error('PDF text extraction failed or document is blank (may need OCR)');
  }
  console.log(`  Extracted ${fullText.length.toLocaleString()} chars, ${pageCount} pages`);

  // Step 4: Upload to MinIO (after dedupe check — non-fatal if MinIO is down)
  const objectKey = computeMinioKey(filename);
  const uploaded = await uploadToMinIO(objectKey, buffer);
  if (!DRY_RUN && uploaded) console.log(`  MinIO: ${MINIO_BUCKET}/${objectKey}`);

  // Step 5: Derive metadata
  const jurisdictionCode = extractJurisdictionCode(filename);
  const corpusType = classifyCorpusType(filename);
  const tags = extractTags(filename);
  const title = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .trim();
  const jurisdictionId = await getOrCreateJurisdiction(jurisdictionCode);

  // Step 6: Chunk with legal-chunker (structure-aware)
  console.log(`  Chunking...`);
  let chunks: LegalChunk[] = chunkLegalDocument(fullText, { maxTokens: 512, overlap: 128 });
  if (!chunks || chunks.length === 0) {
    console.log(`  Legal-chunker returned 0 chunks — generic splitter fallback`);
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. '],
    });
    const texts = await splitter.splitText(fullText);
    chunks = texts.map((text, i) => ({
      text,
      chunkIndex: i,
      sectionPath: [],
      heading: '',
      startOffset: 0,
      endOffset: text.length,
      tokenCount: Math.ceil(text.length / 4),
      citations: [],
    }));
  }
  console.log(`  ${chunks.length} chunks`);

  if (DRY_RUN) {
    console.log(`  [DRY_RUN] Would write library_documents + ${chunks.length} nodes/chunks`);
    return 'indexed';
  }

  // Step 7: All DB writes in a single transaction (atomic per document)
  const client = await pool.connect();
  let docId = '';
  let versionId = '';
  let evidenceId = '';

  try {
    await client.query('BEGIN');

    // ── library_documents ─────────────────────────────────────────────────
    const docRes = await client.query<{ id: string }>(
      `INSERT INTO library_documents (
				source_type, corpus_type, jurisdiction_id, title, short_title,
				minio_key, source_hash, mime_type, page_count, is_official,
				processing_status, uploaded_by, created_at, updated_at
			) VALUES (
				'upload', $1, $2, $3, $4,
				$5, $6, 'application/pdf', $7, false,
				'structuring', $8, now(), now()
			)
			ON CONFLICT (source_hash) WHERE source_hash IS NOT NULL DO UPDATE
				SET processing_status = 'structuring', updated_at = now()
			RETURNING id`,
      [
        corpusType,
        jurisdictionId,
        title,
        title.slice(0, 80),
        objectKey,
        hash,
        pageCount,
        DEFAULT_USER_ID,
      ]
    );
    docId = docRes.rows[0].id;

    // ── library_document_versions (deactivate old, insert current) ─────────
    await client.query(
      `UPDATE library_document_versions SET is_current = false WHERE document_id = $1`,
      [docId]
    );
    const verRes = await client.query<{ id: string }>(
      `INSERT INTO library_document_versions
				(document_id, version_label, source_date, is_current, created_at)
			 VALUES ($1, $2, current_date, true, now())
			ON CONFLICT DO NOTHING
			RETURNING id`,
      [docId, `Import ${new Date().toISOString().slice(0, 10)}`]
    );
    versionId = verRes.rows[0]?.id ?? '';

    // ── evidence table (dual-write for legacy RAG queries) ─────────────────
    const evRes = await client.query<{ id: string }>(
      `INSERT INTO evidence (
				case_id, user_id, evidence_number, title, type, summary, description,
				file_path, file_type, file_size, hash,
				source, mime_type, tags, metadata,
				created_at, updated_at
			) VALUES (
				$1, $2, $3, $4, 'document'::evidence_type, $5, $5,
				$6, 'pdf', $7, $8,
				'lawpdfs-indexer', 'application/pdf', $9::jsonb, $10::jsonb,
				now(), now()
			)
			ON CONFLICT DO NOTHING
			RETURNING id`,
      [
        DEFAULT_CASE_ID,
        DEFAULT_USER_ID,
        `LIB-${hash.slice(0, 8).toUpperCase()}`,
        title,
        `Auto-indexed from lawpdfs/${filename} (${corpusType}, ${jurisdictionCode})`,
        objectKey,
        fileStat.size,
        hash,
        JSON.stringify(tags),
        JSON.stringify({
          corpusType,
          jurisdiction: jurisdictionCode,
          tags,
          minioKey: objectKey,
          sourceHash: hash,
          libraryDocId: docId,
        }),
      ]
    );
    evidenceId = evRes.rows[0]?.id ?? '';

    // ── legal_nodes + legal_chunks (structure, no embeddings yet) ─────────
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const heading = chunk.heading || (chunk.sectionPath?.at(-1) ?? null);
      const nodePath = chunk.sectionPath?.join('/') || `chunk-${i}`;
      const nType = (chunk.sectionPath?.length ?? 0) > 2 ? 'section' : 'article';

      const nodeRes = await client.query<{ id: string }>(
        `INSERT INTO legal_nodes (
					document_id, version_id, node_type, ordinal, heading,
					citation_label, node_path, depth, full_text, text_clean, created_at
				) VALUES ($1, $2, $3::legal_node_type, $4, $5, $6, $7, $8, $9, $10, now())
				RETURNING id`,
        [
          docId,
          versionId || null,
          nType,
          String(i),
          heading,
          chunk.citations?.[0] ?? null,
          nodePath,
          chunk.sectionPath?.length ?? 0,
          chunk.text,
          chunk.text,
        ]
      );
      const nodeId = nodeRes.rows[0].id;

      await client.query(
        `INSERT INTO legal_chunks (
					legal_node_id, chunk_index, chunk_text, token_count,
					page_start, page_end, char_start, char_end, created_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          nodeId,
          i,
          chunk.text,
          chunk.tokenCount ?? Math.ceil(chunk.text.length / 4),
          chunk.pageStart ?? null,
          chunk.pageEnd ?? null,
          chunk.startOffset ?? null,
          chunk.endOffset ?? null,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(
      `  Committed: docId=${docId}, ${chunks.length} nodes/chunks` +
        (evidenceId ? `, evidence=${evidenceId.slice(0, 8)}` : '')
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Step 8: Embed + backfill pgvector + Qdrant (outside transaction — slow, non-fatal)
  await setDocumentStatus(docId, 'embedding');
  await ensureQdrantCollection();

  const nodeRows = await pool.query<{ id: string; chunk_text: string }>(
    `SELECT lc.id, lc.chunk_text
		 FROM legal_chunks lc
		 JOIN legal_nodes ln ON ln.id = lc.legal_node_id
		 WHERE ln.document_id = $1
		 ORDER BY lc.chunk_index`,
    [docId]
  );

  let embeddedCount = 0;
  const qdrantBatch: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = [];

  for (let i = 0; i < nodeRows.rows.length; i++) {
    const row = nodeRows.rows[i];
    const chunk = chunks[i];
    const vector = await embedText(row.chunk_text);
    if (!vector) continue;

    embeddedCount++;
    await pool.query(`UPDATE legal_chunks SET embedding = $1::vector WHERE id = $2`, [
      `[${vector.join(',')}]`,
      row.id,
    ]);

    qdrantBatch.push({
      id: row.id,
      vector,
      payload: {
        chunk_id: row.id,
        document_id: docId,
        corpus_type: corpusType,
        jurisdiction: jurisdictionCode,
        tags,
        heading: chunk?.heading ?? null,
        node_path: chunk?.sectionPath?.join('/') ?? `chunk-${i}`,
        chunk_index: i,
      },
    });
    if (qdrantBatch.length >= 50) {
      await upsertToQdrant([...qdrantBatch]);
      qdrantBatch.length = 0;
    }
    if ((i + 1) % 25 === 0) process.stdout.write(`\r  Embedding: ${i + 1}/${nodeRows.rows.length}`);
  }
  if (qdrantBatch.length > 0) await upsertToQdrant([...qdrantBatch]);
  if (nodeRows.rows.length > 0) process.stdout.write('\n');

  await setDocumentStatus(docId, 'complete');
  const skipped = nodeRows.rows.length - embeddedCount;
  console.log(
    `  Complete: ${embeddedCount}/${nodeRows.rows.length} chunks embedded` +
      (skipped > 0 ? ` (${skipped} skipped — Ollama offline?)` : '')
  );
  return 'indexed';
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function indexLawpdfs(): Promise<IndexResult> {
  console.log(`📁 LAWPDFS_DIR: ${LAWPDFS_DIR}\n`);

  const result: IndexResult = { total: 0, success: 0, skipped: 0, failed: 0, errors: [] };

  try {
    await access(LAWPDFS_DIR, fsConstants.R_OK);
  } catch {
    throw new Error(`Cannot read lawpdfs dir: ${LAWPDFS_DIR}`);
  }

  await ensureMinIOBucket();

  const files = await readdir(LAWPDFS_DIR);
  const pdfFiles = files.filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  result.total = pdfFiles.length;

  console.log(`📚 Found ${pdfFiles.length} PDF files\n`);

  for (let i = 0; i < pdfFiles.length; i++) {
    const filename = pdfFiles[i];
    const filepath = join(LAWPDFS_DIR, filename);

    console.log(`[${i + 1}/${pdfFiles.length}] ${filename}`);

    try {
      const outcome = await indexPdf(filepath, filename);
      if (outcome === 'skipped') result.skipped++;
      else result.success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Failed: ${msg}\n`);
      result.failed++;
      result.errors.push({ file: filename, error: msg });
    }

    console.log('');
  }

  return result;
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Legal lawpdfs → library + evidence indexer  (v2)');
  console.log('  Library: library_documents → legal_nodes → legal_chunks');
  console.log('  Evidence: evidence table (case-linked, legacy RAG compat)');
  console.log(`  Vectors: Qdrant ${QDRANT_COLLECTION} + pgvector (768-dim)`);
  console.log('  Model:  ', EMBED_MODEL);
  if (DRY_RUN) console.log('  [DRY_RUN mode — no writes]');
  console.log('═══════════════════════════════════════════════════════════\n');

  const start = Date.now();
  try {
    const result = await indexLawpdfs();
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Complete');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total:    ${result.total}`);
    console.log(`Indexed:  ${result.success}`);
    console.log(`Skipped:  ${result.skipped}  (hash unchanged)`);
    console.log(`Failed:   ${result.failed}`);
    console.log(`Duration: ${duration}s\n`);
    if (result.errors.length > 0) {
      console.log('Errors:');
      for (const { file, error } of result.errors) {
        console.log(`  - ${file}: ${error}`);
      }
    }
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n❌ Fatal:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Only run when invoked directly (not imported)
const _cur = fileURLToPath(import.meta.url);
const _inv = process.argv[1];
if (_inv && (_cur === _inv || _inv.endsWith('index-lawpdfs-to-rag.ts') || _inv.endsWith('index-lawpdfs-to-rag.js'))) {
	main().catch((err) => { console.error(err); process.exit(1); });
}

export { indexLawpdfs };
