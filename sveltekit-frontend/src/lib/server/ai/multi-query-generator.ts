import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';

export class MultiQueryGenerator {
	/**
	 * Expands a single user query into multiple semantically diverse search queries.
	 */
	static async generate(query: string, count: number = 3): Promise<string[]> {
		const prompt = `
[MULTI-QUERY GENERATOR]
Expand the following legal research query into ${count} diverse search variations to improve retrieval recall.
Focus on different terminology, synonyms, and related legal concepts.

QUERY: "${query}"

Return ONLY a JSON array of strings: ["...", "...", "..."]
`.trim();
		try {
			const response = await bifrostChat(
				[{ role: 'user', content: prompt }],
				ENV.GEMMA4_MODEL,
				{ temperature: 0.7, maxTokens: 200 }
			);

			const match = response.match(/\[.*\]/s);
			if (match) {
				const generated = JSON.parse(match[0]);
				// Ensure original query is always the first variant for maximum precision
				const combined = [query, ...generated];
				return Array.from(new Set(combined.map(s => s.trim()))).slice(0, count + 1);
			}
		} catch (err) {
			console.error('[MultiQueryGenerator] Failed to generate queries:', err);
		}

		return [query]; // Fallback to original
	}
}
