/**
 * Recreate legal_canon_chunks with named dense + BM42 sparse vector support.
 *
 * The existing collection uses unnamed vectors which can't coexist with sparse.
 * Since there are only 59 points, we save → recreate → re-upsert.
 * If the Qdrant collection is empty or missing, bootstrap from canonical_chunks.
 *
 * Usage: node scripts/backfill-canon-sparse.mjs
 */

import { createHash } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const COLLECTION = 'legal_canon_chunks';
const BATCH_SIZE = 30;
const VOCAB_SIZE = 2_000_000;
const pool = new Pool({ connectionString: DATABASE_URL });

// ── FNV-1a hash (must match bm42-sparse.ts) ──
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
			token.startsWith('§') ||
			token.includes('u.s.c') ||
			token.includes('cfr') ||
			token.includes('usc') ||
			token.includes('fre') ||
			token.includes('frcp');
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

function makePointId(chunkId) {
  return createHash('md5').update(chunkId).digest('hex').replace(/-/g, '').slice(0, 32);
}

function parsePgVector(raw) {
  if (typeof raw !== 'string' || raw.length < 2) return null;
  const body = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  if (!body.trim()) return [];

  const values = body.split(',').map((part) => Number(part.trim()));
  return values.every((value) => Number.isFinite(value)) ? values : null;
}

async function loadCanonicalChunksFromPostgres() {
  const { rows } = await pool.query(`
		SELECT
			cc.chunk_id,
			cc.document_id::text AS doc_id,
			cc.content,
			cc.token_count,
			cc.embedding::text AS embedding_text,
			COALESCE(cc.domains, '[]'::jsonb) AS domains,
			COALESCE(cc.key_terms, '[]'::jsonb) AS key_terms,
			cd.title AS doc_title,
			cd.doc_type,
			cd.citation,
			cd.jurisdiction::text AS jurisdiction,
			cd.authority_level::text AS authority_level
		FROM canonical_chunks cc
		JOIN canonical_documents cd ON cd.id = cc.document_id
		WHERE cc.embedding IS NOT NULL
		ORDER BY cd.title ASC, cc.chunk_index ASC
	`);

  return rows
    .map((row) => {
      const denseVec = parsePgVector(row.embedding_text);
      if (!denseVec || denseVec.length !== 768) return null;

      return {
        id: makePointId(row.chunk_id),
        denseVec,
        payload: {
          chunk_id: row.chunk_id,
          doc_id: row.doc_id,
          doc_title: row.doc_title,
          doc_type: row.doc_type,
          citation: row.citation,
          jurisdiction: row.jurisdiction,
          authority_level: row.authority_level,
          content: typeof row.content === 'string' ? row.content.slice(0, 500) : '',
          token_count: row.token_count,
          domains: Array.isArray(row.domains) ? row.domains : [],
          key_terms: Array.isArray(row.key_terms) ? row.key_terms : [],
        },
      };
    })
    .filter((point) => point !== null);
}

async function qdrantFetch(path, opts = {}) {
	const url = `${QDRANT_URL}${path}`;
	const res = await fetch(url, {
		headers: { 'Content-Type': 'application/json' },
		...opts,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Qdrant ${res.status}: ${text}`);
	}
	return res.json();
}

async function main() {
	console.log(`\n=== Upgrading ${COLLECTION} to hybrid dense+sparse ===\n`);

	// Step 1: Save all existing points
	console.log('Step 1: Saving existing points...');
	const savedPoints = [];
	let offset = null;
	let collectionExists = true;

	try {
    while (true) {
      const scrollBody = { limit: BATCH_SIZE, with_payload: true, with_vector: true };
      if (offset !== null) scrollBody.offset = offset;

      const data = await qdrantFetch(`/collections/${COLLECTION}/points/scroll`, {
        method: 'POST',
        body: JSON.stringify(scrollBody),
      });

      const points = data.result?.points ?? [];
      if (points.length === 0) break;

      for (const p of points) {
        const denseVec = Array.isArray(p.vector) ? p.vector : (p.vector?.[''] ?? null);
        savedPoints.push({
          id: p.id,
          denseVec,
          payload: p.payload,
        });
      }

      offset = data.result?.next_page_offset;
      if (offset === null || offset === undefined) break;
    }
  } catch (err) {
    if (String(err?.message ?? err).includes('Qdrant 404')) {
      collectionExists = false;
      console.log('  Collection missing; will bootstrap from PostgreSQL instead.');
    } else {
      throw err;
    }
  }

	console.log(`  Saved ${savedPoints.length} points`);

	if (savedPoints.length === 0) {
    const bootstrappedPoints = await loadCanonicalChunksFromPostgres();
    savedPoints.push(...bootstrappedPoints);
    console.log(`  Bootstrapped ${bootstrappedPoints.length} points from canonical_chunks`);
  }

  if (savedPoints.length === 0) {
    console.log('  No points to migrate or bootstrap. Exiting.');
    return;
  }

	// Step 2: Delete old collection
	console.log('\nStep 2: Deleting old collection...');
	if (collectionExists) {
    await qdrantFetch(`/collections/${COLLECTION}`, { method: 'DELETE' });
    console.log('  Deleted');
  } else {
    console.log('  Collection absent; skipping delete');
  }

	// Step 3: Recreate with named dense + sparse config
	console.log('\nStep 3: Recreating with named vectors + sparse...');
	await qdrantFetch(`/collections/${COLLECTION}`, {
		method: 'PUT',
		body: JSON.stringify({
			vectors: {
				content: { size: 768, distance: 'Cosine', on_disk: true },
			},
			sparse_vectors: {
				bm25: {},
			},
			hnsw_config: { m: 16, ef_construct: 128, on_disk: true },
			on_disk_payload: true,
			quantization_config: {
				scalar: { type: 'int8', quantile: 0.99, always_ram: true },
			},
		}),
	});
	console.log('  Created with content (768-dim cosine) + bm25 (sparse)');

	// Step 4: Re-upsert with both dense + sparse vectors
	console.log('\nStep 4: Re-upserting with hybrid vectors...');
	let upserted = 0;

	for (let i = 0; i < savedPoints.length; i += BATCH_SIZE) {
		const batch = savedPoints.slice(i, i + BATCH_SIZE);
		const upsertPoints = [];

		for (const p of batch) {
			if (!p.denseVec || !Array.isArray(p.denseVec) || p.denseVec.length !== 768) continue;

			const content = p.payload?.content ?? p.payload?.text ?? '';
			const sparse = generateSparseVector(content);

			upsertPoints.push({
				id: p.id,
				vector: {
					content: p.denseVec,
					...(sparse.indices.length > 0 ? { bm25: sparse } : {}),
				},
				payload: p.payload,
			});
		}

		if (upsertPoints.length > 0) {
			await qdrantFetch(`/collections/${COLLECTION}/points?wait=true`, {
				method: 'PUT',
				body: JSON.stringify({ points: upsertPoints }),
			});
			upserted += upsertPoints.length;
		}

		process.stdout.write(`  ${upserted}/${savedPoints.length} points upserted\r`);
	}

	console.log(`\n  Done: ${upserted} points with hybrid vectors`);

	// Step 5: Verify collection
	console.log('\nStep 5: Verifying...');
	const info = await qdrantFetch(`/collections/${COLLECTION}`);
	console.log(`  Points: ${info.result?.points_count}`);
	console.log(`  Vectors: ${JSON.stringify(info.result?.config?.params?.vectors)}`);
	console.log(`  Sparse:  ${JSON.stringify(info.result?.config?.params?.sparse_vectors)}`);

	// Step 6: Test hybrid search (sparse-only query for now)
	console.log('\nStep 6: Testing sparse-only search for "hearsay evidence exceptions"...');
	const testSparse = generateSparseVector('hearsay evidence rule exceptions');
	try {
		const res = await qdrantFetch(`/collections/${COLLECTION}/points/query`, {
			method: 'POST',
			body: JSON.stringify({
				prefetch: [
					{ query: testSparse, using: 'bm25', limit: 10 },
				],
				query: { fusion: 'rrf' },
				limit: 5,
				with_payload: true,
			}),
		});
		const hits = res.result?.points ?? [];
		console.log(`  Found ${hits.length} results:`);
		for (const hit of hits.slice(0, 5)) {
			const title = hit.payload?.citation ?? hit.payload?.doc_title ?? hit.id;
			console.log(`    [${hit.score.toFixed(3)}] ${title}`);
		}
	} catch (err) {
		console.log(`  Sparse search error: ${err.message}`);
	}
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });