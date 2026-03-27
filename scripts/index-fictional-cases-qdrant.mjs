/**
 * Index fictional case narratives into Qdrant fictional_case_chunks collection.
 *
 * Creates hybrid dense (768-dim) + BM42 sparse vectors for each case narrative.
 * Embeds via embeddinggemma:latest on Ollama.
 *
 * Usage: node scripts/index-fictional-cases-qdrant.mjs [--skip-embed]
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
	connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db',
});

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const COLLECTION = 'fictional_case_chunks';
const BATCH_SIZE = 10;
const VOCAB_SIZE = 2_000_000;
const skipEmbed = process.argv.includes('--skip-embed');

// ── FNV-1a hash (matches bm42-sparse.ts) ──
function fnv1a(token) {
	let h = 0x811c9dc5;
	for (let i = 0; i < token.length; i++) {
		h ^= token.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0) % VOCAB_SIZE;
}

const STOP_WORDS = new Set([
	'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
	'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
	'should', 'may', 'might', 'can', 'could', 'must', 'to', 'of', 'in',
	'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
	'during', 'before', 'after', 'above', 'below', 'between', 'under',
	'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
	'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
	'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so',
	'than', 'too', 'very', 'and', 'but', 'or', 'nor', 'if', 'that',
	'which', 'who', 'whom', 'this', 'these', 'those', 'it', 'its',
]);

function generateSparseVector(text) {
	const tokens = text
		.toLowerCase()
		.replace(/[^\w\s§./-]/g, ' ')
		.split(/\s+/)
		.filter((t) => t.length > 1 && !STOP_WORDS.has(t));

	const tf = new Map();
	for (const token of tokens) {
		const idx = fnv1a(token);
		const isLegal =
			token.startsWith('§') || token.includes('u.s.c') || token.includes('cfr') ||
			token.includes('usc') || token.includes('fre') || token.includes('frcp');
		const entry = tf.get(idx) || { count: 0, isLegal: false };
		entry.count++;
		if (isLegal) entry.isLegal = true;
		tf.set(idx, entry);
	}

	const indices = [];
	const values = [];
	for (const [idx, { count, isLegal }] of tf) {
		indices.push(idx);
		values.push(Math.log(1 + count) * (isLegal ? 2.0 : 1.0));
	}

	const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
	if (norm > 0) {
		for (let i = 0; i < values.length; i++) values[i] /= norm;
	}
	return { indices, values };
}

async function qdrantFetch(path, opts = {}) {
	const res = await fetch(`${QDRANT_URL}${path}`, {
		headers: { 'Content-Type': 'application/json' },
		...opts,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Qdrant ${res.status}: ${text}`);
	}
	return res.json();
}

async function embed(texts) {
	if (skipEmbed) return texts.map(() => []);

	const res = await fetch(`${OLLAMA_URL}/api/embed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: 'embeddinggemma:latest', input: texts }),
	});
	if (!res.ok) throw new Error(`Ollama embed ${res.status}: ${await res.text()}`);
	const data = await res.json();
	return data.embeddings;
}

async function main() {
	console.log(`\n=== Indexing fictional cases into ${COLLECTION} ===\n`);

	// Fetch all fictional cases with their charges
	const { rows: cases } = await pool.query(`
		SELECT fc.id, fc.case_id, fc.category, fc.charge, fc.primary_statute,
		       fc.defendant_name, fc.incident_date, fc.jurisdiction_city,
		       fc.jurisdiction, fc.financial_loss, fc.narrative, fc.generated_by,
		       fc.created_at
		FROM fictional_cases fc
		ORDER BY fc.created_at
	`);

	console.log(`Found ${cases.length} fictional cases`);

	// Get charges for each case
	const { rows: charges } = await pool.query(`
		SELECT fictional_case_id, charge_name, statute, canon_chunk_ids
		FROM fictional_case_charges
	`);

	const chargesByCase = new Map();
	for (const c of charges) {
		if (!chargesByCase.has(c.fictional_case_id)) chargesByCase.set(c.fictional_case_id, []);
		chargesByCase.get(c.fictional_case_id).push(c);
	}

	// Create collection with hybrid vectors
	console.log('Creating collection...');
	try {
		await qdrantFetch(`/collections/${COLLECTION}`, { method: 'DELETE' });
	} catch { /* may not exist */ }

	await qdrantFetch(`/collections/${COLLECTION}`, {
		method: 'PUT',
		body: JSON.stringify({
			vectors: {
				content: { size: 768, distance: 'Cosine', on_disk: true },
			},
			sparse_vectors: { bm25: {} },
			hnsw_config: { m: 16, ef_construct: 128, on_disk: true },
			on_disk_payload: true,
			quantization_config: {
				scalar: { type: 'int8', quantile: 0.99, always_ram: true },
			},
		}),
	});
	console.log('  Collection created with content (768-dim) + bm25 (sparse)\n');

	// Index in batches
	let indexed = 0;
	let embedFailed = false;

	for (let i = 0; i < cases.length; i += BATCH_SIZE) {
		const batch = cases.slice(i, i + BATCH_SIZE);

		// Build text for embedding: charge + statute + narrative excerpt
		const texts = batch.map((c) => {
			const caseCharges = chargesByCase.get(c.id) || [];
			const chargeInfo = caseCharges
				.map((ch) => `${ch.charge_name}${ch.statute ? ` (${ch.statute})` : ''}`)
				.join('; ');
			// Combine charge + narrative for richer embedding
			return `${c.charge}. ${chargeInfo}. ${c.narrative.slice(0, 1500)}`;
		});

		// Embed
		let embeddings = [];
		if (!embedFailed) {
			try {
				embeddings = await embed(texts);
			} catch (err) {
				console.warn(`  [embed] Failed: ${err.message} — storing with sparse only`);
				embedFailed = true;
				embeddings = texts.map(() => []);
			}
		} else {
			embeddings = texts.map(() => []);
		}

		// Build Qdrant points
		const points = [];
		for (let j = 0; j < batch.length; j++) {
			const c = batch[j];
			const emb = embeddings[j];
			const hasDense = emb && emb.length === 768;
			const sparse = generateSparseVector(texts[j]);

			const caseCharges = chargesByCase.get(c.id) || [];
			const canonChunkIds = [...new Set(caseCharges.flatMap((ch) => {
				try { return JSON.parse(ch.canon_chunk_ids || '[]'); } catch { return []; }
			}))];

			const vector = {};
			if (hasDense) vector.content = emb;
			if (sparse.indices.length > 0) vector.bm25 = sparse;

			// Need at least one vector type
			if (!hasDense && sparse.indices.length === 0) continue;

			points.push({
				id: indexed + j + 1,
				vector,
				payload: {
					case_id: c.case_id,
					case_uuid: c.id,
					category: c.category,
					charge: c.charge,
					primary_statute: c.primary_statute,
					defendant_name: c.defendant_name,
					jurisdiction: c.jurisdiction,
					jurisdiction_city: c.jurisdiction_city,
					financial_loss: c.financial_loss,
					narrative_excerpt: c.narrative.slice(0, 500),
					charges: caseCharges.map((ch) => ({
						name: ch.charge_name,
						statute: ch.statute,
					})),
					canon_chunk_ids: canonChunkIds,
					generated_by: c.generated_by,
					authority_level: 'fictional',
				},
			});
		}

		if (points.length > 0) {
			await qdrantFetch(`/collections/${COLLECTION}/points?wait=true`, {
				method: 'PUT',
				body: JSON.stringify({ points }),
			});
		}

		indexed += batch.length;
		process.stdout.write(`  ${indexed}/${cases.length} cases indexed\r`);
	}

	console.log(`\nDone: ${indexed} cases indexed\n`);

	// Verify
	const info = await qdrantFetch(`/collections/${COLLECTION}`);
	console.log('Collection info:');
	console.log(`  Points: ${info.result?.points_count}`);
	console.log(`  Vectors: ${JSON.stringify(info.result?.config?.params?.vectors)}`);
	console.log(`  Sparse:  ${JSON.stringify(info.result?.config?.params?.sparse_vectors)}`);

	// Test search
	console.log('\nTest sparse search for "wire fraud financial loss"...');
	const testSparse = generateSparseVector('wire fraud financial loss bank scheme');
	try {
		const res = await qdrantFetch(`/collections/${COLLECTION}/points/query`, {
			method: 'POST',
			body: JSON.stringify({
				prefetch: [{ query: testSparse, using: 'bm25', limit: 10 }],
				query: { fusion: 'rrf' },
				limit: 5,
				with_payload: true,
			}),
		});
		const hits = res.result?.points ?? [];
		console.log(`  Found ${hits.length} results:`);
		for (const h of hits.slice(0, 5)) {
			console.log(`    [${h.score.toFixed(3)}] ${h.payload?.charge} — ${h.payload?.defendant_name} (${h.payload?.category})`);
		}
	} catch (err) {
		console.log(`  Search error: ${err.message}`);
	}

	await pool.end();
}

main().catch((err) => {
	console.error('Fatal:', err);
	pool.end();
	process.exit(1);
});