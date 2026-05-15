/**
 * POST /api/library/ingest-codebase-docs
 *
 * Scans the repository for Markdown files and ingests them into the legal
 * library as "technical documentation" entries.  Intended for admin use so
 * developers can search CLAUDE.md, architecture docs, and runbooks through
 * the same library UI as legal documents.
 *
 * Behaviour:
 *  - Walks the repo root up to 4 levels deep (excludes node_modules, .git,
 *    deeds_labs, dist, .svelte-kit, build, coverage).
 *  - Computes SHA-256 of each file; skips if an identical hash is already
 *    ingested (idempotent re-runs).
 *  - Creates `library_documents` + `legal_nodes` + `legal_chunks` rows.
 *  - Generates embeddings and upserts to Qdrant legal_documents collection.
 *  - Returns { created, updated, skipped, files[] }.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { pool } from '$lib/server/db/client';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';

// ── Constants ────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(process.cwd(), '..');

const EXCLUDE_DIRS = new Set([
	'node_modules',
	'.git',
	'deeds_labs',
	'dist',
	'.svelte-kit',
	'build',
	'coverage',
	'.cache',
	'__pycache__',
	'.venv',
	'.idea',
	'.vscode-server',
]);

const MAX_DEPTH = 4;
const EMBED_BATCH = 16;

// ── File walker ──────────────────────────────────────────────────────────────

function walkMarkdown(dir: string, depth = 0): string[] {
	if (depth > MAX_DEPTH) return [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const results: string[] = [];
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (EXCLUDE_DIRS.has(entry.name)) continue;
			results.push(...walkMarkdown(path.join(dir, entry.name), depth + 1));
		} else if (entry.isFile() && entry.name.endsWith('.md')) {
			results.push(path.join(dir, entry.name));
		}
	}
	return results;
}

// ── Chunking (simple paragraph split for Markdown) ──────────────────────────

interface MdChunk {
	text: string;
	heading: string;
	index: number;
}

function chunkMarkdown(content: string, maxChars = 1200): MdChunk[] {
	const lines = content.split('\n');
	const chunks: MdChunk[] = [];
	let current: string[] = [];
	let currentHeading = 'Overview';
	let idx = 0;

	const flush = () => {
		const text = current.join('\n').trim();
		if (text.length > 30) {
			chunks.push({ text, heading: currentHeading, index: idx++ });
		}
		current = [];
	};

	for (const line of lines) {
		const headingMatch = /^#{1,3}\s+(.+)/.exec(line);
		if (headingMatch) {
			flush();
			currentHeading = headingMatch[1].trim();
			current.push(line);
		} else {
			current.push(line);
			if (current.join('\n').length > maxChars) {
				flush();
			}
		}
	}
	flush();
	return chunks;
}

// ── Jurisdiction helper ──────────────────────────────────────────────────────

let _federalId: number | null = null;
async function getFederalJurisdictionId(): Promise<number | null> {
	if (_federalId !== null) return _federalId;
	const res = await pool.query(`SELECT id FROM jurisdictions WHERE code = 'federal' LIMIT 1`);
	_federalId = res.rows[0]?.id ?? null;
	return _federalId;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let mdFiles: string[];
	try {
		mdFiles = walkMarkdown(REPO_ROOT);
	} catch (err) {
		console.error('[ingest-codebase-docs] walk failed:', err);
		return json({ error: 'Failed to scan repository' }, { status: 500 });
	}

	const jurisdictionId = await getFederalJurisdictionId();

	const result = {
		created: 0,
		updated: 0,
		skipped: 0,
		files: [] as Array<{ path: string; status: 'created' | 'skipped' | 'updated' | 'error'; chunks?: number }>,
	};

	for (const filePath of mdFiles) {
		let content: string;
		try {
			content = fs.readFileSync(filePath, 'utf8');
		} catch {
			result.files.push({ path: filePath, status: 'error' });
			continue;
		}

		const hash = createHash('sha256').update(content).digest('hex');
		const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
		const title = path.basename(filePath, '.md') + ' — ' + path.dirname(relPath).replace(/\\/g, '/');

		// Dedup: skip if same hash already ingested
		const existing = await pool.query(
			`SELECT id, processing_status FROM library_documents WHERE source_hash = $1 LIMIT 1`,
			[hash]
		);
		if (existing.rows[0]) {
			result.skipped++;
			result.files.push({ path: relPath, status: 'skipped' });
			continue;
		}

		// Check if a doc with same title path already exists (update scenario)
		const byTitle = await pool.query(
			`SELECT id FROM library_documents WHERE title = $1 AND source_type = 'markdown' LIMIT 1`,
			[relPath]
		);

		const documentId = byTitle.rows[0]?.id ?? randomUUID();
		const isUpdate = !!byTitle.rows[0];

		try {
			// Upsert library_documents row
			await pool.query(
				`INSERT INTO library_documents
				   (id, source_type, corpus_type, jurisdiction_id, title, short_title,
				    source_hash, processing_status, created_at, updated_at)
				 VALUES ($1, 'markdown', 'treatise', $2, $3, $4, $5, 'complete', now(), now())
				 ON CONFLICT (id) DO UPDATE
				   SET source_hash = EXCLUDED.source_hash,
				       processing_status = 'complete',
				       updated_at = now()`,
				[documentId, jurisdictionId, relPath, path.basename(filePath, '.md'), hash]
			);

			// Prune old nodes/chunks for this doc on update
			if (isUpdate) {
				await pool.query(
					`DELETE FROM legal_chunks
					 WHERE legal_node_id IN (SELECT id FROM legal_nodes WHERE document_id = $1)`,
					[documentId]
				);
				await pool.query(`DELETE FROM legal_nodes WHERE document_id = $1`, [documentId]);
			}

			// Version record
			const versionId = randomUUID();
			await pool.query(
				`INSERT INTO library_document_versions (id, document_id, version_label, source_date, is_current)
				 VALUES ($1, $2, 'auto', now(), true)
				 ON CONFLICT DO NOTHING`,
				[versionId, documentId]
			);

			// Build root node
			const rootNodeId = randomUUID();
			await pool.query(
				`INSERT INTO legal_nodes
				   (id, document_id, version_id, parent_node_id, node_type, heading,
				    citation_label, node_path, depth, full_text, text_clean)
				 VALUES ($1, $2, $3, NULL, 'document', $4, NULL, 'root', 0, $5, $5)
				 ON CONFLICT DO NOTHING`,
				[rootNodeId, documentId, versionId, title, content.slice(0, 100_000)]
			);

			// Chunk the markdown
			const mdChunks = chunkMarkdown(content);

			// Insert chunk rows
			const chunkRows: Array<{ id: string; text: string; index: number }> = [];
			for (const chunk of mdChunks) {
				const chunkId = randomUUID();
				chunkRows.push({ id: chunkId, text: chunk.text, index: chunk.index });
				await pool.query(
					`INSERT INTO legal_chunks
					   (id, legal_node_id, chunk_index, chunk_text, token_count, char_start, char_end)
					 VALUES ($1, $2, $3, $4, $5, 0, 0)
					 ON CONFLICT (legal_node_id, chunk_index) DO NOTHING`,
					[chunkId, rootNodeId, chunk.index, chunk.text, Math.ceil(chunk.text.length / 4)]
				);
			}

			// Embed + upsert to Qdrant in batches
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
									jurisdiction_code: 'federal',
									corpus_type: 'treatise',
									source_path: relPath,
								},
							})),
						});

						// Write embeddings back to DB
						for (const { c, v } of points) {
							await pool.query(`UPDATE legal_chunks SET embedding = $1 WHERE id = $2`, [
								`[${v.join(',')}]`,
								c.id,
							]);
						}
					}
				} catch (embedErr) {
					console.warn('[ingest-codebase-docs] embed batch failed (non-fatal):', embedErr);
				}
			}

			if (isUpdate) {
				result.updated++;
				result.files.push({ path: relPath, status: 'updated', chunks: chunkRows.length });
			} else {
				result.created++;
				result.files.push({ path: relPath, status: 'created', chunks: chunkRows.length });
			}
		} catch (err) {
			console.error('[ingest-codebase-docs] failed for', relPath, ':', err);
			result.files.push({ path: relPath, status: 'error' });
		}
	}

	return json({
		success: true,
		...result,
		totalScanned: mdFiles.length,
	});
};
