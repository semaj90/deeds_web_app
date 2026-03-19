/**
 * Backfill BM42 Sparse Vectors for Existing Qdrant Points
 *
 * Reads existing points from Qdrant collections (legal_documents, evidence_items),
 * generates BM42 sparse vectors from the payload text, and re-upserts with both
 * dense + sparse vectors so that hybrid RRF search works end-to-end.
 *
 * Usage:
 *   cd sveltekit-frontend
 *
 *   # Preview (count points, no writes):
 *   DRY_RUN=1 npx tsx scripts/backfill-sparse-vectors.ts
 *
 *   # Backfill legal_documents collection:
 *   COLLECTION=legal_documents npx tsx scripts/backfill-sparse-vectors.ts
 *
 *   # Backfill all supported collections:
 *   npx tsx scripts/backfill-sparse-vectors.ts
 *
 * Required env:
 *   QDRANT_URL   http://localhost:6333  (default)
 *
 * Optional env:
 *   COLLECTION   Target collection (default: all supported)
 *   BATCH_SIZE   Points per scroll page (default: 100)
 *   DRY_RUN      1 = count only, no writes
 */

import { generateSparseVector } from '../src/lib/server/vector/bm42-sparse.js';

const QDRANT_URL  = (process.env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/$/, '');
const TARGET      = process.env.COLLECTION ?? '';
const BATCH_SIZE  = parseInt(process.env.BATCH_SIZE ?? '100', 10);
const DRY_RUN     = process.env.DRY_RUN === '1';

const SUPPORTED_COLLECTIONS = ['legal_documents', 'evidence_items', 'legal_library_chunks'];

/** Text field names to look for in Qdrant point payloads. */
const TEXT_FIELDS = ['text', 'chunk_text', 'content', 'snippet'];

function extractText(payload: Record<string, unknown>): string {
	for (const field of TEXT_FIELDS) {
		const val = payload[field];
		if (typeof val === 'string' && val.length > 10) return val;
	}
	return '';
}

async function qdrantFetch(path: string, init?: RequestInit): Promise<any> {
	const resp = await fetch(`${QDRANT_URL}${path}`, {
		headers: { 'Content-Type': 'application/json' },
		...init,
	});
	if (!resp.ok) throw new Error(`Qdrant ${resp.status}: ${await resp.text()}`);
	return resp.json();
}

async function collectionExists(name: string): Promise<boolean> {
	try {
		await qdrantFetch(`/collections/${name}`);
		return true;
	} catch {
		return false;
	}
}

async function ensureSparseConfig(collection: string): Promise<void> {
	try {
		await qdrantFetch(`/collections/${collection}`, {
			method: 'PATCH',
			body: JSON.stringify({ sparse_vectors: { bm25: {} } }),
		});
		console.log(`  Sparse vector 'bm25' ensured on ${collection}`);
	} catch (e: any) {
		// May already be configured or collection doesn't support it
		console.warn(`  Could not add sparse config to ${collection}: ${e.message}`);
	}
}

async function backfillCollection(collection: string): Promise<{ total: number; updated: number; skipped: number }> {
	console.log(`\nBackfilling: ${collection}`);

	if (!(await collectionExists(collection))) {
		console.log(`  Collection '${collection}' not found — skipping`);
		return { total: 0, updated: 0, skipped: 0 };
	}

	if (!DRY_RUN) {
		await ensureSparseConfig(collection);
	}

	let total = 0;
	let updated = 0;
	let skipped = 0;
	let offset: string | number | null = null;

	// Scroll through all points
	while (true) {
		const scrollBody: Record<string, unknown> = {
			limit: BATCH_SIZE,
			with_payload: true,
			with_vector: true,
		};
		if (offset !== null) scrollBody.offset = offset;

		const data = await qdrantFetch(`/collections/${collection}/points/scroll`, {
			method: 'POST',
			body: JSON.stringify(scrollBody),
		});

		const points = data.result?.points ?? [];
		if (!points.length) break;

		total += points.length;

		if (DRY_RUN) {
			let hasText = 0;
			for (const p of points) {
				if (extractText(p.payload ?? {}).length > 10) hasText++;
			}
			console.log(`  Page: ${points.length} points (${hasText} have text for sparse vectors)`);
		} else {
			// Build re-upsert batch with sparse vectors
			const upsertPoints: any[] = [];

			for (const p of points) {
				const text = extractText(p.payload ?? {});
				if (!text) {
					skipped++;
					continue;
				}

				const sparse = generateSparseVector(text);
				if (sparse.indices.length === 0) {
					skipped++;
					continue;
				}

				// Get existing dense vector (may be unnamed or named)
				const denseVec = Array.isArray(p.vector)
					? p.vector
					: (p.vector?.[''] ?? p.vector?.content ?? null);

				if (!denseVec) {
					skipped++;
					continue;
				}

				upsertPoints.push({
					id: p.id,
					vector: {
						'': denseVec,
						bm25: { indices: sparse.indices, values: sparse.values },
					},
					payload: p.payload,
				});
				updated++;
			}

			if (upsertPoints.length > 0) {
				await qdrantFetch(`/collections/${collection}/points?wait=false`, {
					method: 'PUT',
					body: JSON.stringify({ points: upsertPoints }),
				});
			}
			console.log(`  Batch: ${upsertPoints.length} updated, ${points.length - upsertPoints.length} skipped`);
		}

		// Next page
		offset = data.result?.next_page_offset ?? null;
		if (offset === null) break;
	}

	return { total, updated, skipped };
}

async function main() {
	const startTime = Date.now();
	console.log('BM42 Sparse Vector Backfill');
	console.log(`  Qdrant:     ${QDRANT_URL}`);
	console.log(`  Batch size: ${BATCH_SIZE}`);
	console.log(`  DRY_RUN:    ${DRY_RUN}`);

	const collections = TARGET
		? [TARGET]
		: SUPPORTED_COLLECTIONS;

	const results: Record<string, { total: number; updated: number; skipped: number }> = {};

	for (const col of collections) {
		results[col] = await backfillCollection(col);
	}

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	console.log(`\n${'='.repeat(50)}`);
	console.log(`Backfill complete (${elapsed}s)`);
	for (const [col, r] of Object.entries(results)) {
		if (r.total === 0) continue;
		console.log(`  ${col}: ${r.total} points, ${r.updated} updated, ${r.skipped} skipped`);
	}
}

main().catch(e => { console.error(e); process.exit(1); });
