import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const judgeSchema = z.object({
	caseId: z.string().max(500).nullable().optional(),
	evidence: z.array(z.object({
		id: z.string().max(500),
		title: z.string().max(1000),
		description: z.string().max(5000).optional(),
		content: z.string().max(50000).optional()
	})).min(1, 'No evidence provided for judicial analysis').max(20),
	charges: z.array(z.string().max(500)).max(50).optional().default([]),
	jurisdiction: z.string().max(100).optional().default('federal')
});

/**
 * POST /api/ai/judge — Mock Trial Wizard (Phoenix Wright-style)
 *
 * Runs a simulated judicial analysis: the LLM acts as a judge evaluating
 * evidence admissibility, probable cause, case strength for both sides,
 * and issues strategic recommendations. Button-press → full courtroom simulation.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const parsed = judgeSchema.safeParse(await request.json());
		if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		const { caseId, evidence, charges, jurisdiction } = parsed.data;

		const evidenceList = evidence
			.slice(0, 10)
			.map(
				(e, i) =>
					`Evidence ${i + 1}: "${e.title}"${e.description ? ` — ${e.description}` : ''}${e.content ? `\nContent: ${String(e.content).slice(0, 500)}` : ''}`
			)
			.join('\n\n');

		const chargeList = charges.length > 0 ? charges.join('; ') : 'No specific charges filed';

		const systemPrompt = `You are a senior ${jurisdiction} judge conducting a mock trial simulation.
You must evaluate the case evidence, determine admissibility, assess probable cause,
score case strength for both prosecution and defense, and provide strategic recommendations.

IMPORTANT: You are simulating a courtroom proceeding. Be thorough, cite legal principles,
and provide realistic judicial reasoning as if presiding over an actual hearing.

Respond in strict JSON format:
{
  "analysis": {
    "id": "analysis-${Date.now()}",
    "caseId": ${caseId ? `"${caseId}"` : 'null'},
    "generatedAt": "${new Date().toISOString()}",
    "summary": "2-3 paragraph judicial summary of the case",
    "admissibility": [
      {
        "evidence": "evidence title",
        "ruling": "admissible|inadmissible|conditional",
        "reasoning": "detailed judicial reasoning for ruling",
        "legalBasis": "specific rule/statute (e.g., FRE 401, FRE 802, 4th Amendment)"
      }
    ],
    "probableCause": {
      "assessment": "strong|moderate|weak|none",
      "reasoning": "detailed probable cause analysis",
      "factors": ["factor 1", "factor 2"]
    },
    "caseStrength": {
      "overall": 65,
      "prosecution": 70,
      "defense": 55,
      "keyFactors": [
        { "factor": "description", "impact": "positive|negative|neutral", "weight": 20 }
      ]
    },
    "recommendations": ["strategic recommendation 1", "recommendation 2"],
    "risks": ["risk 1", "risk 2"]
  }
}

Rules for scoring:
- overall/prosecution/defense are 0-100
- keyFactors weights should roughly sum to 100
- Each evidence item MUST have an admissibility ruling
- Cite real legal rules (Federal Rules of Evidence, Constitutional amendments, etc.)`;

		const userPrompt = `MOCK TRIAL SIMULATION — ${jurisdiction.toUpperCase()} JURISDICTION

CHARGES: ${chargeList}

EVIDENCE PRESENTED:
${evidenceList}

Your Honor, please evaluate this case. Rule on evidence admissibility, assess probable cause, score the case strength for both prosecution and defense, and provide your judicial recommendations.`;

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				stream: false,
				format: 'json',
				options: { temperature: 0.5, num_predict: 4096 }
			}),
			signal: AbortSignal.timeout(120_000)
		});

		if (!res.ok) return json({ error: `Ollama error: ${res.status}` }, { status: 502 });

		const data = await res.json();
		let result: Record<string, unknown>;

		try {
			result = JSON.parse(data.message?.content || data.response || '{}');
		} catch {
			// LLM returned non-JSON — construct minimal analysis
			const rawText = data.message?.content || data.response || '';
			result = {
				analysis: {
					id: `analysis-${Date.now()}`,
					caseId,
					generatedAt: new Date().toISOString(),
					summary: rawText.slice(0, 2000),
					admissibility: evidence.map((e) => ({
						evidence: e.title,
						ruling: 'conditional' as const,
						reasoning: 'Unable to parse structured ruling — see summary',
						legalBasis: 'Review required'
					})),
					probableCause: {
						assessment: 'moderate',
						reasoning: 'See summary for detailed analysis',
						factors: ['Evidence submitted for review']
					},
					caseStrength: {
						overall: 50,
						prosecution: 50,
						defense: 50,
						keyFactors: [
							{
								factor: 'Analysis requires manual review',
								impact: 'neutral',
								weight: 100
							}
						]
					},
					recommendations: ['Review the full judicial summary above'],
					risks: ['Automated analysis may not capture all nuances']
				}
			};
		}

		// Ensure the analysis wrapper exists
		if (!result.analysis && result.admissibility) {
			result = { analysis: { ...result, id: `analysis-${Date.now()}`, generatedAt: new Date().toISOString() } };
		}

		return json(result);
	} catch (err) {
		console.error('[ai/judge] Mock trial error:', err);
		return json({ error: 'Mock trial simulation unavailable' }, { status: 503 });
	}
};