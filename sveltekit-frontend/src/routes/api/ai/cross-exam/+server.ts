import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

/** POST /api/ai/cross-exam — Generate cross-examination questions for a witness */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const witness = body.witness || {};
		const caseContext = body.caseContext || '';

		const witnessName = witness.name || 'Unknown Witness';
		const witnessStatement = witness.statement || '';

		const systemPrompt = `You are an experienced trial attorney preparing cross-examination questions.
Analyze the witness information and case context to generate strategic questions.
Focus on inconsistencies, credibility challenges, and facts favorable to the examining party.
Respond in JSON format with this structure:
{
  "session": {
    "id": "generated-id",
    "witness": { "name": "${witnessName}" },
    "questions": [
      { "text": "question text", "purpose": "why this question matters", "expectedAnswer": "anticipated response", "followUp": "follow-up if evasive" }
    ],
    "strategy": "overall cross-examination strategy summary",
    "generatedAt": "ISO timestamp"
  }
}`;

		const userPrompt = `Witness: ${witnessName}
${witnessStatement ? `Statement: ${witnessStatement}` : ''}
${caseContext ? `Case Context: ${caseContext}` : ''}

Generate 5-8 strategic cross-examination questions.`;

		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
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
				options: { temperature: 0.5 }
			}),
			signal: AbortSignal.timeout(60_000)
		});

		if (!res.ok) return json({ error: `Ollama error: ${res.status}` }, { status: 502 });

		const data = await res.json();
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(data.message?.content || data.response || '{}');
		} catch {
			parsed = {
				session: {
					id: crypto.randomUUID(),
					witness: { name: witnessName },
					questions: [{ text: data.message?.content || data.response || '', purpose: 'Raw response', expectedAnswer: '', followUp: '' }],
					strategy: 'Generated from raw LLM output',
					generatedAt: new Date().toISOString()
				}
			};
		}

		if (!parsed.session) {
			parsed = { session: { ...parsed, id: crypto.randomUUID(), generatedAt: new Date().toISOString() } };
		}

		return json(parsed);
	} catch (err) {
		console.error('[ai/cross-exam] Error:', err);
		return json({ error: 'AI service unavailable' }, { status: 503 });
	}
};
