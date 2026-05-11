import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';

export interface Recommendation {
	id: string;
	title: string;
	description: string;
	type: 'research' | 'indexing' | 'review' | 'system';
	priority: 'high' | 'medium' | 'low';
	actionUrl?: string;
}

export class RecommendationEngine {
	/**
	 * Analyzes system state and suggests the "Next Best Action".
	 */
	static async getRecommendations(context: any): Promise<Recommendation[]> {
		const prompt = `
[RECOMMENDATION ENGINE - TRACE COPILOT]
Based on the following system state, suggest 3 high-impact next steps for the administrator.

STATE:
${JSON.stringify(context)}

Return ONLY a JSON array of recommendations with: 
{ "id": "...", "title": "...", "description": "...", "type": "...", "priority": "...", "actionUrl": "..." }
`.trim();

		try {
			const response = await bifrostChat(
				[{ role: 'user', content: prompt }],
				ENV.GEMMA4_MODEL,
				{ temperature: 0.1, maxTokens: 300 }
			);

			const match = response.match(/\[.*\]/s);
			if (match) {
				return JSON.parse(match[0]);
			}
		} catch (err) {
			console.error('[RecommendationEngine] Failed to generate recommendations:', err);
		}

		// Fallback defaults
		return [
			{ id: 'rec:raptor', title: 'Rebuild RAPTOR Tree', description: 'Recent evidence uploads have not been thematic clustered.', type: 'indexing', priority: 'medium', actionUrl: '/api/admin/raptor/build' },
			{ id: 'rec:citations', title: 'Scan for Citations', description: 'Cross-references in newly ingested statutes are missing.', type: 'research', priority: 'high', actionUrl: '/api/admin/citations/discover' }
		];
	}
}
