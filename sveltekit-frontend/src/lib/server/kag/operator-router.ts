import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';

export type RetrievalLane = 'vector_rag' | 'thematic_raptor' | 'citation_graph' | 'agentic_multiquery' | 'hybrid';


export interface RouterDecision {
	lane: RetrievalLane;
	reason: string;
	confidence: number;
}

export class OperatorRouter {
	/**
	 * Classifies a user query into the optimal retrieval lane.
	 */
	static async route(query: string): Promise<RouterDecision> {
		const prompt = `
[KAG OPERATOR ROUTER]
Determine the best retrieval strategy for the following legal AI query.

LANES:
1. vector_rag: For specific facts, dates, entities, or local sections.
2. thematic_raptor: For broad themes, constitutional principles, or "what is the general view on..." questions.
3. citation_graph: For questions about legal authority, precedent, or "what laws reference..." questions.
4. agentic_multiquery: For complex, multi-faceted research queries that benefit from diverse search angles.
5. hybrid: If multiple lanes are needed.


QUERY: "${query}"

Return ONLY a JSON object with: { "lane": "...", "reason": "...", "confidence": 0.0-1.0 }
`.trim();

		try {
			const response = await bifrostChat(
				[{ role: 'user', content: prompt }],
				ENV.GEMMA4_MODEL,
				{ temperature: 0, maxTokens: 100 }
			);

			// Extract JSON from response
			const match = response.match(/\{.*\}/s);
			if (match) {
				const decision = JSON.parse(match[0]);
				return {
					lane: decision.lane as RetrievalLane,
					reason: decision.reason || 'LLM classification',
					confidence: decision.confidence || 0.8
				};
			}
		} catch (err) {
			console.error('[OperatorRouter] LLM routing failed, falling back to heuristics:', err);
		}

		// Heuristic Fallback
		if (query.toLowerCase().includes('theme') || query.toLowerCase().includes('general')) {
			return { lane: 'thematic_raptor', reason: 'Heuristic: theme/general keywords', confidence: 0.6 };
		}
		if (query.toLowerCase().includes('cite') || query.toLowerCase().includes('authority')) {
			return { lane: 'citation_graph', reason: 'Heuristic: cite/authority keywords', confidence: 0.6 };
		}

		return { lane: 'vector_rag', reason: 'Heuristic: default lane', confidence: 0.5 };
	}
}
