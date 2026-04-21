#!/usr/bin/env node
/**
 * Insert US Constitution into PostgreSQL library tables.
 * Reads extraction JSON from MinIO, inserts library_documents, legal_nodes, legal_chunks.
 * Run from sveltekit-frontend/: node ../scripts/constitution-pg-insert.mjs
 */

import * as Minio from 'minio';
import pg from 'pg';
import crypto from 'crypto';

const DOC_ID = 'a683d98d-f853-412c-a51f-8f4d74eb2447';
const BUCKET = 'legal-library';
const PG_URL = 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';

async function main() {
	// Fetch extraction JSON from MinIO
	const minio = new Minio.Client({ endPoint: 'localhost', port: 9000, useSSL: false, accessKey: 'admin', secretKey: 'password' });
	const chunks = [];
	const stream = await minio.getObject(BUCKET, `uploads/extractions/${DOC_ID}.json`);
	for await (const chunk of stream) chunks.push(chunk);
	const extraction = JSON.parse(Buffer.concat(chunks).toString());
	console.log(`Loaded extraction: ${extraction.blocks.length} blocks from ${extraction.totalPages} pages`);

	const pool = new pg.Pool({ connectionString: PG_URL });

	// 1. Insert library_documents
	try {
		await pool.query(
			`INSERT INTO library_documents (id, source_type, corpus_type, jurisdiction_id, title, citation, source_hash, mime_type, minio_key, page_count, processing_status, is_official, source_confidence, source_kind, created_at, updated_at)
			VALUES ($1, 'govinfo', 'constitution', 1, $2, $3, $4, 'application/pdf', $5, $6, 'complete', true, 'high', 'uploaded_pdf', NOW(), NOW())
			ON CONFLICT (id) DO UPDATE SET processing_status = 'complete', page_count = $6, updated_at = NOW()`,
			[DOC_ID, 'United States Constitution with Declaration of Independence', 'U.S. Const.', extraction.pdfHash, `uploads/raw/${DOC_ID}.pdf`, extraction.totalPages]
		);
		console.log('library_documents: inserted');
	} catch (e) {
		console.error('library_documents error:', e.message);
	}

	// 2. Insert ingestion_jobs
	const jobId = crypto.randomUUID();
	try {
		await pool.query(
			`INSERT INTO ingestion_jobs (id, document_id, stage, status, progress, metrics_json, created_at, updated_at)
			VALUES ($1, $2, 'complete', 'complete', 100, $3, NOW(), NOW())`,
			[jobId, DOC_ID, JSON.stringify({ pageCount: extraction.totalPages, blockCount: extraction.blocks.length, method: 'granite-docling', timeMs: extraction.extractionTimeMs })]
		);
		console.log(`ingestion_jobs: inserted (${jobId})`);
	} catch (e) {
		console.error('ingestion_jobs error:', e.message);
	}

	// 3. Collect full text per heading for legal_nodes full_text column
	const headingTexts = new Map(); // heading -> accumulated text
	let currentHeading = '__root__';
	headingTexts.set(currentHeading, []);
	for (const block of extraction.blocks) {
		if (block.type === 'heading') {
			currentHeading = block.text.trim();
			if (!headingTexts.has(currentHeading)) headingTexts.set(currentHeading, []);
		} else if (block.text.length > 10) {
			headingTexts.get(currentHeading).push(block.text);
		}
	}

	// Root node with full document text
	const rootFullText = extraction.blocks.map(b => b.text).join('\n\n').slice(0, 100_000);
	const rootTextClean = rootFullText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 100_000);

	const rootNodeId = crypto.randomUUID();
	try {
		await pool.query(
			`INSERT INTO legal_nodes (id, document_id, node_type, heading, citation_label, node_path, depth, page_start, page_end, full_text, text_clean, created_at)
			VALUES ($1, $2, 'document', $3, 'U.S. Const.', 'root', 0, 1, $4, $5, $6, NOW())`,
			[rootNodeId, DOC_ID, 'United States Constitution', extraction.totalPages, rootFullText, rootTextClean]
		);
		console.log(`Root node: ${rootNodeId}`);
	} catch (e) {
		console.error('Root node error:', e.message);
	}

	// 4. Build nodes from headings + insert chunks
	let nodeCount = 1;
	let chunkCount = 0;
	let currentNodeId = rootNodeId;
	let chunkIndex = 0;
	const nodeMap = new Map();

	for (const block of extraction.blocks) {
		if (block.type === 'heading') {
			const heading = block.text.trim();
			if (nodeMap.has(heading)) {
				currentNodeId = nodeMap.get(heading);
				chunkIndex = 0;
				continue;
			}

			const nodeId = crypto.randomUUID();
			let nodeType = 'section';
			let depth = 1;

			if (/^Article/i.test(heading)) { nodeType = 'article'; depth = 1; }
			else if (/^Section/i.test(heading)) { nodeType = 'section'; depth = 2; }
			else if (/^Amendment/i.test(heading)) { nodeType = 'article'; depth = 1; }
			else if (/^Preamble/i.test(heading)) { nodeType = 'section'; depth = 1; }
			else if (/^THE DECLARATION/i.test(heading)) { nodeType = 'title'; depth = 1; }
			else if (/^INDEX|^DATES/i.test(heading)) { nodeType = 'appendix'; depth = 1; }
			else if (/^RATIFICATION|^A MENDMENTS|^AMENDMENTS/i.test(heading)) { nodeType = 'title'; depth = 1; }

			const citation = heading.startsWith('Amendment')
				? `U.S. Const. amend. ${heading.replace(/Amendment\s+/i, '')}`
				: heading.startsWith('Article')
					? `U.S. Const. art. ${heading.replace(/Article\.?\s*/i, '')}`
					: heading;

			try {
				const nodeTexts = headingTexts.get(heading) || [];
				const nodeFull = nodeTexts.join('\n\n').slice(0, 100_000) || heading;
				const nodeClean = nodeFull.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 100_000) || heading;

				await pool.query(
					`INSERT INTO legal_nodes (id, document_id, parent_node_id, node_type, heading, citation_label, node_path, depth, page_start, full_text, text_clean, created_at)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
					[nodeId, DOC_ID, rootNodeId, nodeType, heading, citation, heading.toLowerCase().replace(/[^a-z0-9]+/g, '-'), depth, block.page, nodeFull, nodeClean]
				);
				nodeMap.set(heading, nodeId);
				currentNodeId = nodeId;
				chunkIndex = 0;
				nodeCount++;
			} catch (e) {
				// Duplicate or constraint error — skip
			}
		} else if (block.text.length > 10) {
			const chunkId = crypto.randomUUID();
			try {
				await pool.query(
					`INSERT INTO legal_chunks (id, legal_node_id, chunk_index, chunk_text, token_count, page_start, page_end, created_at)
					VALUES ($1, $2, $3, $4, $5, $6, $6, NOW())`,
					[chunkId, currentNodeId, chunkIndex++, block.text, Math.ceil(block.text.length / 4), block.page]
				);
				chunkCount++;
			} catch (e) {
				// Skip duplicates
			}
		}
	}

	console.log(`\nlegal_nodes: ${nodeCount} | legal_chunks: ${chunkCount}`);
	console.log(`\nLibrary URL: /library/${DOC_ID}`);
	console.log(`Reader URL:  /library/${DOC_ID}/reader`);

	await pool.end();
}

main().catch((err) => {
	console.error('FATAL:', err);
	process.exit(1);
});
