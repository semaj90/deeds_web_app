import { AgenticSearchService } from '$lib/server/vector/agentic-search';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

export interface DiagnosticResult {
	error: string;
	suspectedFiles: any[];
	rootCauseAnalysis: string;
}

export class AgenticDiagnosticService {
	/**
	 * Diagnoses an error by searching for relevant codebase chunks.
	 */
	static async diagnose(errorId: string): Promise<DiagnosticResult> {
		// 1. Fetch error details from telemetry
		const result = await db.execute(sql`
			SELECT data, timestamp FROM admin_telemetry WHERE id = ${errorId}
		`);
		const error = result.rows[0];

		const errorData = (error as any)?.data || {};
		const errorMessage = errorData.message || errorData.error || 'Unknown error';
		const stackTrace = errorData.stack || '';

		// 2. Perform agentic search for relevant code
		// We use the error message + stack trace as the query
		const searchQuery = `${errorMessage} ${stackTrace}`.slice(0, 500);
		const searchResults = await AgenticSearchService.search(searchQuery, {
			collection: 'codebase_chunks',
			limit: 5,
			expandQuery: true
		});

		// 3. (Optional) Use LLM to analyze the hits vs the error
		// For now, we return the suspected files based on vector score
		return {
			error: errorMessage,
			suspectedFiles: searchResults.results.map(r => ({
				path: r.payload.path,
				snippet: r.payload.content_preview,
				score: r.score
			})),
			rootCauseAnalysis: 'Vector-matched codebase chunks based on error signature.'
		};
	}
}
