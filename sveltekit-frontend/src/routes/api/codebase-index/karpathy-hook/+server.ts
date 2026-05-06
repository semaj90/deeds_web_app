import { json } from '@sveltejs/kit';
import { processKarpathyHook, type KarpathyHookInput } from '$lib/server/indexer/karpathy-hook.js';
import { persistKarpathyHook } from '$lib/server/indexer/karpathy-persistence.js';

/**
 * Karpathy Hook API
 * Orchestrates the chunk organization, multi-lens summarization, and topology export.
 */
export async function POST({ request, locals }) {
	// G4 Auth Check
	if (!locals.user) {
		return json({ error: 'Unauthorized', success: false }, { status: 401 });
	}

	try {
		const input = await request.json() as KarpathyHookInput;

		if (!input.files || !Array.isArray(input.files)) {
			return json({ error: 'Invalid input: files array is required' }, { status: 400 });
		}

		if (!input.runId) {
			input.runId = `karpathy-${new Date().toISOString().split('T')[0]}-${Math.random().toString(36).slice(2, 8)}`;
		}

		console.log(`[karpathy-hook] Processing run ${input.runId} with ${input.files.length} files...`);

		// 1. Process Hook (Metadata, Chunks, Lenses, Edges)
		const output = await processKarpathyHook(input);

		// 2. Persist results (Qdrant, Neo4j, Postgres, CouchDB)
		console.log(`[karpathy-hook] Persisting artifacts for run ${input.runId}...`);
		await persistKarpathyHook(output);

		return json({
			success: true,
			runId: output.runId,
			stats: output.stats
		});
	} catch (error) {
		console.error('[karpathy-hook] API Error:', error);
		return json({ 
			error: error instanceof Error ? error.message : 'Internal Server Error',
			success: false
		}, { status: 500 });
	}
}
