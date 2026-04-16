/**
 * POST /api/library/crawl
 *
 * Crawl one or more URLs → chunk → embed → upsert into library corpus (Qdrant +
 * library_documents DB rows).  Mirrors the PDF ingestion pipeline but for web content.
 *
 * corpusType 'docs'  → stored with source_type='web' + corpus_type='treatise'
 *                       (dev docs, API references — separated from legal corpus)
 * corpusType 'legal' → stored with corpus_type='statute'/'regulation'/etc.
 *
 * Uses existing /api/web/crawl proxy (langextract → fallback) for extraction,
 * then chunks + embeds exactly like ingestion-worker.ts.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { randomUUID, createHash } from 'crypto';
import { pool } from '$lib/server/db/client';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { validateExternalUrl } from '$lib/server/security/url-validator.js';

// ── Schema ────────────────────────────────────────────────────────────────────

const crawlSchema = z.object({
	urls: z.array(z.string().url()).min(1).max(20),
	corpusType: z
		.enum(['constitution', 'statute', 'regulation', 'bill', 'case', 'glossary', 'treatise', 'other', 'docs'])
		.default('treatise'),
	jurisdiction: z.string().max(50).default('federal'),
	/** When true, skip URLs whose source_hash is already in DB */
	skipDuplicates: z.boolean().default(true),
});

const CHUNK_MAX_CHARS = 1200;
const EMBED_BATCH     = 16;

// ── Simple paragraph chunker (shared logic with ingest-codebase-docs) ─────────

function chunkText(text: string): Array<{ text: string; index: number }> {
	const paragraphs = text.split(/\n\n+/);
	const chunks: Array<{ text: string; index: number }> = [];
	let idx = 0;
	let current = '';

	for (const para of paragraphs) {
		if ((current + para).length > CHUNK_MAX_CHARS && current.length > 0) {
			if (current.trim().length > 30) chunks.push({ text: current.trim(), index: idx++ });
			current = para;
		} else {
			current += (current ? '\n\n' : '') + para;
		}
	}
	if (current.trim().length > 30) chunks.push({ text: current.trim(), index: idx });
	return chunks;
}

// ── Jurisdiction lookup (cached per request) ──────────────────────────────────

async function getJurisdictionId(code: string): Promise<number | null> {
	const res = await pool.query(`SELECT id FROM jurisdictions WHERE code = $1 LIMIT 1`, [code]);
	return res.rows[0]?.id ?? null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => null);
	const parsed = crawlSchema.safeParse(raw);
	if (!parsed.success)
		return json({ error: parsed.error.issues[0]?.message }, { status: 400 });

	const { urls, corpusType, jurisdiction, skipDuplicates } = parsed.data;

	// SSRF check every URL
	for (const url of urls) {
		const check = validateExternalUrl(url);
		if (!check.valid) return json({ error: `SSRF: ${url} — ${check.error}` }, { status: 400 });
	}

	const jurisdictionId = await getJurisdictionId(jurisdiction);

	const result = {
		created: 0,
		skipped: 0,
		failed:  0,
		items: [] as Array<{
			url: string;
			status: 'created' | 'skipped' | 'failed';
			documentId?: string;
			chunks?: number;
			error?: string;
		}>,
	};

	for (const url of urls) {
		try {
			// 1. Crawl via existing /api/web/crawl proxy
			const crawlRes = await fetch('/api/web/crawl', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url, extractText: true, generateEmbedding: false }),
			});
			if (!crawlRes.ok) throw new Error(`Crawl failed: HTTP ${crawlRes.status}`);
			const crawled = await crawlRes.json() as { title: string; text: string };

			const text  = (crawled.text ?? '').trim();
			const title = (crawled.title || new URL(url).hostname) + ' — ' + new URL(url).pathname;
			if (text.length < 50) throw new Error('Extracted text too short');

			const hash = createHash('sha256').update(text).digest('hex');

			// 2. Dedup
			if (skipDuplicates) {
				const existing = await pool.query(
					`SELECT id FROM library_documents WHERE source_hash = $1 LIMIT 1`,
					[hash]
				);
				if (existing.rows[0]) {
					result.skipped++;
					result.items.push({ url, status: 'skipped', documentId: existing.rows[0].id });
					continue;
				}
			}

			const documentId = randomUUID();
			const versionId  = randomUUID();
			const rootNodeId = randomUUID();
			const dbCorpus   = corpusType === 'docs' ? 'treatise' : corpusType;

			// 3. library_documents row
			await pool.query(
				`INSERT INTO library_documents
				   (id, source_type, corpus_type, jurisdiction_id, title, short_title,
				    source_hash, official_url, processing_status, created_at, updated_at)
				 VALUES ($1, 'web', $2, $3, $4, $5, $6, $7, 'processing', now(), now())
				 ON CONFLICT (id) DO NOTHING`,
				[documentId, dbCorpus, jurisdictionId, title, title.slice(0, 80), hash, url]
			);

			// 4. Version + root node
			await pool.query(
				`INSERT INTO library_document_versions (id, document_id, version_label, source_date, is_current)
				 VALUES ($1, $2, 'auto', now(), true) ON CONFLICT DO NOTHING`,
				[versionId, documentId]
			);
			await pool.query(
				`INSERT INTO legal_nodes
				   (id, document_id, version_id, parent_node_id, node_type, heading,
				    citation_label, node_path, depth, full_text, text_clean)
				 VALUES ($1, $2, $3, NULL, 'document', $4, NULL, 'root', 0, $5, $5)
				 ON CONFLICT DO NOTHING`,
				[rootNodeId, documentId, versionId, title, text.slice(0, 100_000)]
			);

			// 5. Chunk + insert legal_chunks
			const chunks = chunkText(text);
			const chunkRows: Array<{ id: string; text: string; index: number }> = [];
			for (const c of chunks) {
				const chunkId = randomUUID();
				chunkRows.push({ id: chunkId, text: c.text, index: c.index });
				await pool.query(
					`INSERT INTO legal_chunks
					   (id, legal_node_id, chunk_index, chunk_text, token_count, char_start, char_end)
					 VALUES ($1, $2, $3, $4, $5, 0, 0)
					 ON CONFLICT (legal_node_id, chunk_index) DO NOTHING`,
					[chunkId, rootNodeId, c.index, c.text, Math.ceil(c.text.length / 4)]
				);
			}

			// 6. Embed + Qdrant upsert
			for (let i = 0; i < chunkRows.length; i += EMBED_BATCH) {
				const batch = chunkRows.slice(i, i + EMBED_BATCH);
				try {
					const { vectors } = await generateEmbeddings(batch.map((c) => c.text.slice(0, 1024)));
					const points = batch
						.map((c, j) => ({ c, v: vectors[j] }))
						.filter(({ v }) => v?.length);

					if (points.length > 0) {
						await qdrant.batchUpsert({
							collection: 'documents',
							points: points.map(({ c, v }) => ({
								id: c.id,
								vector: { content: v },
								payload: {
									document_id: documentId,
									title,
									chunk_text: c.text,
									node_id: rootNodeId,
									chunk_index: c.index,
									jurisdiction_code: jurisdiction,
									corpus_type: dbCorpus,
									source_url: url,
									source_type: corpusType === 'docs' ? 'dev-docs' : 'web',
								},
							})),
							batchSize: 100,
						});
						for (const { c, v } of points) {
							await pool.query(`UPDATE legal_chunks SET embedding = $1 WHERE id = $2`, [
								`[${v.join(',')}]`,
								c.id,
							]);
						}
					}
				} catch (embedErr) {
					console.warn('[library/crawl] embed batch failed (non-fatal):', embedErr);
				}
			}

			// 7. Mark complete
			await pool.query(
				`UPDATE library_documents SET processing_status = 'complete', updated_at = now() WHERE id = $1`,
				[documentId]
			);

			result.created++;
			result.items.push({ url, status: 'created', documentId, chunks: chunkRows.length });
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			console.error(`[library/crawl] failed for ${url}:`, errMsg);
			result.failed++;
			result.items.push({ url, status: 'failed', error: errMsg });
		}
	}

	return json({
		success: true,
		...result,
		totalUrls: urls.length,
		corpusType,
	});
};
