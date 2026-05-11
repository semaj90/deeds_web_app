import { AgenticSearchService } from '$lib/server/vector/agentic-search';
import { CitationAuthorityService } from '$lib/server/legal/authority-service';
import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';

export interface LegalStrategy {
	claim: string;
	reasoningChain: string[];
	authorities: any[];
	conclusion: string;
}

export class LegalStrategyAgent {
	/**
	 * Generates a comprehensive legal strategy based on a research query.
	 */
	static async generateStrategy(query: string): Promise<LegalStrategy> {
		// Step 1: Initial Broad Search (Agentic Multi-Query)
		const searchResults = await AgenticSearchService.search(query, {
			collection: 'legal_canon_chunks',
			limit: 10
		});

		// Step 2: Rerank by Legal Authority
		const rankedAuthorities = CitationAuthorityService.rerankByAuthority(searchResults.results);

		// Step 3: Synthesis via LLM
		const context = rankedAuthorities.map(a => `[${a.payload.citation}] ${a.payload.content_preview}`).join('\n\n');
		
		const prompt = `
[LEGAL STRATEGY AGENT]
You are a senior legal strategist. Based on the provided authorities, build a multi-step "Reasoning Chain" to address the query.
Prioritize Constitutional and Statutory authorities over Judicial ones unless a landmark case is present.

QUERY: "${query}"

AUTHORITIES:
${context}

Return ONLY a JSON object:
{
  "claim": "The core legal proposition",
  "reasoningChain": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "authorities": ["Citation 1", "Citation 2"],
  "conclusion": "Final recommendation"
}
`.trim();

		try {
			const response = await bifrostChat(
				[{ role: 'user', content: prompt }],
				ENV.GEMMA4_MODEL,
				{ temperature: 0.2, maxTokens: 1000 }
			);

			const match = response.match(/\{.*\}/s);
			if (match) {
				return JSON.parse(match[0]);
			}
		} catch (err) {
			console.error('[LegalStrategyAgent] Failed to generate strategy:', err);
		}

		return {
			claim: 'Unable to synthesize strategy.',
			reasoningChain: [],
			authorities: [],
			conclusion: 'Incomplete data.'
		};
	}
}
