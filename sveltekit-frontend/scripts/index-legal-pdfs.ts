/**
 * Index Legal PDFs into Legal Library
 *
 * Full pipeline for local PDF files in lawpdfs/ directory:
 *   PDF → text extraction → legal-chunker → hierarchy → DB → embed → Qdrant (dense+sparse)
 *
 * Replaces the old index-legal-pdfs.mjs with:
 *   - Structure-aware legal chunking (legal-chunker.ts)
 *   - Hierarchical legal_nodes with parent linking
 *   - Batch embedding via embeddinggemma (not nomic)
 *   - BM42 sparse vectors for hybrid search
 *   - Full DB ingestion (library_documents, legal_nodes, legal_chunks)
 *   - MinIO raw PDF upload for provenance
 *   - SHA-256 dedup (re-run safe)
 *
 * Usage:
 *   cd sveltekit-frontend
 *
 *   # Index all PDFs:
 *   npx tsx scripts/index-legal-pdfs.ts
 *
 *   # Preview only (no writes):
 *   DRY_RUN=1 npx tsx scripts/index-legal-pdfs.ts
 *
 *   # Index specific file:
 *   PDF_FILE=California_Constitution_2023-24.pdf npx tsx scripts/index-legal-pdfs.ts
 *
 *   # Override jurisdiction (default: auto-detect from filename):
 *   JURISDICTION=ca npx tsx scripts/index-legal-pdfs.ts
 *
 * Required env:
 *   DATABASE_URL          postgresql://...
 *   OLLAMA_BASE_URL       http://localhost:11434 (default)
 *   QDRANT_URL            http://localhost:6333  (default)
 */

import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { readFileSync, readdirSync, existsSync } from 'fs';
import pg from 'pg';
import { Client as MinioClient } from 'minio';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { generateSparseVector } from '../src/lib/server/vector/bm42-sparse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Env loading ───────────────────────────────────────────────────────────────
try {
	const dotenv = await import('dotenv');
	const envPath = join(__dirname, '..', '..', '.env');
	dotenv.config({ path: envPath });
	// Also try sveltekit-frontend/.env
	dotenv.config({ path: join(__dirname, '..', '.env') });
} catch { /* skip */ }

// ── Config ────────────────────────────────────────────────────────────────────
const DATABASE_URL    = process.env.DATABASE_URL    ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
const QDRANT_URL      = (process.env.QDRANT_URL     ?? 'http://localhost:6333').replace(/\/$/, '');
const EMBED_MODEL     = process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';
const MINIO_BUCKET    = process.env.MINIO_LIBRARY_BUCKET ?? 'legal-library';
const QDRANT_COLLECTION = 'legal_documents';
const LAWPDFS_DIR     = join(__dirname, '../../lawpdfs');

const DRY_RUN    = process.env.DRY_RUN === '1';
const PDF_FILE   = process.env.PDF_FILE ?? '';
const JURISDICTION_OVERRIDE = process.env.JURISDICTION ?? '';

// ── DB pool ───────────────────────────────────────────────────────────────────
const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL });

// ── MinIO ─────────────────────────────────────────────────────────────────────
const minioEndpointRaw = process.env.MINIO_ENDPOINT ?? 'localhost:9000';
const minioEndpoint    = minioEndpointRaw.split(':')[0];
const minioPort        = parseInt(minioEndpointRaw.includes(':') ? minioEndpointRaw.split(':')[1] : '9000', 10);
const minio = new MinioClient({
	endPoint:  minioEndpoint,
	port:      minioPort,
	useSSL:    process.env.MINIO_USE_SSL === 'true',
	accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
	secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface IngestChunk {
	heading?: string;
	text: string;
	nodeType: string;
	sectionPath: string[];
	depth: number;
	chunkIndex: number;
	citations: string[];
	startOffset: number;
	endOffset: number;
	tokenCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Detect jurisdiction from filename heuristics. */
function detectJurisdiction(filename: string): { code: string; name: string; level: string } {
	const fn = filename.toLowerCase();
	if (fn.includes('california') || fn.includes('cal_'))
		return { code: 'ca', name: 'California', level: 'state' };
	if (fn.includes('kentucky') || fn.includes('ky_'))
		return { code: 'ky', name: 'Kentucky', level: 'state' };
	if (fn.includes('virginia') || fn.includes('va_'))
		return { code: 'va', name: 'Virginia', level: 'state' };
	if (fn.includes('uscode') || fn.includes('u.s.c') || fn.includes('federal') || fn.includes('usdoj'))
		return { code: 'federal', name: 'Federal', level: 'federal' };
	return { code: 'federal', name: 'Federal', level: 'federal' };
}

/** Detect corpus type from filename heuristics. */
function detectCorpusType(filename: string): string {
	const fn = filename.toLowerCase();
	if (fn.includes('constitution')) return 'constitution';
	if (fn.includes('penal') || fn.includes('code')) return 'statute';
	if (fn.includes('bill') || fn.includes('ab-') || fn.includes('sb-')) return 'bill';
	if (fn.includes('people_v') || fn.includes('v_') || fn.includes('case')) return 'case';
	if (fn.includes('index') || fn.includes('digest')) return 'other';
	return 'statute';
}

/** Classify heading into legal_node_type enum. */
function classifyNodeType(heading: string): string {
	const h = heading.toLowerCase().trim();
	if (/^title\b/.test(h))                           return 'title';
	if (/^article\b/.test(h))                         return 'article';
	if (/^chapter\b|^ch\.\s/.test(h))                 return 'chapter';
	if (/^part\b/.test(h))                             return 'part';
	if (/^§\s*\d|^section\b|^sec\.\s/.test(h))         return 'section';
	if (/^subsection\b|^\([a-z]\)/.test(h))            return 'subsection';
	if (/^paragraph\b|^\(\d+\)/.test(h))               return 'paragraph';
	return 'section';
}

function headingToSlug(heading: string): string {
	return heading.toLowerCase().replace(/[^a-z0-9\s§-]/g, '').replace(/\s+/g, '-').slice(0, 80);
}

// ── Embedding (batch) ─────────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[] | null> {
	try {
		const resp = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 2048) }),
		});
		if (!resp.ok) return null;
		const json = await resp.json() as { embeddings?: number[][] };
		return json.embeddings?.[0] ?? null;
	} catch { return null; }
}

async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
	if (!texts.length) return [];
	try {
		const resp = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBED_MODEL, input: texts.map(t => t.slice(0, 2048)) }),
		});
		if (!resp.ok) return Promise.all(texts.map(t => embedText(t)));
		const json = await resp.json() as { embeddings?: number[][] };
		const embeddings = json.embeddings ?? [];
		return texts.map((_, i) => embeddings[i] ?? null);
	} catch { return texts.map(() => null); }
}

// ── Qdrant ────────────────────────────────────────────────────────────────────

async function ensureQdrantCollection(): Promise<void> {
	const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`);
	if (r.status === 404) {
		await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vectors: { size: 768, distance: 'Cosine', on_disk: true },
				sparse_vectors: { bm25: {} },
				hnsw_config: { on_disk: true },
			}),
		});
		console.log(`  Qdrant collection '${QDRANT_COLLECTION}' created (with bm25 sparse).`);
	} else {
		try {
			await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sparse_vectors: { bm25: {} } }),
			});
		} catch { /* already configured */ }
	}
}

interface QdrantPoint {
	id: string;
	vector: number[];
	payload: Record<string, unknown>;
}

async function upsertToQdrant(points: QdrantPoint[]): Promise<void> {
	if (!points.length) return;
	const hybridPoints = points.map(p => {
		const text = (p.payload.text as string) ?? '';
		const sparse = generateSparseVector(text);
		return {
			id: p.id,
			vector: { '': p.vector, bm25: { indices: sparse.indices, values: sparse.values } },
			payload: p.payload,
		};
	});
	await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points?wait=false`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ points: hybridPoints }),
	});
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getOrCreateJurisdiction(code: string, name: string, level: string): Promise<number | null> {
	const r = await pool.query<{ id: number }>('SELECT id FROM jurisdictions WHERE code = $1 LIMIT 1', [code]);
	if (r.rows[0]) return r.rows[0].id;
	const ins = await pool.query<{ id: number }>(
		'INSERT INTO jurisdictions (code, name, level) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING RETURNING id',
		[code, name, level]
	);
	if (ins.rows[0]) return ins.rows[0].id;
	const r2 = await pool.query<{ id: number }>('SELECT id FROM jurisdictions WHERE code = $1 LIMIT 1', [code]);
	return r2.rows[0]?.id ?? null;
}

// ── MinIO upload ──────────────────────────────────────────────────────────────

async function uploadToMinIO(key: string, content: Buffer, mimeType: string): Promise<boolean> {
	if (DRY_RUN) return true;
	try {
		const exists = await minio.bucketExists(MINIO_BUCKET);
		if (!exists) await minio.makeBucket(MINIO_BUCKET);
		await minio.putObject(MINIO_BUCKET, key, content, content.length, { 'Content-Type': mimeType });
		return true;
	} catch { return false; }
}

// ── Core ingestion ────────────────────────────────────────────────────────────

async function ingestPDF(filePath: string): Promise<'indexed' | 'skipped' | 'failed'> {
	const filename = basename(filePath);
	const filenameNoExt = basename(filePath, extname(filePath));
	console.log(`\n  File: ${filename}`);

	// Read PDF
	const pdfBuffer = readFileSync(filePath);

	// Extract text
	let text: string;
	try {
		const pdfParse = (await import('pdf-parse')).default;
		const data = await pdfParse(pdfBuffer);
		text = data.text;
		if (!text || text.trim().length < 100) {
			console.warn(`  Too short (${text?.length ?? 0} chars) — skipping`);
			return 'skipped';
		}
		text = text.slice(0, 5_000_000);
	} catch (e: any) {
		console.error(`  PDF parse failed: ${e.message}`);
		return 'failed';
	}

	console.log(`  Extracted: ${(text.length / 1024).toFixed(0)} KB`);

	// Dedup
	const hash = createHash('sha256').update(pdfBuffer).digest('hex');
	const existing = await pool.query<{ id: string; processing_status: string }>(
		'SELECT id, processing_status FROM library_documents WHERE source_hash = $1 LIMIT 1', [hash]
	);
	if (existing.rows.length > 0 && existing.rows[0].processing_status === 'complete') {
		console.log(`  Skipped (already indexed): ${existing.rows[0].id}`);
		return 'skipped';
	}

	if (DRY_RUN) {
		console.log(`  [DRY RUN] Would index: ${filename}`);
		return 'indexed';
	}

	// Detect metadata
	const jur = JURISDICTION_OVERRIDE
		? { code: JURISDICTION_OVERRIDE, name: JURISDICTION_OVERRIDE, level: 'state' }
		: detectJurisdiction(filename);
	const corpusType = detectCorpusType(filename);
	const jurisdictionId = await getOrCreateJurisdiction(jur.code, jur.name, jur.level);
	const title = filenameNoExt.replace(/_/g, ' ').replace(/-/g, ' ');

	// Chunk with legal-chunker (fallback to RecursiveCharacterTextSplitter)
	let chunks: IngestChunk[] = [];
	try {
		const mod = await import('../src/lib/server/indexer/legal-chunker.js');
		const chunkFn = mod.chunkLegalDocument ?? (mod as any).default?.chunkLegalDocument;
		if (typeof chunkFn !== 'function') throw new Error('chunkLegalDocument not found');
		const legalChunks: any[] = chunkFn(text, { maxTokens: 512, overlap: 128 });
		chunks = legalChunks.map((c: any, i: number) => ({
			heading:     c.heading ?? undefined,
			text:        c.text,
			nodeType:    c.heading ? classifyNodeType(c.heading) : 'section',
			sectionPath: c.sectionPath ?? [],
			depth:       (c.sectionPath?.length ?? 1) - 1,
			chunkIndex:  c.chunkIndex ?? i,
			citations:   c.citations ?? [],
			startOffset: c.startOffset ?? 0,
			endOffset:   c.endOffset ?? 0,
			tokenCount:  c.tokenCount ?? Math.ceil(c.text.length / 4),
		}));
	} catch {
		const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 2000, chunkOverlap: 200 });
		const docs = await splitter.createDocuments([text]);
		chunks = docs.map((d, i) => ({
			text: d.pageContent, nodeType: 'section', sectionPath: [], depth: 0,
			chunkIndex: i, heading: undefined, citations: [],
			startOffset: 0, endOffset: 0, tokenCount: Math.ceil(d.pageContent.length / 4),
		}));
	}

	if (!chunks.length) { console.warn('  No chunks — skipping'); return 'failed'; }
	console.log(`  Chunks: ${chunks.length}`);

	// MinIO upload (raw PDF)
	const minioKey = `lawpdfs/${filenameNoExt.toLowerCase()}.pdf`;
	await uploadToMinIO(minioKey, pdfBuffer, 'application/pdf');

	// DB transaction
	const client = await pool.connect();
	let docId: string | null = null;
	try {
		await client.query('BEGIN');

		if (existing.rows.length > 0) {
			docId = existing.rows[0].id;
			await client.query(`
				UPDATE library_documents
				SET processing_status = 'structuring', updated_at = now(), title = $1, minio_key = $2
				WHERE id = $3
			`, [title, minioKey, docId]);
			await client.query('DELETE FROM legal_nodes WHERE document_id = $1', [docId]);
		} else {
			const docRes = await client.query<{ id: string }>(`
				INSERT INTO library_documents
					(source_type, corpus_type, jurisdiction_id, title, citation,
					 source_hash, mime_type, minio_key, is_official, processing_status, uploaded_by)
				VALUES ('upload', $1, $2, $3, $4, $5, 'application/pdf', $6, false, 'structuring', NULL)
				RETURNING id
			`, [corpusType, jurisdictionId, title, filenameNoExt, hash, minioKey]);
			docId = docRes.rows[0].id;
		}

		// Version row
		await client.query(`
			INSERT INTO library_document_versions (document_id, version_label, is_current)
			VALUES ($1, 'initial', true) ON CONFLICT DO NOTHING
		`, [docId]);

		// Build hierarchy
		const pathToNodeId = new Map<string, string>();
		const rootRes = await client.query<{ id: string }>(`
			INSERT INTO legal_nodes
				(document_id, node_type, heading, node_path, depth, ordinal, full_text, text_clean)
			VALUES ($1, 'document', $2, 'root', 0, '0', $3, $3)
			RETURNING id
		`, [docId, title, text.slice(0, 50000)]);
		const rootNodeId = rootRes.rows[0].id;
		pathToNodeId.set('', rootNodeId);

		for (let i = 0; i < chunks.length; i++) {
			const c = chunks[i];
			const sp = c.sectionPath;

			// Ensure parent nodes
			let parentNodeId = rootNodeId;
			if (sp.length > 0) {
				for (let d = 0; d < sp.length; d++) {
					const pathKey = sp.slice(0, d + 1).join('/');
					if (!pathToNodeId.has(pathKey)) {
						const heading = sp[d];
						const slug = sp.slice(0, d + 1).map(headingToSlug).join('/');
						const sRes = await client.query<{ id: string }>(`
							INSERT INTO legal_nodes
								(document_id, parent_node_id, node_type, heading, citation_label,
								 node_path, depth, ordinal, full_text, text_clean)
							VALUES ($1, $2, $3, $4, $4, $5, $6, $7, '', '')
							RETURNING id
						`, [docId, parentNodeId, classifyNodeType(heading), heading, slug, d + 1, String(d)]);
						pathToNodeId.set(pathKey, sRes.rows[0].id);
					}
					parentNodeId = pathToNodeId.get(pathKey)!;
				}
			}

			const chunkParentNodeId = sp.length > 0 ? pathToNodeId.get(sp.join('/'))! : rootNodeId;
			const leafSlug = sp.length > 0
				? sp.map(headingToSlug).join('/') + `/chunk-${i}`
				: `chunk-${i}`;

			const nodeRes = await client.query<{ id: string }>(`
				INSERT INTO legal_nodes
					(document_id, parent_node_id, node_type, heading, citation_label,
					 node_path, depth, ordinal, char_start, char_end, full_text, text_clean)
				VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $10)
				RETURNING id
			`, [
				docId, chunkParentNodeId, c.nodeType, c.heading ?? null,
				leafSlug, c.depth + 1, String(i),
				c.startOffset || null, c.endOffset || null, c.text,
			]);
			const nodeId = nodeRes.rows[0].id;

			await client.query(`
				INSERT INTO legal_chunks (legal_node_id, chunk_index, chunk_text, token_count, char_start, char_end)
				VALUES ($1, $2, $3, $4, $5, $6)
				ON CONFLICT (legal_node_id, chunk_index) DO NOTHING
			`, [nodeId, i, c.text, c.tokenCount, c.startOffset || null, c.endOffset || null]);
		}

		await client.query('COMMIT');
		console.log(`  DB: docId=${docId}, nodes=${pathToNodeId.size + chunks.length}`);
	} catch (e: any) {
		await client.query('ROLLBACK');
		console.error(`  Transaction failed: ${e.message}`);
		client.release();
		return 'failed';
	}
	client.release();

	if (!docId) return 'failed';

	// Embed + Qdrant
	const chunkRows = await pool.query<{
		id: string; chunk_text: string; chunk_index: number; legal_node_id: string;
		heading: string | null; node_path: string | null; node_type: string | null;
	}>(
		`SELECT lc.id, lc.chunk_text, lc.chunk_index, lc.legal_node_id,
		        ln.heading, ln.node_path, ln.node_type
		 FROM legal_chunks lc
		 JOIN legal_nodes ln ON ln.id = lc.legal_node_id
		 WHERE ln.document_id = $1 AND lc.embedding IS NULL
		 ORDER BY lc.chunk_index`,
		[docId]
	);

	let embedded = 0;
	const BATCH = 32;
	for (let i = 0; i < chunkRows.rows.length; i += BATCH) {
		const batch = chunkRows.rows.slice(i, i + BATCH);
		const vectors = await embedBatch(batch.map(r => r.chunk_text));

		const dbUpdates: Promise<void>[] = [];
		const qdrantPoints: QdrantPoint[] = [];

		for (let j = 0; j < batch.length; j++) {
			const vec = vectors[j];
			if (!vec) continue;
			const row = batch[j];

			dbUpdates.push(
				pool.query("UPDATE legal_chunks SET embedding = $1::vector WHERE id = $2", [`[${vec.join(',')}]`, row.id]).then(() => {})
			);
			qdrantPoints.push({
				id: row.id,
				vector: vec,
				payload: {
					chunk_id:       row.id,
					document_id:    docId,
					legal_node_id:  row.legal_node_id,
					chunk_index:    row.chunk_index,
					corpus_type:    corpusType,
					jurisdiction:   jur.code,
					source_type:    'upload',
					title:          title.slice(0, 200),
					text:           row.chunk_text.slice(0, 500),
					heading:        row.heading ?? '',
					node_path:      row.node_path ?? '',
					node_type:      row.node_type ?? 'section',
					filename,
				},
			});
			embedded++;
		}

		await Promise.all(dbUpdates);
		await upsertToQdrant(qdrantPoints);
	}

	await pool.query("UPDATE library_documents SET processing_status = 'complete', updated_at = now() WHERE id = $1", [docId]);
	console.log(`  Indexed: ${chunks.length} chunks, ${embedded} embedded -> ${docId}`);
	return 'indexed';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	const startTime = Date.now();
	console.log('\nLegal PDF Indexer');
	console.log(`  Directory:  ${LAWPDFS_DIR}`);
	console.log(`  Model:      ${EMBED_MODEL}`);
	console.log(`  Collection: ${QDRANT_COLLECTION}`);
	console.log(`  DRY_RUN:    ${DRY_RUN}`);

	if (!existsSync(LAWPDFS_DIR)) {
		console.error(`  Directory not found: ${LAWPDFS_DIR}`);
		await pool.end();
		process.exit(1);
	}

	if (!DRY_RUN) {
		await ensureQdrantCollection();
	}

	// Get PDF files
	let pdfFiles: string[];
	if (PDF_FILE) {
		const fullPath = join(LAWPDFS_DIR, PDF_FILE);
		if (!existsSync(fullPath)) {
			console.error(`  File not found: ${fullPath}`);
			await pool.end();
			process.exit(1);
		}
		pdfFiles = [fullPath];
	} else {
		pdfFiles = readdirSync(LAWPDFS_DIR)
			.filter(f => f.endsWith('.pdf'))
			.map(f => join(LAWPDFS_DIR, f));
	}

	console.log(`  Found: ${pdfFiles.length} PDF files\n`);

	const results = { indexed: 0, skipped: 0, failed: 0 };
	for (const pdfFile of pdfFiles) {
		try {
			const result = await ingestPDF(pdfFile);
			results[result]++;
		} catch (e: any) {
			console.error(`  FATAL for ${basename(pdfFile)}: ${e.message}`);
			results.failed++;
		}
	}

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	console.log(`\n${'='.repeat(50)}`);
	console.log(`PDF indexing complete (${elapsed}s)`);
	console.log(`  Indexed: ${results.indexed}`);
	console.log(`  Skipped: ${results.skipped}`);
	console.log(`  Failed:  ${results.failed}`);

	await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
