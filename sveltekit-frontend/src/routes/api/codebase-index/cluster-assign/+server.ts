import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { sseFormat, sseHeaders } from '$lib/server/streaming/sse-utils.js';
import { clusterEmbeddings, isCudaAvailable } from '$lib/server/gpu/libtorch-bridge.js';
import { pool } from '$lib/server/db/client';

const QDRANT_URL = ENV.QDRANT_URL;
const COLLECTION = 'codebase_chunks_768';

// Helper to scroll all chunks
async function scrollAllQdrantVectors(): Promise<{ id: string | number; vector: number[] }[]> {
	const chunks: { id: string | number; vector: number[] }[] = [];
	let offset: string | number | null = null;
	const limit = 500;

	do {
		const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				limit,
				with_payload: false,
				with_vector: true,
				offset: offset !== null ? offset : undefined,
			}),
		});

		if (!res.ok) break;
		const data = await res.json();
		const points = data.result?.points || [];

		for (const pt of points) {
			const vector = pt.vector?.content || null;
			if (vector && vector.length === 768) {
				chunks.push({ id: pt.id, vector });
			}
		}

		offset = data.result?.next_page_offset;
	} while (offset !== null);

	return chunks;
}

export const POST: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const dryRun = url.searchParams.get('dryRun') === 'true';
	const k = Math.min(Number(url.searchParams.get('k') || '20'), 100);

	const enc = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const emit = (ev: string, data: unknown) => controller.enqueue(enc.encode(sseFormat(ev, data)));
			const t0 = performance.now();

			try {
				emit('scroll', { stage: 1, message: 'Fetching vectors from Qdrant...' });
				const t1 = performance.now();
				const chunks = await scrollAllQdrantVectors();
				emit('scroll_complete', { 
					stage: 1, 
					chunksFound: chunks.length, 
					durationMs: Math.round(performance.now() - t1) 
				});

				if (chunks.length === 0) {
					emit('complete', { message: 'No chunks found', totalMs: Math.round(performance.now() - t0) });
					controller.close();
					return;
				}

				emit('clustering', { stage: 2, message: `Running K-Means (K=${k})...` });
				const t2 = performance.now();
				
				const vectors = chunks.map(c => c.vector);
				const clusterResult = await clusterEmbeddings(vectors, k);
				
				emit('clustering_complete', {
					stage: 2,
					cuda: isCudaAvailable(),
					durationMs: Math.round(performance.now() - t2),
					source: clusterResult.source
				});

				emit('upserting', { stage: 3, message: 'Updating Qdrant and PostgreSQL assignments...' });
				const t3 = performance.now();
				let updated = 0;

				if (!dryRun) {
					// We'll update Qdrant and Postgres in batches
					const batchSize = 100;
					
					for (let i = 0; i < chunks.length; i += batchSize) {
						const batch = chunks.slice(i, i + batchSize);
						const assignBatch = clusterResult.assignments.slice(i, i + batchSize);

						// Update Qdrant payloads in bulk
						try {
							const operations = batch.map((chunk, idx) => ({
								set_payload: {
									payload: {
										gpu_cluster: assignBatch[idx],
										neo4j_gpuCluster: assignBatch[idx], // legacy mirror
										som_cluster: assignBatch[idx]
									},
									points: [chunk.id]
								}
							}));

							await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/batch`, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ operations })
							});
						} catch (err) {
							console.warn(`[cluster-assign] Qdrant batch update failed: ${String(err)}`);
						}

						// Update PostgreSQL mirror
						for (let j = 0; j < batch.length; j++) {
							try {
								await pool.query(
									`UPDATE codebase_chunk_index
									    SET gpu_cluster = $1, som_cluster = $1, updated_at = NOW()
									  WHERE qdrant_id = $2`,
									[assignBatch[j], String(batch[j].id)]
								);
							} catch (err) {
								// non-fatal
							}
						}

						updated += batch.length;
						emit('upserting_progress', { updated, total: chunks.length });
					}
				}

				emit('complete', {
					stage: 4,
					chunks: chunks.length,
					updated,
					k,
					dryRun,
					totalMs: Math.round(performance.now() - t0)
				});
} catch (err) {
emit('error', { message: (err as Error)?.message || String(err) });
} finally {
controller.close();
}
}
});

return new Response(stream, { headers: sseHeaders() });
};
