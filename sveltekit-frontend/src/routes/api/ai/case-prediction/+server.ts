import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { db } from '$lib/server/db/client';

/** POST /api/ai/case-prediction — AI-powered case outcome prediction */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { caseId } = await request.json();
		if (!caseId) return json({ error: 'caseId required' }, { status: 400 });

		// Load case data
		const { cases, evidence } = await import('$lib/server/db/schema');
		const { eq, count } = await import('drizzle-orm');

		const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
		if (!caseRow) return json({ error: 'Case not found' }, { status: 404 });

		const [evidenceCount] = await db
			.select({ count: count() })
			.from(evidence)
			.where(eq(evidence.caseId, caseId));

		const prompt = `Analyze this legal case and predict likely outcomes:
Case: ${caseRow.title}
Type: ${caseRow.practiceArea || 'General'}
Status: ${caseRow.status}
Evidence items: ${evidenceCount?.count || 0}
Description: ${caseRow.description || 'No description'}

Provide: 1) Likelihood of favorable outcome (0-100%), 2) Key risk factors, 3) Recommended next steps. Be concise.`;

		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: 'You are a legal case outcome analyst. Provide data-driven predictions.' },
					{ role: 'user', content: prompt }
				],
				stream: false,
				options: { temperature: 0.3 }
			})
		});

		if (!res.ok) return json({ error: 'AI service unavailable' }, { status: 502 });
		const data = await res.json();

		return json({
			prediction: data.message?.content || '',
			caseId,
			caseTitle: caseRow.title,
			evidenceCount: evidenceCount?.count || 0,
			model: 'gemma3-legal:latest'
		});
	} catch (err) {
		console.error('[/api/ai/case-prediction]', err);
		return json({ error: 'Prediction failed' }, { status: 500 });
	}
};
