import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

/** POST /api/v1/evidence/analyze — Proxy to /api/evidence/analysis + Ollama */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { evidenceId, content, type } = body;

		if (!content && !evidenceId) {
			return json({ error: 'content or evidenceId required' }, { status: 400 });
		}

		const textToAnalyze = content || '';

		// Run entity extraction + forensics via Ollama
		const prompt = `Analyze this legal evidence and extract:
1. Key entities (persons, organizations, dates, amounts)
2. Legal relevance (high/medium/low)
3. Evidence type classification
4. Risk indicators
5. Summary (2-3 sentences)

Evidence text:
${textToAnalyze.slice(0, 2000)}`;

		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: 'You are a legal evidence analyst. Extract structured data from evidence.' },
					{ role: 'user', content: prompt }
				],
				stream: false,
				options: { temperature: 0.2 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) {
			return json({ error: 'AI analysis unavailable' }, { status: 502 });
		}

		const data = await res.json();
		return json({
			analysis: data.message?.content || '',
			evidenceId: evidenceId || null,
			type: type || 'unknown',
			model: 'gemma3-legal:latest',
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		console.error('[/api/v1/evidence/analyze]', err);
		return json({ error: 'Analysis failed' }, { status: 500 });
	}
};
