import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';

export type TraceRerankResult = {
	id: string | number;
	score: number;
	payload: any;
	lenses: Array<{ type: string; text: string }>;
};

/**
 * TRACE Reranker: Triage, Retrieve, Align, Compose, Encode.
 * 
 * Performs multi-stage retrieval across codebase chunks, architectural lenses,
 * and synthesis memory to provide high-precision context for agentic tasks.
 */
export async function traceRerank(params: {
	query: string;
	queryEmbedding: number[];
	limit?: number;
	intentOverride?: string[];
}): Promise<TraceRerankResult[]> {
	const qdrant = getQdrantClient();
	const limit = params.limit ?? 10;

	// 1. Triage Intent
	const lensesToRetrieve = params.intentOverride ?? detectIntentLenses(params.query);

	// 2. Retrieve Chunks (Codebase level)
	const chunkHits = await qdrant.hybridSearch({
		collection: 'codebase_chunks',
		query: params.query,
		queryEmbedding: params.queryEmbedding,
		limit: limit * 3 // Over-retrieve for reranking
	});

	// 3. Retrieve Lenses (Architectural intent level)
	const lensHits = await qdrant.hybridSearch({
		collection: 'summary_lenses',
		query: params.query,
		queryEmbedding: params.queryEmbedding,
		filters: { lens_type: lensesToRetrieve },
		limit: limit * 2
	});

	// 4. Retrieve Synthesis Memory (Reasoning history level)
	const memoryHits = await qdrant.hybridSearch({
		collection: 'synthesis_memory',
		query: params.query,
		queryEmbedding: params.queryEmbedding,
		limit: 5
	});

	// 5. Retrieve External Research (Lane 3 / World Evidence level)
	// Includes both raw web chunks and encoded Research Notes
	const researchHits = await qdrant.hybridSearch({
		collection: 'synthesis_memory_768', // Encoded research notes live here too
		query: params.query,
		queryEmbedding: params.queryEmbedding,
		filters: { vector_type: 'research_note' },
		limit: 3
	});

	// 6. Align (Intent-based Reranking)
	const results: TraceRerankResult[] = chunkHits.results.map((chunk) => {
		const filePath = (chunk.payload?.path as string) ?? '';
		
		// Find lenses associated with this file or its parent directories
		const associatedLenses = lensHits.results.filter((l) => {
			const lensKey = (l.payload?.stable_key as string) ?? '';
			return filePath.startsWith(lensKey.replace('file:', '').replace('dir:', ''));
		});

		// Calculate intent alignment boost
		let intentBoost = 0;
		if (associatedLenses.length > 0) {
			intentBoost = Math.max(...associatedLenses.map(l => l.score)) * 0.15;
		}

		// Calculate memory alignment boost (Internal reasoning)
		let memoryBoost = 0;
		if (memoryHits.results.some(m => (m.payload?.content as string)?.includes(filePath))) {
			memoryBoost = 0.1;
		}

		// Calculate research alignment boost (External evidence)
		let researchBoost = 0;
		const relevantResearch = researchHits.results.find(r => 
			(r.payload?.linkedFiles as string[])?.includes(filePath)
		);
		if (relevantResearch) {
			const trustTier = (relevantResearch.payload?.trustTier as string) ?? 'unverified';
			const trustMultiplier = trustTier === 'official_or_primary' ? 0.25 : 0.1;
			researchBoost = relevantResearch.score * trustMultiplier;
		}

		return {
			id: chunk.id,
			score: chunk.score + intentBoost + memoryBoost + researchBoost,
			payload: chunk.payload,
			lenses: associatedLenses.map(l => ({
				type: (l.payload?.lens_type as string) ?? 'summary',
				text: (l.payload?.text as string) ?? ''
			}))
		};
	});

	// 7. Sort and return top candidates
	return results
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}

function detectIntentLenses(query: string): string[] {
	const q = query.toLowerCase();
	if (q.includes('how to') || q.includes('example') || q.includes('usage') || q.includes('api')) {
		return ['api_surface', 'purpose'];
	}
	if (q.includes('risk') || q.includes('security') || q.includes('vulnerability') || q.includes('audit')) {
		return ['risk', 'audit'];
	}
	if (q.includes('fix') || q.includes('error') || q.includes('bug') || q.includes('broken')) {
		return ['risk', 'purpose', 'retrieval_role'];
	}
	if (q.includes('depend') || q.includes('import') || q.includes('use') || q.includes('connection')) {
		return ['dependencies', 'api_surface'];
	}
	if (q.includes('research') || q.includes('others') || q.includes('github') || q.includes('reddit')) {
		return ['retrieval_role', 'purpose']; // External research is retrieved separately
	}
	return ['purpose', 'retrieval_role'];
}
