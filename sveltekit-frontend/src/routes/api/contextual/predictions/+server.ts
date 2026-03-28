import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';

const querySchema = z.object({
	sessionId: z.string().min(1, 'sessionId required').max(200)
});

/**
 * GET /api/contextual/predictions?sessionId=...&userId=...
 * Get next-step predictions based on HMM state
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ success: false, error: parsed.error.issues[0]?.message ?? 'sessionId required' }, { status: 400 });
	}
	const { sessionId } = parsed.data;

	try {
		const redis = getRedis();
		const stateData = await redis.get(`contextual:state:${sessionId}`);

		let currentState = 0;
		if (stateData) {
			const parsed = JSON.parse(stateData);
			currentState = parsed.hmmState?.currentState ?? 0;
		}

		// Generate predictions based on current HMM state
		const predictions = generatePredictions(currentState);

		return json({ success: true, data: { predictions } });
	} catch {
		return json({
			success: true,
			data: { predictions: generatePredictions(0) }
		});
	}
};

/** Generate next-step predictions based on current state */
function generatePredictions(currentState: number) {
	const predictionMap: Record<number, Array<{ action: string; confidence: number }>> = {
		0: [ // Greeting
			{ action: 'Ask about a specific case', confidence: 0.85 },
			{ action: 'Request document analysis', confidence: 0.60 },
			{ action: 'Begin legal research', confidence: 0.45 }
		],
		1: [ // Case Inquiry
			{ action: 'Request document review', confidence: 0.80 },
			{ action: 'Ask for legal precedents', confidence: 0.70 },
			{ action: 'Request risk assessment', confidence: 0.55 }
		],
		2: [ // Document Analysis
			{ action: 'Extract key entities', confidence: 0.75 },
			{ action: 'Compare with similar documents', confidence: 0.65 },
			{ action: 'Generate summary', confidence: 0.60 }
		],
		3: [ // Legal Research
			{ action: 'Find relevant statutes', confidence: 0.80 },
			{ action: 'Review case precedents', confidence: 0.70 },
			{ action: 'Request risk assessment', confidence: 0.50 }
		],
		4: [ // Risk Assessment
			{ action: 'Get recommendation', confidence: 0.85 },
			{ action: 'Explore mitigation strategies', confidence: 0.70 },
			{ action: 'Review additional cases', confidence: 0.45 }
		],
		5: [ // Recommendation
			{ action: 'Ask follow-up questions', confidence: 0.75 },
			{ action: 'Request detailed analysis', confidence: 0.60 },
			{ action: 'Conclude conversation', confidence: 0.50 }
		],
		6: [ // Follow-up
			{ action: 'Get recommendation', confidence: 0.70 },
			{ action: 'New case inquiry', confidence: 0.55 },
			{ action: 'Conclude conversation', confidence: 0.45 }
		],
		7: [ // Conclusion
			{ action: 'Start new conversation', confidence: 0.80 },
			{ action: 'Review session summary', confidence: 0.65 },
			{ action: 'Export conversation', confidence: 0.40 }
		]
	};

	return predictionMap[currentState] ?? predictionMap[0];
}
