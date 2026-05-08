/**
 * GovInfo Federal Corpus Ingest  (Phase 2)
 *
 * Downloads official US federal documents from api.govinfo.gov and indexes
 * them into the same legal library pipeline as index-lawpdfs-to-rag.ts.
 *
 * Supported collections:
 *   USCODE  — United States Code (title-level packages)
 *   PLAW    — Public Laws (all enacted statutes by Congress)
 *   CFR     — Code of Federal Regulations (title + volume)
 *   FR      — Federal Register (daily issues)
 *
 * Pipeline:
 *   GovInfo API → text extraction → legal-chunker → embed → pgvector + Qdrant
 *
 * Usage:
 *   cd sveltekit-frontend
 *
 *   # Preview only (no writes):
 *   DRY_RUN=1 npx tsx scripts/ingest-govinfo-federal.ts
 *
 *   # Index first 5 packages from USCODE:
 *   GOVINFO_COLLECTION=USCODE GOVINFO_MAX_PACKAGES=5 npx tsx scripts/ingest-govinfo-federal.ts
 *
 *   # Index first 20 CFR packages:
 *   GOVINFO_COLLECTION=CFR GOVINFO_MAX_PACKAGES=20 npx tsx scripts/ingest-govinfo-federal.ts
 *
 *   # Index recent PLAW (last 6 months):
 *   GOVINFO_COLLECTION=PLAW GOVINFO_START_DATE=2024-01-01 npx tsx scripts/ingest-govinfo-federal.ts
 *
 * Required env:
 *   DATABASE_URL          postgresql://...
 *   GOVINFO_API_KEY       Your api.govinfo.gov key (or DEMO_KEY for testing)
 *   OLLAMA_BASE_URL       http://localhost:11434
 *   QDRANT_URL            http://localhost:6333
 *
 * Optional env:
 *   GOVINFO_COLLECTION    USCODE | PLAW | CFR | FR  (default: USCODE)
 *   GOVINFO_MAX_PACKAGES  Max packages to ingest per run  (default: 10)
 *   GOVINFO_PAGE_SIZE     GovInfo API page size           (default: 100)
 *   GOVINFO_START_DATE    ISO date filter e.g. 2024-01-01 (optional)
 *   GOVINFO_END_DATE      ISO date filter                 (optional)
 *   MINIO_ENDPOINT        localhost:9000
 *   MINIO_ACCESS_KEY      minioadmin
 *   MINIO_SECRET_KEY      minioadmin
 *   MINIO_LIBRARY_BUCKET  legal-library
 *   DRY_RUN               1 = preview only, no writes
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import pg from 'pg';
import { Client as MinioClient } from 'minio';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { generateSparseVector } from '../src/lib/server/vector/bm42-sparse.js';

// ── Env loading ───────────────────────────────────────────────────────────────
try {
	const dotenv = await import('dotenv');
	const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
	dotenv.config({ path: envPath });
} catch { /* skip — env may already be set */ }

// ── Config ────────────────────────────────────────────────────────────────────
const DATABASE_URL     = process.env.DATABASE_URL     ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const OLLAMA_BASE_URL  = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
const QDRANT_URL       = (process.env.QDRANT_URL      ?? 'http://localhost:6333').replace(/\/$/, '');
const EMBED_MODEL      = process.env.EMBEDDING_MODEL  ?? 'embeddinggemma:latest';
const MINIO_BUCKET     = process.env.MINIO_LIBRARY_BUCKET ?? 'legal-library';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'legal_documents';

const GOVINFO_BASE     = 'https://api.govinfo.gov';
const GOVINFO_API_KEY  = process.env.GOVINFO_API_KEY  ?? 'DEMO_KEY';
const COLLECTION_CODE  = (process.env.GOVINFO_COLLECTION  ?? 'USCODE').toUpperCase();
const MAX_PACKAGES     = parseInt(process.env.GOVINFO_MAX_PACKAGES ?? '10', 10);
const PAGE_SIZE        = parseInt(process.env.GOVINFO_PAGE_SIZE    ?? '100', 10);
const START_DATE       = process.env.GOVINFO_START_DATE ?? '';
const END_DATE         = process.env.GOVINFO_END_DATE   ?? '';
const DRY_RUN          = process.env.DRY_RUN === '1';

/** Delay between GovInfo API calls to respect rate limits (ms) */
const API_DELAY_MS = GOVINFO_API_KEY === 'DEMO_KEY' ? 1200 : 300;

if (GOVINFO_API_KEY === 'DEMO_KEY') {
	console.warn('\n⚠  Using DEMO_KEY — rate-limited to ~100 requests/day. Register at https://api.govinfo.gov/api-key for higher limits.\n');
}

// ── DB pool ───────────────────────────────────────────────────────────────────
const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL });

// ── MinIO client ──────────────────────────────────────────────────────────────
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

interface GovInfoPackage {
	packageId:   string;
	title:       string;
	dateIssued?: string;
	collectionCode?: string;
	download?: {
		txtLink?: string;
		htmLink?: string;
		xmlLink?: string;
		pdfLink?: string;
	};
}

interface GovInfoCollectionResponse {
	count:      number;
	nextPage?:  string;
	packages:   GovInfoPackage[];
}

// corpus_type + jurisdiction inferred from collection
const COLLECTION_META: Record<string, {
  corpusType: 'statute' | 'regulation' | 'bill' | 'case' | 'constitution' | 'other';
  jurisdiction: string;
  sourceType: string;
}> = {
	USCODE: { corpusType: 'statute',    jurisdiction: 'federal', sourceType: 'govinfo' },
	PLAW:   { corpusType: 'bill',       jurisdiction: 'federal', sourceType: 'govinfo' },
	CFR:    { corpusType: 'regulation', jurisdiction: 'federal', sourceType: 'govinfo' },
	FR:     { corpusType: 'other',      jurisdiction: 'federal', sourceType: 'govinfo' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}

/** Strip HTML/XML tags and normalize whitespace */
function extractTextFromMarkup(html: string): string {
	return html
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s{3,}/g, '\n\n')
		.trim();
}

/** Fetch with retry + respect rate limits.
 *  Appends api_key only if not already present in URL.
 */
async function govFetch(url: string, retries = 3): Promise<Response> {
	const alreadyHasKey = url.includes('api_key=');
	const sep  = url.includes('?') ? '&' : '?';
	const full = alreadyHasKey ? url : `${url}${sep}api_key=${GOVINFO_API_KEY}`;
	for (let attempt = 1; attempt <= retries; attempt++) {
		await sleep(API_DELAY_MS);
		const resp = await fetch(full);
		if (resp.ok) return resp;
		if (resp.status === 429) {
			const wait = 10000 * attempt;
			console.warn(`  Rate limited — waiting ${wait/1000}s (attempt ${attempt}/${retries})`);
			await sleep(wait);
			continue;
		}
		if (resp.status >= 500) {
			console.warn(`  GovInfo server error ${resp.status} — attempt ${attempt}/${retries}`);
			if (attempt < retries) continue;
		}
		throw new Error(`GovInfo ${resp.status} for ${url}`);
	}
	throw new Error(`GovInfo max retries exceeded for ${url}`);
}

/** Fetch list of packages from a GovInfo collection (cursor-based pagination)
 *
 * URL format: /collections/{code}/{startDate}?pageSize=N&offsetMark=*
 * nextPage cursor is returned in the response for subsequent pages.
 */
async function fetchPackageList(collectionCode: string, maxCount: number): Promise<GovInfoPackage[]> {
	const packages: GovInfoPackage[] = [];
	// GovInfo requires a start date in the path; default to 2000-01-01 to capture all modern content.
	const startDate = START_DATE || '2000-01-01';
	const startDateEncoded = encodeURIComponent(`${startDate}T00:00:00Z`);
	// endDate query param is optional
	const endDateParam = END_DATE ? `&endDate=${encodeURIComponent(END_DATE + 'T23:59:59Z')}` : '';

	let url = `${GOVINFO_BASE}/collections/${collectionCode}/${startDateEncoded}?pageSize=${PAGE_SIZE}&offsetMark=*${endDateParam}`;

	while (url && packages.length < maxCount) {
		console.log(`  → Fetching collection page: ${packages.length} packages so far…`);
		const resp = await govFetch(url);
		const data: GovInfoCollectionResponse = await resp.json();

		if (!data.packages?.length) break;
		packages.push(...data.packages);

		if (packages.length >= maxCount) break;

		// nextPage already has all params except api_key (which govFetch appends)
		url = data.nextPage ?? '';
	}

	return packages.slice(0, maxCount);
}

/** Result of downloading a package — both raw source and extracted text. */
interface DownloadResult {
	text: string;
	rawContent: Buffer;
	rawMimeType: string;  // 'text/html' or 'application/pdf'
	rawExtension: string; // '.html' or '.pdf'
}

/** Download best available text content for a package.
 *
 * Returns both extracted plain text AND raw source (HTML or PDF) for provenance.
 * GovInfo download endpoint format: /packages/{packageId}/{format}
 * Note: the API summary's "txtLink" actually points to the htm endpoint.
 */
async function downloadPackageContent(pkg: GovInfoPackage): Promise<DownloadResult | null> {
	// Fetch the package summary to get download links
	const summaryResp = await govFetch(`${GOVINFO_BASE}/packages/${pkg.packageId}/summary`);
	const summary = await summaryResp.json() as any;

	const downloads = summary.download ?? {};

	// Strip api_key from any URL (govFetch adds it back)
	const stripKey = (u: string | undefined) => u ? u.replace(/[?&]api_key=[^&]*/g, '').replace(/[?&]$/, '') : undefined;

	const htmUrl = stripKey(downloads.txtLink ?? downloads.htmLink);
	const pdfUrl = stripKey(downloads.pdfLink);

	// Try HTML first (preserves structure better)
	if (htmUrl) {
		try {
			const r = await govFetch(htmUrl);
			const html = await r.text();
			const extracted = extractTextFromMarkup(html);
			if (extracted.length > 200) {
				return {
					text: extracted.slice(0, 5_000_000),
					rawContent: Buffer.from(html, 'utf8'),
					rawMimeType: 'text/html',
					rawExtension: '.html',
				};
			}
		} catch (e: any) {
			console.warn(`  htm download failed: ${e.message}`);
		}
	}

	// PDF fallback
	if (pdfUrl) {
		try {
			const r = await govFetch(pdfUrl);
			const buf = Buffer.from(await r.arrayBuffer());
			const pdfParse = (await import('pdf-parse')).default;
			const data = await pdfParse(buf);
			if (data.text.length > 200) {
				return {
					text: data.text.slice(0, 5_000_000),
					rawContent: buf,
					rawMimeType: 'application/pdf',
					rawExtension: '.pdf',
				};
			}
		} catch (e: any) {
			console.warn(`  pdf download failed: ${e.message}`);
		}
	}

	return null;
}

// ── Embedding (batch) ─────────────────────────────────────────────────────────

/** Embed a single text (fallback for one-off calls). */
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
	} catch {
		return null;
	}
}

/** Embed a batch of texts via Ollama /api/embed (supports array input). */
async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
	if (!texts.length) return [];
	try {
		const resp = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBED_MODEL, input: texts.map(t => t.slice(0, 2048)) }),
		});
		if (!resp.ok) {
			// Fallback: embed one-by-one
			return Promise.all(texts.map(t => embedText(t)));
		}
		const json = await resp.json() as { embeddings?: number[][] };
		const embeddings = json.embeddings ?? [];
		return texts.map((_, i) => embeddings[i] ?? null);
	} catch {
		return texts.map(() => null);
	}
}

// ── Qdrant ────────────────────────────────────────────────────────────────────

async function ensureQdrantCollection(): Promise<void> {
	const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`);
	if (r.status === 404) {
		await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vectors:     { size: 768, distance: 'Cosine', on_disk: true },
				sparse_vectors: { bm25: {} },
				hnsw_config: { on_disk: true },
			}),
		});
		console.log(`  Qdrant collection '${QDRANT_COLLECTION}' created (with bm25 sparse).`);
	} else {
		// Ensure sparse vector support on existing collection
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

interface QdrantHybridPoint {
	id: string;
	vector: Record<string, unknown>;
	payload: Record<string, unknown>;
}

/** Upsert points with both dense + BM42 sparse vectors to Qdrant. */
async function upsertToQdrant(points: QdrantPoint[]): Promise<void> {
	if (!points.length) return;

	// Convert to named-vector format with sparse BM42 vectors
	const hybridPoints: QdrantHybridPoint[] = points.map(p => {
		const chunkText = (p.payload.text as string) ?? '';
		const sparse = generateSparseVector(chunkText);
		return {
			id: p.id,
			vector: {
				'': p.vector,  // default (unnamed) dense vector
				bm25: { indices: sparse.indices, values: sparse.values },
			},
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
async function getOrCreateJurisdiction(code: string, name?: string, level?: string): Promise<number | null> {
	const r = await pool.query<{ id: number }>('SELECT id FROM jurisdictions WHERE code = $1 LIMIT 1', [code]);
	if (r.rows[0]) return r.rows[0].id;
	if (!name) return null; // can't create without a name
	const ins = await pool.query<{ id: number }>(
		'INSERT INTO jurisdictions (code, name, level) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING RETURNING id',
		[code, name, level ?? 'federal']
	);
	// ON CONFLICT DO NOTHING returns 0 rows on conflict — re-select
	if (ins.rows[0]) return ins.rows[0].id;
	const r2 = await pool.query<{ id: number }>('SELECT id FROM jurisdictions WHERE code = $1 LIMIT 1', [code]);
	return r2.rows[0]?.id ?? null;
}

async function setDocumentStatus(docId: string, status: string): Promise<void> {
	if (!docId) return; // guard against null/empty id
	await pool.query("UPDATE library_documents SET processing_status = $1, updated_at = now() WHERE id = $2", [status, docId]);
}

// ── MinIO upload ──────────────────────────────────────────────────────────────
async function ensureMinIOBucket(): Promise<void> {
	if (DRY_RUN) return;
	try {
		const exists = await minio.bucketExists(MINIO_BUCKET);
		if (!exists) { await minio.makeBucket(MINIO_BUCKET); console.log(`  MinIO bucket '${MINIO_BUCKET}' created.`); }
	} catch (e: any) {
		console.warn(`  MinIO unavailable: ${e.message}`);
	}
}

async function uploadTextToMinIO(key: string, text: string): Promise<boolean> {
	if (DRY_RUN) return true;
	try {
		const buf = Buffer.from(text, 'utf8');
		await minio.putObject(MINIO_BUCKET, key, buf, buf.length, { 'Content-Type': 'text/plain; charset=utf-8' });
		return true;
	} catch {
		return false;
	}
}

/** Upload raw source artifact (HTML or PDF) to MinIO for provenance. */
async function uploadRawToMinIO(key: string, content: Buffer, mimeType: string): Promise<boolean> {
	if (DRY_RUN) return true;
	try {
		await minio.putObject(MINIO_BUCKET, key, content, content.length, { 'Content-Type': mimeType });
		return true;
	} catch {
		return false;
	}
}

// ── Hierarchy helpers ─────────────────────────────────────────────────────────

/** Map a heading string to the legal_node_type enum. */
function classifyNodeType(heading: string): string {
	const h = heading.toLowerCase().trim();
	if (/^title\b/i.test(h))                           return 'title';
	if (/^article\b/i.test(h))                         return 'article';
	if (/^chapter\b/i.test(h) || /^ch\.\s/i.test(h))   return 'chapter';
	if (/^part\b/i.test(h))                             return 'part';
	if (/^subchapter\b|^subpart\b/i.test(h))            return 'part';
	if (/^§\s*\d|^section\b|^sec\.\s/i.test(h))         return 'section';
	if (/^subsection\b|^\([a-z]\)/i.test(h))            return 'subsection';
	if (/^paragraph\b|^\(\d+\)/i.test(h))               return 'paragraph';
	if (/^clause\b/i.test(h))                           return 'clause';
	if (/^definition|^glossary/i.test(h))               return 'definition';
	if (/^appendix\b|^annex\b/i.test(h))                return 'appendix';
	if (/^note\b|^comment/i.test(h))                    return 'note';
	return 'section';
}

/** Derive a URL-safe node path segment from a heading. */
function headingToSlug(heading: string): string {
	return heading
		.toLowerCase()
		.replace(/[^a-z0-9\s§-]/g, '')
		.replace(/\s+/g, '-')
		.slice(0, 80);
}

// ── Definition extraction ─────────────────────────────────────────────────────

interface ExtractedDefinition {
	term: string;
	normalizedTerm: string;
	definitionText: string;
}

/** Extract legal definitions from text (e.g. '"X" means ...', 'the term "X" is defined as ...'). */
function extractDefinitions(text: string): ExtractedDefinition[] {
	const defs: ExtractedDefinition[] = [];
	const seen = new Set<string>();

	// Pattern 1: "term" means/includes/refers to ...
	const p1 = /["\u201c]([^"\u201d]{2,60})["\u201d]\s+(?:means?|includes?|refers?\s+to|shall\s+mean|is\s+defined\s+as)\s+([^.;]{10,300})[.;]/gi;
	for (const m of text.matchAll(p1)) {
		const term = m[1].trim();
		const norm = term.toLowerCase().replace(/\s+/g, ' ');
		if (!seen.has(norm)) {
			seen.add(norm);
			defs.push({ term, normalizedTerm: norm, definitionText: m[2].trim() });
		}
	}

	// Pattern 2: The term "X" ...
	const p2 = /the\s+term\s+["\u201c]([^"\u201d]{2,60})["\u201d]\s*[-\u2014]\s*([^.;]{10,300})[.;]/gi;
	for (const m of text.matchAll(p2)) {
		const term = m[1].trim();
		const norm = term.toLowerCase().replace(/\s+/g, ' ');
		if (!seen.has(norm)) {
			seen.add(norm);
			defs.push({ term, normalizedTerm: norm, definitionText: m[2].trim() });
		}
	}

	return defs;
}

// ── Core ingestion ────────────────────────────────────────────────────────────

async function ingestPackage(pkg: GovInfoPackage): Promise<'indexed' | 'skipped' | 'failed'> {
	const meta = COLLECTION_META[COLLECTION_CODE] ?? COLLECTION_META['USCODE'];
	const title = pkg.title ?? pkg.packageId;

	console.log(`\n  Package: ${pkg.packageId}`);
	console.log(`  Title:   ${title.slice(0, 80)}`);

	// DRY_RUN: skip all I/O — just report what would be indexed
	if (DRY_RUN) {
		console.log(`  [DRY RUN] Would index: corpus_type=${meta.corpusType} jurisdiction=${meta.jurisdiction}`);
		return 'indexed';
	}

	// 1. Download content (both raw + extracted text)
	let download: DownloadResult | null = null;
	try {
		download = await downloadPackageContent(pkg);
	} catch (e: any) {
		console.warn(`  Download failed: ${e.message}`);
		return 'failed';
	}

	if (!download || download.text.trim().length < 100) {
		console.warn(`  Empty/too-short content — skipping`);
		return 'skipped';
	}

	const { text } = download;

	// 2. Hash for dedup
	const hash = createHash('sha256').update(text).digest('hex');

	// 3. Fix #1: Skip if already indexed (explicit lookup — partial unique index prevents ON CONFLICT)
	const existing = await pool.query<{ id: string; processing_status: string }>(
		'SELECT id, processing_status FROM library_documents WHERE source_hash = $1 LIMIT 1',
		[hash]
	);
	if (existing.rows.length > 0 && existing.rows[0].processing_status === 'complete') {
		console.log(`  ↷ Skipped (already indexed): ${existing.rows[0].id}`);
		return 'skipped';
	}

	// 4. Jurisdiction FK
	const jurisdictionId = await getOrCreateJurisdiction(meta.jurisdiction, meta.jurisdiction, 'federal');

	// 5. Fix #3+4: Chunk text with hierarchy using parseSections + chunkLegalDocument
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
	let chunks: IngestChunk[] = [];
	try {
		const mod = await import('../src/lib/server/indexer/legal-chunker.js');
		const chunkFn = mod.chunkLegalDocument ?? (mod as any).default?.chunkLegalDocument;
		if (typeof chunkFn !== 'function') throw new Error('chunkLegalDocument not found in exports');

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
	} catch (e: any) {
		console.warn(`  legal-chunker unavailable (${e.message}), using fallback splitter`);
		const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 2000, chunkOverlap: 200 });
		const docs = await splitter.createDocuments([text]);
		chunks = docs.map((d, i) => ({
			text: d.pageContent,
			nodeType: 'section',
			sectionPath: [],
			depth: 0,
			chunkIndex: i,
			heading: undefined,
			citations: [],
			startOffset: 0,
			endOffset: 0,
			tokenCount: Math.ceil(d.pageContent.length / 4),
		}));
	}

	if (!chunks.length) { console.warn('  No chunks extracted — skipping'); return 'failed'; }
	console.log(`  Chunks: ${chunks.length} | Text: ${(text.length / 1024).toFixed(0)} KB`);

	// 6. Fix #8: Upload both raw source and extracted text to MinIO
	const minioBase = `govinfo/${COLLECTION_CODE.toLowerCase()}/${pkg.packageId}`;
	await uploadTextToMinIO(`${minioBase}.txt`, text);
	await uploadRawToMinIO(`${minioBase}${download.rawExtension}`, download.rawContent, download.rawMimeType);

	// 7. Transaction: library_documents → versions → legal_nodes → legal_chunks → definitions
	const client = await pool.connect();
	let docId: string | null = null;
	try {
		await client.query('BEGIN');

		const officialUrl = `https://www.govinfo.gov/content/pkg/${pkg.packageId}/htm/${pkg.packageId}.htm`;

		// Fix #1: Explicit upsert — partial unique index can't use ON CONFLICT
		if (existing.rows.length > 0) {
			// Re-index existing doc — update metadata and wipe old nodes/chunks (CASCADE)
			docId = existing.rows[0].id;
			await client.query(`
				UPDATE library_documents
				SET processing_status = 'structuring', updated_at = now(),
				    title = $1, official_url = $2, minio_key = $3
				WHERE id = $4
			`, [title.slice(0, 500), officialUrl, `${minioBase}.txt`, docId]);
			// Cascade delete old nodes (and chunks via FK cascade)
			await client.query('DELETE FROM legal_nodes WHERE document_id = $1', [docId]);
		} else {
			const docRes = await client.query<{ id: string }>(`
				INSERT INTO library_documents
					(source_type, corpus_type, jurisdiction_id, title, citation,
					 official_url, source_hash, mime_type, minio_key,
					 is_official, processing_status, uploaded_by)
				VALUES
					('govinfo', $1, $2, $3, $4,
					 $5, $6, 'text/plain', $7,
					 true, 'structuring', NULL)
				RETURNING id
			`, [
				meta.corpusType,
				jurisdictionId,
				title.slice(0, 500),
				pkg.packageId,
				officialUrl,
				hash,
				`${minioBase}.txt`,
			]);
			docId = docRes.rows[0].id;
		}

		// Version row
		await client.query(`
			INSERT INTO library_document_versions (document_id, version_label, source_date, is_current)
			VALUES ($1, 'initial', $2, true)
			ON CONFLICT DO NOTHING
		`, [docId, pkg.dateIssued ? new Date(pkg.dateIssued) : null]);

		// Fix #4: Build hierarchical legal_nodes from sectionPath
		// Map sectionPath → nodeId for parent linking
		const pathToNodeId = new Map<string, string>();

		// Create document-level root node
		const rootRes = await client.query<{ id: string }>(`
			INSERT INTO legal_nodes
				(document_id, node_type, heading, node_path, depth, ordinal, full_text, text_clean)
			VALUES ($1, 'document', $2, 'root', 0, '0', $3, $3)
			RETURNING id
		`, [docId, title.slice(0, 500), text.slice(0, 50000)]);
		const rootNodeId = rootRes.rows[0].id;
		pathToNodeId.set('', rootNodeId);

		for (let i = 0; i < chunks.length; i++) {
			const c = chunks[i];
			const sp = c.sectionPath;

			// Ensure parent nodes exist for each prefix of sectionPath
			let parentNodeId = rootNodeId;
			if (sp.length > 0) {
				for (let d = 0; d < sp.length; d++) {
					const pathKey = sp.slice(0, d + 1).join('/');
					if (!pathToNodeId.has(pathKey)) {
						const heading = sp[d];
						const nodeType = classifyNodeType(heading);
						const slug = sp.slice(0, d + 1).map(headingToSlug).join('/');
						const sectionRes = await client.query<{ id: string }>(`
							INSERT INTO legal_nodes
								(document_id, parent_node_id, node_type, heading, citation_label,
								 node_path, depth, ordinal, full_text, text_clean)
							VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', '')
							RETURNING id
						`, [
							docId,
							parentNodeId,
							nodeType,
							heading,
							heading, // citation_label
							slug,
							d + 1,
							String(d),
						]);
						pathToNodeId.set(pathKey, sectionRes.rows[0].id);
					}
					parentNodeId = pathToNodeId.get(pathKey)!;
				}
			}

			// The chunk's node is the deepest in its sectionPath (or root if no path)
			const chunkParentNodeId = sp.length > 0
				? pathToNodeId.get(sp.join('/'))!
				: rootNodeId;

			// Insert leaf node for this chunk
			const leafSlug = sp.length > 0
				? sp.map(headingToSlug).join('/') + `/chunk-${i}`
				: `chunk-${i}`;

			const nodeRes = await client.query<{ id: string }>(`
				INSERT INTO legal_nodes
					(document_id, parent_node_id, node_type, heading, citation_label,
					 node_path, depth, ordinal,
					 char_start, char_end,
					 full_text, text_clean)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
				RETURNING id
			`, [
				docId,
				chunkParentNodeId,
				c.nodeType,
				c.heading ?? null,
				c.heading ?? null,
				leafSlug,
				c.depth + 1,
				String(i),
				c.startOffset || null,
				c.endOffset || null,
				c.text,
			]);
			const nodeId = nodeRes.rows[0].id;

			await client.query(`
				INSERT INTO legal_chunks (legal_node_id, chunk_index, chunk_text, token_count,
				                          char_start, char_end)
				VALUES ($1, $2, $3, $4, $5, $6)
				ON CONFLICT (legal_node_id, chunk_index) DO NOTHING
			`, [nodeId, i, c.text, c.tokenCount, c.startOffset || null, c.endOffset || null]);
		}

		// Fix #5: Extract and store definitions
		const allDefs = extractDefinitions(text);
		if (allDefs.length > 0) {
			console.log(`  Definitions found: ${allDefs.length}`);
			for (const def of allDefs) {
				await client.query(`
					INSERT INTO legal_definitions (term, normalized_term, defined_in_node_id, definition_text)
					VALUES ($1, $2, $3, $4)
				`, [def.term, def.normalizedTerm, rootNodeId, def.definitionText]);
			}
		}

		await client.query('COMMIT');
		console.log(`  DB write complete: docId=${docId}, nodes=${pathToNodeId.size + chunks.length}`);
	} catch (e: any) {
		await client.query('ROLLBACK');
		console.error(`  Transaction failed: ${e.message}`);
		client.release();
		return 'failed';
	}
	client.release();

	if (!docId) return 'failed';

	// 8. Fix #6+7: Embed chunks concurrently + richer Qdrant payload
	await setDocumentStatus(docId, 'embedding');

	const chunkRows = await pool.query<{
		id: string; chunk_text: string; chunk_index: number; legal_node_id: string;
		heading: string | null; node_path: string | null; node_type: string | null;
		citation_label: string | null; depth: number;
	}>(
		`SELECT lc.id, lc.chunk_text, lc.chunk_index, lc.legal_node_id,
		        ln.heading, ln.node_path, ln.node_type, ln.citation_label, ln.depth
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
		const batchTexts = batch.map(r => r.chunk_text);

		// Batch embed all texts in one Ollama call (Fix #6: already batched, much better than 1-by-1)
		const vectors = await embedBatch(batchTexts);

		// Fix #6: Concurrent DB updates within batch
		const dbUpdates: Promise<void>[] = [];
		const qdrantPoints: QdrantPoint[] = [];

		for (let j = 0; j < batch.length; j++) {
			const vec = vectors[j];
			if (!vec) continue;
			const row = batch[j];

			dbUpdates.push(
				pool.query("UPDATE legal_chunks SET embedding = $1::vector WHERE id = $2", [`[${vec.join(',')}]`, row.id]).then(() => {})
			);

			// Fix #7: Richer Qdrant payload
			qdrantPoints.push({
				id: row.id,
				vector: vec,
				payload: {
					chunk_id:          row.id,
					document_id:       docId,
					legal_node_id:     row.legal_node_id,
					chunk_index:       row.chunk_index,
					corpus_type:       meta.corpusType,
					jurisdiction:      meta.jurisdiction,
					source_type:       meta.sourceType,
					title:             title.slice(0, 200),
					package_id:        pkg.packageId,
					text:              row.chunk_text.slice(0, 500),
					heading:           row.heading ?? '',
					node_path:         row.node_path ?? '',
					node_type:         row.node_type ?? 'section',
					citation_label:    row.citation_label ?? '',
					depth:             row.depth,
					official_url:      `https://www.govinfo.gov/content/pkg/${pkg.packageId}/htm/${pkg.packageId}.htm`,
					source_confidence: 1.0,  // official government source
					date_issued:       pkg.dateIssued ?? null,
				},
			});
			embedded++;
		}

		// Wait for all DB updates in this batch concurrently
		await Promise.all(dbUpdates);
		// Upsert includes dense + BM42 sparse vectors
		await upsertToQdrant(qdrantPoints);
		if (i % 256 === 0 && i > 0) console.log(`  Embedded ${i}/${chunkRows.rows.length} chunks…`);
	}

	await setDocumentStatus(docId, 'complete');
	console.log(`  ✓ Indexed: ${chunks.length} chunks, ${embedded} embedded → ${docId}`);
	return 'indexed';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	const startTime = Date.now();
	console.log(`\nGovInfo Federal Corpus Ingest`);
	console.log(`  Collection:   ${COLLECTION_CODE}`);
	console.log(`  Max packages: ${MAX_PACKAGES}`);
	console.log(`  DRY_RUN:      ${DRY_RUN}`);
	console.log(`  API key:      ${GOVINFO_API_KEY.slice(0, 8)}****`);
	if (START_DATE) console.log(`  Start date:   ${START_DATE}`);
	if (END_DATE)   console.log(`  End date:     ${END_DATE}`);

	if (!DRY_RUN) {
		await ensureMinIOBucket();
		await ensureQdrantCollection();
	}

	// Fetch package list
	console.log(`\nFetching package list from GovInfo ${COLLECTION_CODE}…`);
	let packages: GovInfoPackage[];
	try {
		packages = await fetchPackageList(COLLECTION_CODE, MAX_PACKAGES);
	} catch (e: any) {
		console.error(`Failed to fetch package list: ${e.message}`);
		await pool.end();
		process.exit(1);
	}

	console.log(`Found ${packages.length} packages to process`);

	const results = { indexed: 0, skipped: 0, failed: 0 };
	const errors: Array<{ pkg: string; error: string }> = [];

	for (const pkg of packages) {
		try {
			const result = await ingestPackage(pkg);
			results[result]++;
		} catch (e: any) {
			console.error(`  FATAL for ${pkg.packageId}: ${e.message}`);
			errors.push({ pkg: pkg.packageId, error: e.message });
			results.failed++;
		}
	}

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	console.log(`\n═══════════════════════════════════`);
	console.log(`GovInfo ${COLLECTION_CODE} ingest complete (${elapsed}s)`);
	console.log(`  Indexed:  ${results.indexed}`);
	console.log(`  Skipped:  ${results.skipped}`);
	console.log(`  Failed:   ${results.failed}`);
	if (errors.length > 0) {
		console.log(`\nErrors:`);
		errors.forEach(e => console.log(`  ${e.pkg}: ${e.error}`));
	}

	await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
