/**
 * POST /api/library/ingest-dev-docs
 *
 * Ingests developer/technical documentation into the library corpus,
 * SEPARATED from legal documents (corpus_type='treatise', jurisdiction='docs').
 *
 * Three source types handled in one pass:
 *  1. Local Markdown files in sveltekit-frontend/data/knowledge/  (always)
 *  2. Local CLAUDE.md + memory/*.md                               (always)
 *  3. Web URLs provided in request body                           (optional)
 *
 * Dedup: SHA-256 hash — already-ingested content is skipped.
 *
 * Body (optional JSON):
 *  {
 *    urls?: string[]     — additional web URLs to crawl + ingest
 *    rescan?: boolean    — re-ingest even if hash already exists (default false)
 *  }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { randomUUID, createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { pool } from '$lib/server/db/client';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { validateExternalUrl } from '$lib/server/security/url-validator.js';
import { kmeansWithCentroids, isPytorchGpuAvailable } from '$lib/server/gpu/pytorch-graph.js';

// ── Config ────────────────────────────────────────────────────────────────────

const SVELTEKIT_ROOT = path.resolve(process.cwd(), '.');         // sveltekit-frontend/
const REPO_ROOT      = path.resolve(process.cwd(), '..');        // repo root
const EMBED_BATCH    = 16;
const CHUNK_MAX      = 1200;

// Local doc directories to always scan
const LOCAL_DOC_DIRS = [
	path.join(SVELTEKIT_ROOT, 'data', 'knowledge'),   // drizzle-schema-reference.md, architecture-reference.md
	path.join(REPO_ROOT, 'memory'),                    // CLAUDE.md memory files
];

// Local single files
const LOCAL_DOC_FILES = [
	path.join(REPO_ROOT, 'CLAUDE.md'),
	path.join(SVELTEKIT_ROOT, 'CLAUDE.md'),
];

// Pre-defined developer doc URLs (TypeScript, Drizzle, SvelteKit, LangChain, Qdrant)
const PRESET_DOC_URLS: Record<string, string[]> = {
	drizzle: [
		'https://orm.drizzle.team/docs/overview',
		'https://orm.drizzle.team/docs/get-started-postgresql',
		'https://orm.drizzle.team/docs/sql',
	],
	sveltekit: [
		'https://kit.svelte.dev/docs/introduction',
		'https://svelte.dev/docs/svelte/overview',
	],
	qdrant: [
		'https://qdrant.tech/documentation/quick-start/',
		'https://qdrant.tech/documentation/concepts/collections/',
	],
	langchain: [
		'https://python.langchain.com/docs/introduction/',
		'https://langchain-ai.github.io/langgraph/concepts/',
	],
	karpathy: [
		'https://raw.githubusercontent.com/karpathy/nanoGPT/master/README.md',
		'https://raw.githubusercontent.com/karpathy/minGPT/master/README.md',
		'https://raw.githubusercontent.com/karpathy/makemore/master/README.md',
		'https://raw.githubusercontent.com/karpathy/llm.c/master/README.md',
		'https://raw.githubusercontent.com/karpathy/nn-zero-to-hero/master/README.md',
		'https://karpathy.github.io/2015/05/21/rnn-effectiveness/',
		'https://karpathy.github.io/2019/04/25/recipe/',
	],
};

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
	urls:   z.array(z.url()).max(30).optional().default([]),
	preset: z.array(z.enum(['drizzle', 'sveltekit', 'qdrant', 'langchain', 'karpathy'])).optional().default([]),
	rescan: z.boolean().optional().default(false),
});

// ── Chunker (same as ingest-codebase-docs) ────────────────────────────────────

function chunkMarkdown(content: string): Array<{ text: string; heading: string; index: number }> {
	const lines = content.split('\n');
	const chunks: Array<{ text: string; heading: string; index: number }> = [];
	let current: string[] = [];
	let heading = 'Overview';
	let idx = 0;

	const flush = () => {
		const text = current.join('\n').trim();
		if (text.length > 30) chunks.push({ text, heading, index: idx++ });
		current = [];
	};

	for (const line of lines) {
		const m = /^#{1,3}\s+(.+)/.exec(line);
		if (m) { flush(); heading = m[1].trim(); current.push(line); }
		else { current.push(line); if (current.join('\n').length > CHUNK_MAX) flush(); }
	}
	flush();
	return chunks;
}

function chunkPlainText(text: string): Array<{ text: string; heading: string; index: number }> {
	const paragraphs = text.split(/\n\n+/);
	const chunks: Array<{ text: string; heading: string; index: number }> = [];
	let current = '';
	let idx = 0;

	for (const p of paragraphs) {
		if ((current + p).length > CHUNK_MAX && current.length > 0) {
			if (current.trim().length > 30) chunks.push({ text: current.trim(), heading: 'Content', index: idx++ });
			current = p;
		} else {
			current += (current ? '\n\n' : '') + p;
		}
	}
	if (current.trim().length > 30) chunks.push({ text: current.trim(), heading: 'Content', index: idx });
	return chunks;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getDocsJurisdictionId(): Promise<number | null> {
	// Use 'federal' as fallback — dev docs don't have a real jurisdiction
	const res = await pool.query(`SELECT id FROM jurisdictions WHERE code = 'federal' LIMIT 1`);
	return res.rows[0]?.id ?? null;
}

// ── Upsert a single document ──────────────────────────────────────────────────

async function upsertDoc(opts: {
	title: string;
	content: string;
	sourceUrl: string;          // file:// or https://
	hash: string;
	jurisdictionId: number | null;
	sourceType: 'markdown' | 'web';
}): Promise<{ documentId: string; chunks: number; clustered: boolean }> {
	const { title, content, sourceUrl, hash, jurisdictionId, sourceType } = opts;
	const documentId = randomUUID();
	const versionId  = randomUUID();
	const rootNodeId = randomUUID();

	await pool.query(
		`INSERT INTO library_documents
		   (id, source_type, corpus_type, jurisdiction_id, title, short_title,
		    source_hash, official_url, processing_status, created_at, updated_at)
		 VALUES ($1, $2, 'treatise', $3, $4, $5, $6, $7, 'processing', now(), now())
		 ON CONFLICT (id) DO NOTHING`,
		[documentId, sourceType, jurisdictionId, title, title.slice(0, 80), hash, sourceUrl]
	);

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
		[rootNodeId, documentId, versionId, title, content.slice(0, 100_000)]
	);

	const mdChunks = content.includes('#')
		? chunkMarkdown(content)
		: chunkPlainText(content);

	const chunkRows: Array<{ id: string; text: string; index: number }> = [];
	for (const c of mdChunks) {
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

	// Embed + GPU cluster + Qdrant
	const allVectors: Array<{ c: { id: string; text: string; index: number }; v: number[] }> = [];
	for (let i = 0; i < chunkRows.length; i += EMBED_BATCH) {
		const batch = chunkRows.slice(i, i + EMBED_BATCH);
		try {
			const { vectors } = await generateEmbeddings(batch.map((c) => c.text.slice(0, 1024)));
			for (let j = 0; j < batch.length; j++) {
				if (vectors[j]?.length) allVectors.push({ c: batch[j], v: vectors[j] });
			}
		} catch (e) {
			console.warn('[ingest-dev-docs] embed batch non-fatal:', e);
		}
	}

	// GPU K-Means cluster assignment across all chunks in this document
	const clusterMap = new Map<string, number>();
	if (allVectors.length >= 4) {
		try {
			const dim = allVectors[0].v.length;
			const flat = new Float32Array(allVectors.length * dim);
			for (let i = 0; i < allVectors.length; i++) {
				flat.set(allVectors[i].v, i * dim);
			}
			const k = Math.max(2, Math.min(Math.ceil(Math.sqrt(allVectors.length)), 12));
			const result = kmeansWithCentroids(flat, allVectors.length, dim, k, 30);
			for (let i = 0; i < allVectors.length; i++) {
				clusterMap.set(allVectors[i].c.id, result.assignments[i]);
			}
		} catch (e) {
			console.warn('[ingest-dev-docs] GPU kmeans non-fatal:', e);
		}
	}

	if (allVectors.length > 0) {
		try {
			await qdrant.batchUpsert({
				collection: 'documents',
				points: allVectors.map(({ c, v }) => ({
					id: c.id,
					vector: { content: v },
					payload: {
						document_id: documentId,
						title,
						chunk_text: c.text,
						node_id: rootNodeId,
						chunk_index: c.index,
						jurisdiction_code: 'docs',
						corpus_type: 'treatise',
						source_url: sourceUrl,
						source_type: 'dev-docs',
						gpu_cluster: clusterMap.get(c.id) ?? null,
						cuda_indexed: isPytorchGpuAvailable(),
					},
				})),
				batchSize: 100,
			});
			for (const { c, v } of allVectors) {
				await pool.query(`UPDATE legal_chunks SET embedding = $1 WHERE id = $2`, [
					`[${v.join(',')}]`, c.id,
				]);
			}
		} catch (e) {
			console.warn('[ingest-dev-docs] Qdrant upsert non-fatal:', e);
		}
	}

	await pool.query(
		`UPDATE library_documents SET processing_status = 'complete', updated_at = now() WHERE id = $1`,
		[documentId]
	);

	return { documentId, chunks: allVectors.length, clustered: clusterMap.size > 0 };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));
	const parsed = schema.safeParse(raw);
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message }, { status: 400 });

	const { urls: extraUrls, preset, rescan } = parsed.data;
	const jurisdictionId = await getDocsJurisdictionId();

	const result = {
		created: 0,
		skipped: 0,
		failed:  0,
		gpuClustered: 0,
		files: [] as Array<{ path: string; status: string; chunks?: number; documentId?: string; clustered?: boolean }>,
	};

	// ── 1. Local files ─────────────────────────────────────────────────────────

	const localFiles: string[] = [...LOCAL_DOC_FILES];
	for (const dir of LOCAL_DOC_DIRS) {
		if (!fs.existsSync(dir)) continue;
		for (const f of fs.readdirSync(dir)) {
			if (f.endsWith('.md') || f.endsWith('.txt')) {
				localFiles.push(path.join(dir, f));
			}
		}
	}

	for (const filePath of localFiles) {
		let content: string;
		try { content = fs.readFileSync(filePath, 'utf8'); }
		catch { result.files.push({ path: filePath, status: 'read-error' }); continue; }

		const hash    = createHash('sha256').update(content).digest('hex');
		const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
		const title   = `DEV: ${path.basename(filePath, '.md')} — ${path.dirname(relPath)}`;

		if (!rescan) {
			const exists = await pool.query(
				`SELECT id FROM library_documents WHERE source_hash = $1 LIMIT 1`, [hash]
			);
			if (exists.rows[0]) {
				result.skipped++;
				result.files.push({ path: relPath, status: 'skipped' });
				continue;
			}
		}

		try {
			const { documentId, chunks, clustered } = await upsertDoc({
				title, content, hash, jurisdictionId,
				sourceUrl: `file://${filePath.replace(/\\/g, '/')}`,
				sourceType: 'markdown',
			});
			result.created++;
			if (clustered) result.gpuClustered++;
			result.files.push({ path: relPath, status: 'created', documentId, chunks, clustered });
		} catch (err) {
			result.failed++;
			result.files.push({ path: relPath, status: 'error' });
		}
	}

	// ── 2. Web URLs (preset + extra) ───────────────────────────────────────────

	const webUrls = [...extraUrls];
	for (const p of preset) {
		webUrls.push(...(PRESET_DOC_URLS[p] ?? []));
	}

	for (const url of [...new Set(webUrls)]) {
		const check = validateExternalUrl(url);
		if (!check.valid) {
			result.files.push({ path: url, status: 'ssrf-blocked' });
			continue;
		}

		try {
			const crawlRes = await fetch('/api/web/crawl', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url, extractText: true, generateEmbedding: false }),
			});
			if (!crawlRes.ok) throw new Error(`HTTP ${crawlRes.status}`);
			const crawled = await crawlRes.json() as { title: string; text: string };
			const text  = (crawled.text ?? '').trim();
			const title = `DEV: ${crawled.title || new URL(url).hostname}`;

			if (text.length < 50) throw new Error('Too short');

			const hash = createHash('sha256').update(text).digest('hex');
			if (!rescan) {
				const exists = await pool.query(
					`SELECT id FROM library_documents WHERE source_hash = $1 LIMIT 1`, [hash]
				);
				if (exists.rows[0]) {
					result.skipped++;
					result.files.push({ path: url, status: 'skipped' });
					continue;
				}
			}

			const { documentId, chunks, clustered } = await upsertDoc({
				title, content: text, hash, jurisdictionId, sourceUrl: url, sourceType: 'web',
			});
			result.created++;
			if (clustered) result.gpuClustered++;
			result.files.push({ path: url, status: 'created', documentId, chunks, clustered });
		} catch (err) {
			console.error(`[ingest-dev-docs] Failed to process ${url}:`, err);
			result.failed++;
			result.files.push({ path: url, status: 'error', documentId: null });
		}
	}

	return json({
		success: true,
		...result,
		totalScanned: localFiles.length + webUrls.length,
		gpu: { clustered: result.gpuClustered, cudaAvailable: isPytorchGpuAvailable() },
	});
};
