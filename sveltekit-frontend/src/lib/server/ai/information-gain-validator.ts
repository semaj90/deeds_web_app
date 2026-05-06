import { bifrostChat } from '$lib/server/ollama.js';

/**
 * Information Gain Validator: Evaluates if a new piece of synthesized
 * information (candidate) is superior to existing knowledge.
 *
 * Used to prevent "summary soup" and ensure only high-quality, high-gain
 * memories are encoded into the long-term memory layer.
 */
export async function validateInformationGain(params: {
	context: string;
	existing: string;
	candidate: string;
	criteria?: string[];
}) {
	const defaultCriteria = [
		'Accuracy: Is the candidate technically correct?',
		'Density: Does it provide more facts per sentence?',
		'Clarity: Is it easier for an agent to parse?',
		'Novelty: Does it cover aspects missing in the existing version?'
	];

	const criteria = params.criteria ?? defaultCriteria;

	try {
		const response = await bifrostChat([
			{
				role: 'system',
				content: 'You are a Knowledge Integrity Auditor. Your job is to compare two technical summaries and decide if the new one represents a significant improvement (Information Gain).'
			},
			{
				role: 'user',
				content: `
Context: ${params.context}

--- EXISTING KNOWLEDGE ---
${params.existing || '[None]'}

--- CANDIDATE INFORMATION ---
${params.candidate}

--- EVALUATION CRITERIA ---
${criteria.join('\n')}

--- OUTPUT FORMAT ---
Provide your verdict in JSON:
{
  "shouldUpdate": boolean,
  "gainScore": number (0.0 to 1.0),
  "reasoning": "string explaining why",
  "improvements": ["list", "of", "delta", "points"]
}
`.trim()
			}
		], 'gemma4-legal-vlm');

		const content = response.trim();
		const jsonMatch = content.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const result = JSON.parse(jsonMatch[0]);

			// Audit Log (Postgres) - non-fatal fire-and-forget
			try {
				const { db } = await import('$lib/server/db/client');
				const { memoryGainAudits } = await import('$lib/server/db/schema.js');
				const crypto = await import('crypto');

				await db.insert(memoryGainAudits).values({
					query: params.context,
					candidateHash: crypto.createHash('md5').update(params.candidate).digest('hex'),
					gainScore: result.gainScore,
					decision: result.shouldUpdate ? 'accepted' : 'rejected',
					reasoning: result.reasoning,
					improvements: result.improvements || [],
					metadata: { criteria }
				});
			} catch (auditError) {
				console.error('[validator] Audit log failed:', auditError);
			}

			return {
				success: true,
				...result
			};
		}

		return {
			success: false,
			error: 'Failed to parse validator response',
			raw: content
		};
	} catch (error) {
		console.error('[validator] Information gain check failed:', error);
		return {
			success: false,
			shouldUpdate: false,
			error: String(error)
		};
	}
}

/**
 * Heuristic validator: Quick check for basic quality before LLM validation.
 */
export function heuristicQualityCheck(content: string): boolean {
	if (!content || content.length < 100) return false;
	if (content.includes('I don\'t know') || content.includes('error occurred')) return false;

	const techTerms = ['api', 'function', 'class', 'method', 'endpoint', 'schema', 'database', 'vector', 'embedding'];
	const foundTerms = techTerms.filter(term => content.toLowerCase().includes(term));

	return foundTerms.length >= 2;
}
