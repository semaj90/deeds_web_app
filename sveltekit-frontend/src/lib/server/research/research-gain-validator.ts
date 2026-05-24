import { bifrostChat } from '$lib/server/ollama.js';

/**
 * Research Gain Validator: Evaluates if an external finding (GitHub/Docs/Reddit)
 * provides meaningful improvement or clarification over our current 
 * internal implementation understanding.
 */
export async function validateResearchGain(params: {
	query: string;
	internalContext: string; // What we know from our code
	externalFinding: string; // What we found in Lane 3
	sourceType: string;
}) {
	try {
		const response = await bifrostChat([
				{
					role: 'system',
					content: 'You are a Research Quality Auditor. Compare an external technical finding with a codebase implementation and decide if the finding provides significant "Information Gain" that justifies saving it as a durable Research Note.'
				},
				{
					role: 'user',
					content: `
Query: ${params.query}
Source: ${params.sourceType}

--- INTERNAL CODE TRUTH ---
${params.internalContext || '[No internal context provided]'}

--- EXTERNAL FINDING ---
${params.externalFinding}

--- EVALUATION ---
Decide if this finding improves our current understanding or provides a verified fix pattern we don't have.

OUTPUT JSON:
{
  "shouldEncode": boolean,
  "gainScore": number (0.0 to 1.0),
  "alignmentScore": number (0.0 to 1.0, how well it maps to our specific code),
  "reasoning": "string",
  "recommendedAction": "string"
}
`.trim()
				}
			], 'gemma4-rotorquant:latest');

		const content = response.trim();
		const jsonMatch = content.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const result = JSON.parse(jsonMatch[0]);
			return {
				success: true,
				...result
			};
		}

		return {
			success: false,
			error: 'Failed to parse validator response'
		};
	} catch (error) {
		console.error('[research-validator] Gain validation failed:', error);
		return {
			success: false,
			shouldEncode: false,
			error: String(error)
		};
	}
}
