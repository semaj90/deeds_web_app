import { json } from '@sveltejs/kit';
import { validateResearchGain } from '$lib/server/research/research-gain-validator.js';
import { encodeResearchToWiki } from '$lib/server/research/research-to-wiki-encoder.js';
import { calculateResearchScore } from '$lib/server/research/research-source-ranker.js';
import type { RequestHandler } from './$types.js';

/**
 * POST /api/research/encode
 * 
 * Manually or automatically triggers the research-to-wiki encoding bridge.
 * Validates the information gain of an external finding against internal code.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { query, source, externalFinding, internalContext, linkedFiles } = body as Record<string, unknown>;
		const queryStr = String(query ?? '');
		const sourceStr = String(source ?? 'manual');
		const findingStr = String(externalFinding ?? '');
		const linkedFilesArr: string[] = Array.isArray(linkedFiles) ? linkedFiles.map(String) : [];

		const VALID_SOURCE_TYPES = ['official_docs','github_repo','github_issue','github_pr','maintainer_comment','blog_post','reddit_post','unknown'] as const;
		type RST = typeof VALID_SOURCE_TYPES[number];
		const sourceType: RST = (VALID_SOURCE_TYPES as readonly string[]).includes(sourceStr) ? sourceStr as RST : 'unknown';

		// 1. Validate Information Gain via Gemma4
		const validation = await validateResearchGain({
			query: queryStr,
			internalContext: String(internalContext ?? ''),
			externalFinding: findingStr,
			sourceType,
		});

		if (validation.success && validation.shouldEncode) {
			// 2. Calculate Final Research Score (Trust + Gain + Alignment)
			const { finalScore, tier } = calculateResearchScore({
				relevance: 0.8,
				informationGain: validation.gainScore,
				sourceType,
				recency: 0.9,
				internalAlignment: validation.alignmentScore,
			});

			// 3. Encode to Wiki (CouchDB, Qdrant, Neo4j)
			const result = await encodeResearchToWiki({
				query: queryStr,
				outsideSources: findingStr
					? [{ title: sourceStr, url: '', snippet: findingStr.slice(0, 300) }]
					: [],
				internalAreas: linkedFilesArr,
				confidence: finalScore,
				pipeline: sourceStr,
			});

			return json({
				success: true,
				noteId: result.noteId,
				gainScore: finalScore,
				tier,
				reasoning: validation.reasoning
			});
		}

		return json({
			success: false,
			reason: validation.reasoning || 'Insufficient information gain',
			gainScore: validation.gainScore
		});

	} catch (error) {
		console.error('[research-api] Encoding failed:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
