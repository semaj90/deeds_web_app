import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { validateResearchGain } from '$lib/server/research/research-gain-validator.js';
import { encodeResearchToWiki } from '$lib/server/research/research-to-wiki-encoder.js';
import { calculateResearchScore } from '$lib/server/research/research-source-ranker.js';
import type { RequestHandler } from './$types.js';

const VALID_SOURCE_TYPES = [
  'official_docs', 'github_repo', 'github_issue', 'github_pr',
  'maintainer_comment', 'blog_post', 'reddit_post', 'unknown',
] as const;

const EncodeSchema = z.object({
  query:           z.string().min(1).max(2000),
  source:          z.enum(VALID_SOURCE_TYPES).default('unknown'),
  externalFinding: z.string().max(10000).default(''),
  internalContext: z.string().max(4000).default(''),
  linkedFiles:     z.array(z.string().max(500)).max(50).default([]),
});

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

	let rawBody: unknown;
	try { rawBody = await request.json(); }
	catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }

	const parsed = EncodeSchema.safeParse(rawBody);
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Bad request' }, { status: 400 });

	const { query: queryStr, source: sourceType, externalFinding: findingStr, internalContext, linkedFiles: linkedFilesArr } = parsed.data;

	try {

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
					? [{ title: sourceType, url: '', snippet: findingStr.slice(0, 300) }]
					: [],
				internalAreas: linkedFilesArr,
				confidence: finalScore,
				pipeline: sourceType,
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
