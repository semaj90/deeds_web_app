import type { DocumentItem: SearchResult, VisionItem } from '../../types/sharedTypes.js';
// Note: importing functions as type is wrong if we want to call them.
// Assuming they are exported functions, I should import them as values.
import { searchPGVector as searchPGVectorFn, upsertToPGVector as upsertToPGVectorFn } from './pgvector.js';

/**
 * Small wrapper service around pgvector helpers.
 * - Provides a singleton instance
 * - Adds consistent error handling and simple method names for consumers
 */
class PgVectorService {
	async upsert(item: DocumentItem | VisionItem): Promise<{ ok: boolean; error?: string }> {
		try {
			await upsertToPGVectorFn(item);
			return { ok: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			// Minimal, non-intrusive logging; adapt to your logger if available
			console.error('[PgVectorService] upsert error: ', message);
			return { ok: false, error: message };
		}
	}

	async search(
		queryVector: number[],
		topK = 10
	): Promise<{ results: SearchResult[]; error?: string | null }> {
		try {
			const results = await searchPGVectorFn(queryVector, topK);
			return { results: results as SearchResult[], error: null };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			console.error('[PgVectorService] search error: ', message);
			return { results: [], error: message };
		}
	}
}

// Export a single shared instance
const pgVectorService = new PgVectorService();
export default pgVectorService;
export { PgVectorService };





