/**
 * Re-embed missing legal_chunks
 *
 * Finds all chunks where embedding IS NULL, calls Ollama to embed them,
 * then updates legal_chunks and upserts to Qdrant.
 *
 * Usage:
 *   cd sveltekit-frontend
 *   npx tsx scripts/reembed-missing-chunks.ts
 *
 *   # Dry run (show counts only, no writes):
 *   DRY_RUN=1 npx tsx scripts/reembed-missing-chunks.ts
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

// Env loading
try {
	const dotenv = await import('dotenv');
	const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
	dotenv.config({ path: envPath });
} catch { /* skip */ }

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/$/, '');
const EMBED_MODEL = process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'legal_documents';
const DRY_RUN = process.env.DRY_RUN === '1';
const BATCH_SIZE = 20;

const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL });

async function embedText(text: string): Promise<number[] | null> {
	const trunc = text.slice(0, 2048);
	const resp = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: EMBED_MODEL, prompt: trunc }),
	});
	if (!resp.ok) {
		console.warn(`  embed failed HTTP ${resp.status}`);
		return null;
	}
	const data: any = await resp.json();
	return data.embedding ?? null;
}

async function qdrantUpsert(points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>) {
	const resp = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ points }),
	});
	if (!resp.ok) {
		const txt = await resp.text().catch(() => '');
		console.warn(`  Qdrant upsert failed: HTTP ${resp.status} ${txt.slice(0, 200)}`);
	}
}

// Find all chunks with missing embeddings
const missing = await pool.query<{
	id: string;
	chunk_text: string;
	chunk_index: number;
	legal_node_id: string;
	document_id: string;
	doc_title: string;
	corpus_type: string;
	jurisdiction_code: string;
}>(`
	SELECT
		lc.id,
		lc.chunk_text,
		lc.chunk_index,
		lc.legal_node_id,
		ln.document_id,
		ld.title AS doc_title,
		ld.corpus_type,
		j.code AS jurisdiction_code
	FROM legal_chunks lc
	JOIN legal_nodes ln ON ln.id = lc.legal_node_id
	JOIN library_documents ld ON ld.id = ln.document_id
	LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
	WHERE lc.embedding IS NULL
	ORDER BY ld.title, lc.chunk_index
`);

console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Found ${missing.rows.length} chunks missing embeddings`);

if (DRY_RUN) {
	const byDoc = new Map<string, number>();
	for (const r of missing.rows) {
		byDoc.set(r.doc_title, (byDoc.get(r.doc_title) ?? 0) + 1);
	}
	byDoc.forEach((count, title) => console.log(`  ${title.slice(0, 60)}: ${count} missing`));
	await pool.end();
	process.exit(0);
}

let fixed = 0;
let failed = 0;

// Process in batches
for (let i = 0; i < missing.rows.length; i += BATCH_SIZE) {
	const batch = missing.rows.slice(i, i + BATCH_SIZE);
	const qdrantPoints: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = [];

	for (const chunk of batch) {
		const vec = await embedText(chunk.chunk_text);
		if (!vec) {
			console.warn(`  FAIL chunk ${chunk.id} (${chunk.doc_title.slice(0, 40)} #${chunk.chunk_index})`);
			failed++;
			continue;
		}

		// Update DB
		await pool.query(
			`UPDATE legal_chunks SET embedding = $1::vector WHERE id = $2`,
			[`[${vec.join(',')}]`, chunk.id]
		);

		qdrantPoints.push({
			id: chunk.id,
			vector: vec,
			payload: {
				chunk_id: chunk.id,
				document_id: chunk.document_id,
				legal_node_id: chunk.legal_node_id,
				chunk_index: chunk.chunk_index,
				corpus_type: chunk.corpus_type,
				jurisdiction: chunk.jurisdiction_code ?? 'unknown',
				title: chunk.doc_title,
				text: chunk.chunk_text.slice(0, 500),
			},
		});

		fixed++;
	}

	// Qdrant batch upsert
	if (qdrantPoints.length > 0) {
		await qdrantUpsert(qdrantPoints);
	}

	console.log(`  Progress: ${Math.min(i + BATCH_SIZE, missing.rows.length)}/${missing.rows.length} chunks (fixed=${fixed} failed=${failed})`);
}

console.log(`\n Done: fixed=${fixed} failed=${failed}`);
await pool.end();
