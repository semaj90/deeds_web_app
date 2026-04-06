#!/usr/bin/env node
/**
 * US Constitution — Full Granite-Docling → Legal Corpus Pipeline
 *
 * Processes all pages through Granite-Docling-258M, then stores in:
 *   MinIO (PDF + extraction JSON), PostgreSQL (library_documents, legal_nodes, legal_chunks),
 *   Qdrant (embedded vectors), Redis (cache).
 *
 * Run from sveltekit-frontend/:
 *   node ../scripts/constitution-pipeline.mjs
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────────────────
const OLLAMA_URL = 'http://localhost:11434';
const QDRANT_URL = 'http://localhost:6333';
const PG_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const MINIO_CONFIG = { endPoint: 'localhost', port: 9000, useSSL: false, accessKey: 'admin', secretKey: 'password' };
const REDIS_CONFIG = { host: 'localhost', port: 6379, password: 'redis' };

const BUCKET = 'legal-library';
const QDRANT_COLLECTION = 'legal_documents';
const EMBED_MODEL = 'embeddinggemma:latest';
const DOCLING_MODEL = 'ibm/granite-docling:258m';
const PDF_RENDER_SCALE = 2.0;
const EMBED_BATCH_SIZE = 32;
const PDF_FILE = path.resolve(__dirname, '../lawpdfs/US_Constitution_with_Declaration_of_Independence_govinfo.pdf');

// ── DocTags Parser (same as granite-docling.ts) ────────────────────────────

function stripLocTags(text) {
	return text.replace(/<loc_\d+>/g, '').trim();
}

function mapTagType(tagName) {
	if (tagName.startsWith('section_header')) return 'heading';
	if (tagName === 'text' || tagName === 'paragraph') return 'paragraph';
	if (tagName === 'table' || tagName === 'otsl') return 'table';
	if (tagName === 'formula') return 'equation';
	if (tagName === 'code') return 'other';
	if (tagName === 'caption' || tagName === 'footnote') return 'paragraph';
	if (tagName === 'page_header') return 'heading';
	if (tagName === 'page_footer') return 'other';
	if (tagName === 'list_item') return 'list';
	if (tagName === 'unordered_list' || tagName === 'ordered_list') return 'list';
	if (tagName === 'picture' || tagName === 'figure') return 'image';
	return 'other';
}

function parseDocTags(raw, pageNumber = 1) {
	const blocks = [];
	const extractBbox = (s) => {
		const locs = [...s.matchAll(/<loc_(\d+)>/g)].map((m) => Number(m[1]));
		return locs.length >= 4 ? [locs[0], locs[1], locs[2], locs[3]] : undefined;
	};
	const leafPattern =
		/<(section_header(?:_level_\d+)?|text|paragraph|list_item|table|otsl|code|formula|caption|footnote|page_header|page_footer|picture|figure|checkbox)>([\s\S]*?)<\/\1>/g;
	let match;
	let foundTags = false;
	while ((match = leafPattern.exec(raw)) !== null) {
		foundTags = true;
		const tagName = match[1];
		const innerRaw = match[2];
		const content = stripLocTags(innerRaw);
		if (!content) continue;
		blocks.push({ type: mapTagType(tagName), text: content, page: pageNumber, bbox: extractBbox(innerRaw) });
	}
	if (!foundTags && raw.trim()) {
		const cleaned = stripLocTags(raw.replace(/<\/?doctag>/g, '').trim());
		if (cleaned) blocks.push({ type: 'paragraph', text: cleaned, page: pageNumber });
	}
	return blocks;
}

// ── Service Helpers ────────────────────────────────────────────────────────

async function ollamaGenerate(model, prompt, images) {
	const res = await fetch(`${OLLAMA_URL}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			prompt,
			images,
			stream: false,
			options: { temperature: 0, num_predict: 8192 },
		}),
		signal: AbortSignal.timeout(120_000),
	});
	if (!res.ok) throw new Error(`Ollama generate error ${res.status}: ${await res.text()}`);
	return (await res.json()).response ?? '';
}

async function ollamaEmbed(texts) {
	const res = await fetch(`${OLLAMA_URL}/api/embed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
		signal: AbortSignal.timeout(60_000),
	});
	if (!res.ok) throw new Error(`Ollama embed error ${res.status}: ${await res.text()}`);
	return (await res.json()).embeddings;
}

async function qdrantEnsureCollection(collection, size = 768) {
	const check = await fetch(`${QDRANT_URL}/collections/${collection}`).catch(() => null);
	if (check?.ok) {
		console.log(`  Qdrant collection '${collection}' exists`);
		return;
	}
	const res = await fetch(`${QDRANT_URL}/collections/${collection}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vectors: { size, distance: 'Cosine' },
			quantization_config: { scalar: { type: 'int8', quantile: 0.99, always_ram: true } },
		}),
	});
	if (!res.ok) console.warn(`  Qdrant create warning: ${await res.text()}`);
	else console.log(`  Created Qdrant collection '${collection}' (${size}-dim, INT8)`);
}

async function qdrantUpsert(collection, points) {
	const res = await fetch(`${QDRANT_URL}/collections/${collection}/points`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ points }),
	});
	if (!res.ok) throw new Error(`Qdrant upsert error ${res.status}: ${await res.text()}`);
	return await res.json();
}

// ── PDF Rendering ──────────────────────────────────────────────────────────

async function loadPdfjs() {
	const pdfjsPath = ['pdfjs-dist', 'legacy', 'build', 'pdf.mjs'].join('/');
	return await import(pdfjsPath);
}

async function loadCanvas() {
	const canvasPath = ['@napi-rs', 'canvas'].join('/');
	return await import(canvasPath);
}

async function renderPdfPage(pdfBuffer, pageNumber) {
	const { getDocument } = await loadPdfjs();
	const { createCanvas } = await loadCanvas();
	const pdfDoc = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
	const page = await pdfDoc.getPage(pageNumber);
	const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
	const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#FFFFFF';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	await page.render({ canvasContext: ctx, viewport }).promise;
	const pngBuffer = canvas.toBuffer('image/png');
	page.cleanup();
	pdfDoc.destroy();
	return Buffer.from(pngBuffer);
}

// ── Main Pipeline ──────────────────────────────────────────────────────────

async function main() {
	console.log('');
	console.log('================================================================');
	console.log('  US Constitution — Full Granite-Docling Pipeline');
	console.log('================================================================');

	// ── 1. Load PDF ──
	if (!fs.existsSync(PDF_FILE)) {
		console.error(`PDF not found: ${PDF_FILE}`);
		process.exit(1);
	}
	const pdfBuffer = fs.readFileSync(PDF_FILE);
	const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
	const { getDocument } = await loadPdfjs();
	const pdfDoc = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
	const totalPages = pdfDoc.numPages;
	pdfDoc.destroy();

	console.log(`\nPDF: ${path.basename(PDF_FILE)}`);
	console.log(`Size: ${Math.round(pdfBuffer.length / 1024)} KB | Pages: ${totalPages} | SHA-256: ${pdfHash.slice(0, 16)}...`);

	// ── 2. Extract ALL pages through Granite-Docling ──
	console.log(`\n--- Granite-Docling Extraction (${totalPages} pages) ---`);
	const allBlocks = [];
	const pageStats = [];
	const extractionStart = Date.now();

	for (let i = 1; i <= totalPages; i++) {
		const pageStart = Date.now();
		process.stdout.write(`  [${String(i).padStart(2)}/${totalPages}] Render`);

		try {
			const pageImage = await renderPdfPage(pdfBuffer, i);
			const base64 = pageImage.toString('base64');
			process.stdout.write(` -> Docling`);

			const raw = await ollamaGenerate(DOCLING_MODEL, 'Convert this page to docling.', [base64]);
			const blocks = parseDocTags(raw, i);
			allBlocks.push(...blocks);

			const pageTime = Date.now() - pageStart;
			const types = {};
			blocks.forEach((b) => {
				types[b.type] = (types[b.type] || 0) + 1;
			});
			const textLen = blocks.reduce((s, b) => s + b.text.length, 0);
			const preview = blocks[0]?.text.slice(0, 60) || '(empty)';

			pageStats.push({ page: i, blocks: blocks.length, textLen, timeMs: pageTime, types, preview });
			process.stdout.write(` -> ${blocks.length} blocks, ${textLen} chars (${pageTime}ms)\n`);
		} catch (err) {
			process.stdout.write(` -> ERROR: ${err.message}\n`);
			pageStats.push({ page: i, blocks: 0, textLen: 0, timeMs: Date.now() - pageStart, types: {}, preview: `ERROR: ${err.message}` });
		}
	}

	const extractionTime = Date.now() - extractionStart;
	const fullText = allBlocks.map((b) => b.text).join('\n\n');
	console.log(`\n  DONE: ${allBlocks.length} blocks, ${fullText.length} chars in ${(extractionTime / 1000).toFixed(1)}s`);

	// ── 3. MinIO Upload ──
	console.log('\n--- MinIO Storage ---');
	const documentId = crypto.randomUUID();
	const minioKey = `uploads/raw/${documentId}.pdf`;

	try {
		const Minio = await import('minio');
		const minio = new Minio.Client(MINIO_CONFIG);

		const exists = await minio.bucketExists(BUCKET);
		if (!exists) {
			await minio.makeBucket(BUCKET);
			console.log(`  Created bucket: ${BUCKET}`);
		}

		// Upload PDF
		await minio.putObject(BUCKET, minioKey, pdfBuffer, pdfBuffer.length, {
			'Content-Type': 'application/pdf',
			'x-original-filename': 'US_Constitution.pdf',
		});
		console.log(`  PDF: ${BUCKET}/${minioKey} (${Math.round(pdfBuffer.length / 1024)} KB)`);

		// Upload extraction JSON
		const extractionData = {
			documentId,
			title: 'United States Constitution with Declaration of Independence',
			blocks: allBlocks,
			pageStats,
			totalPages,
			extractionTimeMs: extractionTime,
			pdfHash,
			model: DOCLING_MODEL,
			createdAt: new Date().toISOString(),
		};
		const jsonStr = JSON.stringify(extractionData, null, 2);
		const jsonKey = `uploads/extractions/${documentId}.json`;
		await minio.putObject(BUCKET, jsonKey, Buffer.from(jsonStr), jsonStr.length, {
			'Content-Type': 'application/json',
		});
		console.log(`  JSON: ${BUCKET}/${jsonKey} (${Math.round(jsonStr.length / 1024)} KB)`);
	} catch (err) {
		console.warn(`  MinIO SKIPPED: ${err.message}`);
	}

	// ── 4. PostgreSQL — library_documents + legal_nodes + legal_chunks ──
	console.log('\n--- PostgreSQL (library_documents, legal_nodes, legal_chunks) ---');
	let pool;
	try {
		const pg = await import('pg');
		pool = new pg.default.Pool({ connectionString: PG_URL });

		// Ensure jurisdiction exists
		await pool.query(`INSERT INTO jurisdictions (code, name, country_code, country_name)
			VALUES ('federal', 'Federal', 'US', 'United States')
			ON CONFLICT (code) DO NOTHING`);
		const jurRes = await pool.query(`SELECT id FROM jurisdictions WHERE code = 'federal'`);
		const jurisdictionId = jurRes.rows[0]?.id || null;

		// Check for existing document (same hash)
		const dupCheck = await pool.query(`SELECT id FROM library_documents WHERE source_hash = $1`, [pdfHash]);
		let docDbId = documentId;
		if (dupCheck.rows.length > 0) {
			docDbId = dupCheck.rows[0].id;
			console.log(`  Document already exists (id: ${docDbId}), updating...`);
			await pool.query(
				`UPDATE library_documents SET processing_status = 'complete', page_count = $1, updated_at = NOW() WHERE id = $2`,
				[totalPages, docDbId]
			);
		} else {
			await pool.query(
				`INSERT INTO library_documents (id, source_type, corpus_type, jurisdiction_id, title, citation, source_hash, mime_type, minio_key, page_count, processing_status, is_official, source_confidence, source_kind, created_at, updated_at)
				VALUES ($1, 'fetched', 'constitution', $2, $3, $4, $5, 'application/pdf', $6, $7, 'complete', true, 'high', 'local_pdf', NOW(), NOW())`,
				[
					documentId,
					jurisdictionId,
					'United States Constitution with Declaration of Independence',
					'U.S. Const.',
					pdfHash,
					minioKey,
					totalPages,
				]
			);
			docDbId = documentId;
			console.log(`  library_documents: ${docDbId}`);
		}

		// Create ingestion_jobs record
		const jobId = crypto.randomUUID();
		await pool.query(
			`INSERT INTO ingestion_jobs (id, document_id, stage, status, progress, metrics_json, created_at, updated_at)
			VALUES ($1, $2, 'complete', 'complete', 100, $3, NOW(), NOW())
			ON CONFLICT DO NOTHING`,
			[
				jobId,
				docDbId,
				JSON.stringify({ pageCount: totalPages, blockCount: allBlocks.length, extractionMethod: 'granite-docling', extractionTimeMs: extractionTime }),
			]
		);
		console.log(`  ingestion_jobs: ${jobId}`);

		// Build legal_nodes from headings
		const rootNodeId = crypto.randomUUID();
		await pool.query(
			`INSERT INTO legal_nodes (id, document_id, node_type, heading, citation_label, node_path, depth)
			VALUES ($1, $2, 'document', $3, 'U.S. Const.', 'root', 0)
			ON CONFLICT DO NOTHING`,
			[rootNodeId, docDbId, 'United States Constitution']
		);

		// Group blocks by headings to build hierarchy
		let currentSection = null;
		let currentNodeId = rootNodeId;
		let chunkIndex = 0;
		let nodeCount = 1;
		let chunkCount = 0;
		const nodeIds = new Map(); // heading -> nodeId

		for (const block of allBlocks) {
			if (block.type === 'heading') {
				const heading = block.text.trim();
				if (nodeIds.has(heading)) {
					currentNodeId = nodeIds.get(heading);
					continue;
				}
				currentNodeId = crypto.randomUUID();
				currentSection = heading;
				chunkIndex = 0;

				// Detect node type from heading
				let nodeType = 'section';
				let depth = 1;
				if (/^Article\s/i.test(heading)) {
					nodeType = 'article';
					depth = 1;
				} else if (/^Section\s/i.test(heading)) {
					nodeType = 'section';
					depth = 2;
				} else if (/^Amendment\s/i.test(heading)) {
					nodeType = 'article';
					depth = 1;
				} else if (/^Preamble/i.test(heading)) {
					nodeType = 'section';
					depth = 1;
				}

				const citationLabel = heading.startsWith('Amendment')
					? `U.S. Const. amend. ${heading.replace('Amendment ', '')}`
					: heading.startsWith('Article')
						? `U.S. Const. art. ${heading.replace('Article ', '')}`
						: heading;

				await pool.query(
					`INSERT INTO legal_nodes (id, document_id, parent_node_id, node_type, heading, citation_label, node_path, depth)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
					ON CONFLICT DO NOTHING`,
					[
						currentNodeId,
						docDbId,
						rootNodeId,
						nodeType,
						heading,
						citationLabel,
						heading.toLowerCase().replace(/\s+/g, '-'),
						depth,
					]
				);
				nodeIds.set(heading, currentNodeId);
				nodeCount++;
			} else if (block.text.length > 10) {
				// Insert as legal_chunk
				const chunkId = crypto.randomUUID();
				await pool.query(
					`INSERT INTO legal_chunks (id, legal_node_id, chunk_type, content, chunk_index, created_at)
					VALUES ($1, $2, $3, $4, $5, NOW())
					ON CONFLICT DO NOTHING`,
					[chunkId, currentNodeId, block.type === 'list' ? 'text' : 'text', block.text, chunkIndex++]
				);
				chunkCount++;
			}
		}

		console.log(`  legal_nodes: ${nodeCount} | legal_chunks: ${chunkCount}`);
	} catch (err) {
		console.warn(`  PostgreSQL SKIPPED: ${err.message}`);
	}

	// ── 5. Embed with embeddinggemma + Qdrant upsert ──
	console.log('\n--- Embedding (embeddinggemma) + Qdrant ---');
	try {
		// Collect texts for embedding (only blocks with meaningful text)
		const embeddableBlocks = allBlocks.filter((b) => b.text.length > 20);
		console.log(`  Blocks to embed: ${embeddableBlocks.length}`);

		await qdrantEnsureCollection(QDRANT_COLLECTION, 768);

		const qdrantPoints = [];
		for (let batchStart = 0; batchStart < embeddableBlocks.length; batchStart += EMBED_BATCH_SIZE) {
			const batch = embeddableBlocks.slice(batchStart, batchStart + EMBED_BATCH_SIZE);
			const texts = batch.map((b) => b.text);

			process.stdout.write(`  Batch ${Math.floor(batchStart / EMBED_BATCH_SIZE) + 1}/${Math.ceil(embeddableBlocks.length / EMBED_BATCH_SIZE)}: ${texts.length} texts`);

			const embeddings = await ollamaEmbed(texts);

			for (let j = 0; j < batch.length; j++) {
				const block = batch[j];
				const pointId = crypto.randomUUID();
				qdrantPoints.push({
					id: pointId,
					vector: embeddings[j],
					payload: {
						document_id: documentId,
						document_title: 'United States Constitution',
						corpus_type: 'constitution',
						jurisdiction: 'federal',
						content: block.text,
						content_preview: block.text.slice(0, 200),
						block_type: block.type,
						page: block.page,
						source: 'granite-docling',
						created_at: new Date().toISOString(),
					},
				});
			}

			process.stdout.write(` -> ${embeddings.length} vectors\n`);
		}

		// Batch upsert to Qdrant (100 at a time)
		for (let i = 0; i < qdrantPoints.length; i += 100) {
			const batch = qdrantPoints.slice(i, i + 100);
			await qdrantUpsert(QDRANT_COLLECTION, batch);
			process.stdout.write(`  Qdrant upsert: ${Math.min(i + 100, qdrantPoints.length)}/${qdrantPoints.length}\n`);
		}

		console.log(`  DONE: ${qdrantPoints.length} vectors in '${QDRANT_COLLECTION}'`);

		// Also update pgvector embeddings if pool available
		if (pool) {
			let pgUpdated = 0;
			for (let batchStart = 0; batchStart < embeddableBlocks.length; batchStart += EMBED_BATCH_SIZE) {
				const batch = embeddableBlocks.slice(batchStart, batchStart + EMBED_BATCH_SIZE);
				const texts = batch.map((b) => b.text);
				const embeddings = await ollamaEmbed(texts);

				for (let j = 0; j < batch.length; j++) {
					const vectorStr = `[${embeddings[j].join(',')}]`;
					await pool
						.query(
							`UPDATE legal_chunks SET embedding = $1::vector WHERE content = $2 AND legal_node_id IN (SELECT id FROM legal_nodes WHERE document_id = $3)`,
							[vectorStr, batch[j].text, documentId]
						)
						.catch(() => null);
					pgUpdated++;
				}
			}
			console.log(`  pgvector: ${pgUpdated} chunks updated`);
		}
	} catch (err) {
		console.warn(`  Embedding/Qdrant SKIPPED: ${err.message}`);
	}

	// ── 6. Redis Cache ──
	console.log('\n--- Redis Cache ---');
	try {
		const Redis = (await import('ioredis')).default;
		const redis = new Redis(REDIS_CONFIG);

		const cacheKey = `library:doc:${documentId}`;
		const cacheData = {
			id: documentId,
			title: 'United States Constitution with Declaration of Independence',
			corpusType: 'constitution',
			jurisdiction: 'federal',
			pageCount: totalPages,
			blockCount: allBlocks.length,
			fullText: fullText.slice(0, 50_000), // Cap at 50KB for Redis
			extractionMethod: 'granite-docling',
			extractionTimeMs: extractionTime,
			cachedAt: new Date().toISOString(),
		};
		await redis.set(cacheKey, JSON.stringify(cacheData), 'EX', 3600); // 1hr TTL
		console.log(`  Cached: ${cacheKey} (TTL: 1hr)`);

		// Also cache per-page extraction for the viewer
		const pagesCacheKey = `library:doc:${documentId}:pages`;
		await redis.set(pagesCacheKey, JSON.stringify(pageStats), 'EX', 3600);
		console.log(`  Cached: ${pagesCacheKey} (${pageStats.length} pages)`);

		await redis.quit();
	} catch (err) {
		console.warn(`  Redis SKIPPED: ${err.message}`);
	}

	// ── 7. Cleanup ──
	if (pool) await pool.end().catch(() => {});

	// ── 8. Comparison Report ──
	console.log('\n================================================================');
	console.log('  EXTRACTION QUALITY REPORT — US Constitution');
	console.log('================================================================');
	console.log('');

	// Summary
	const totalBlocks = allBlocks.length;
	const totalChars = fullText.length;
	const avgBlocksPerPage = (totalBlocks / totalPages).toFixed(1);
	const avgCharsPerPage = Math.round(totalChars / totalPages);
	const avgTimePerPage = Math.round(extractionTime / totalPages);
	const typeDistribution = {};
	allBlocks.forEach((b) => {
		typeDistribution[b.type] = (typeDistribution[b.type] || 0) + 1;
	});

	console.log(`  Total pages:     ${totalPages}`);
	console.log(`  Total blocks:    ${totalBlocks} (avg ${avgBlocksPerPage}/page)`);
	console.log(`  Total chars:     ${totalChars.toLocaleString()} (avg ${avgCharsPerPage.toLocaleString()}/page)`);
	console.log(`  Total time:      ${(extractionTime / 1000).toFixed(1)}s (avg ${avgTimePerPage}ms/page)`);
	console.log(`  Model:           ${DOCLING_MODEL}`);
	console.log(`  Document ID:     ${documentId}`);
	console.log('');

	// Type distribution
	console.log('  Block Type Distribution:');
	Object.entries(typeDistribution)
		.sort((a, b) => b[1] - a[1])
		.forEach(([type, count]) => {
			const pct = ((count / totalBlocks) * 100).toFixed(1);
			const bar = '#'.repeat(Math.round(count / 2));
			console.log(`    ${type.padEnd(12)} ${String(count).padStart(4)} (${pct.padStart(5)}%) ${bar}`);
		});

	// Per-page table
	console.log('');
	console.log('  Page | Blocks | Chars  | Time   | Types                         | Preview');
	console.log('  ' + '-'.repeat(100));
	for (const ps of pageStats) {
		const typeStr = Object.entries(ps.types)
			.map(([t, c]) => `${c}${t[0]}`)
			.join(' ');
		console.log(
			`  ${String(ps.page).padStart(4)} | ${String(ps.blocks).padStart(6)} | ${String(ps.textLen).padStart(6)} | ${String(ps.timeMs).padStart(5)}ms | ${typeStr.padEnd(29)} | ${ps.preview.slice(0, 40)}`
		);
	}

	// Pages with issues
	const emptyPages = pageStats.filter((p) => p.blocks === 0);
	const lowTextPages = pageStats.filter((p) => p.textLen < 50 && p.blocks > 0);
	if (emptyPages.length > 0) {
		console.log(`\n  Pages with 0 blocks: ${emptyPages.map((p) => p.page).join(', ')}`);
	}
	if (lowTextPages.length > 0) {
		console.log(`  Pages with <50 chars: ${lowTextPages.map((p) => `${p.page}(${p.textLen}c)`).join(', ')}`);
	}

	console.log('\n================================================================');
	console.log(`  Library URL: /library/${documentId}`);
	console.log(`  Reader URL:  /library/${documentId}/reader`);
	console.log('================================================================\n');
}

main().catch((err) => {
	console.error('\nFATAL:', err);
	process.exit(1);
});
