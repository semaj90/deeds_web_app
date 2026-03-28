import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { TIMEOUTS } from '$lib/server/timeouts.js';

const VALID_SCOPES = ['case', 'evidence', 'poi'] as const;

const reportSchema = z.object({
	context: z.record(z.string(), z.unknown()).optional().default({})
});

const SCOPE_PROMPTS: Record<string, string> = {
	case: `Generate a professional case report. Include:
1. Executive Summary
2. Case Background & Facts
3. Legal Issues Identified
4. Evidence Assessment
5. Risk Analysis
6. Recommendations
Format with markdown headings.`,
	evidence: `Generate a professional evidence report. Include:
1. Evidence Inventory Summary
2. Chain of Custody Status
3. Admissibility Assessment
4. Key Findings
5. Gaps & Missing Evidence
6. Recommendations for Further Collection
Format with markdown headings.`,
	poi: `Generate a professional persons-of-interest report. Include:
1. Individual Profiles Summary
2. Relationship Network Overview
3. Risk Assessment per Individual
4. Timeline of Relevant Activities
5. Investigative Leads
6. Recommendations
Format with markdown headings.`
};

/** POST /api/ai/generate-report/[scope] — AI-generated structured reports */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const scope = params.scope;

	if (!VALID_SCOPES.includes(scope as (typeof VALID_SCOPES)[number])) {
		return json(
			{ message: `Invalid scope: ${scope}. Valid: ${VALID_SCOPES.join(', ')}` },
			{ status: 400 }
		);
	}

	try {
		const raw = await request.json();
		const parsed = reportSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const contextStr = Object.keys(parsed.data.context).length > 0
			? `\n\nAvailable context data:\n${JSON.stringify(parsed.data.context, null, 2)}`
			: '';

		const systemPrompt = SCOPE_PROMPTS[scope] || SCOPE_PROMPTS.case;
		const userMessage = `Generate a comprehensive ${scope} report.${contextStr}`;

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userMessage }
				],
				stream: false,
				options: { temperature: 0.3 }
			}),
			signal: AbortSignal.timeout(TIMEOUTS.USER_FACING)
		});

		if (!res.ok) {
			return json({ report: null, error: 'AI service unavailable' }, { status: 503 });
		}

		const data = await res.json();
		const content = data.message?.content || '';

		return json({
			report: content,
			scope,
			model: data.model || 'gemma3-legal:latest',
			generatedAt: new Date().toISOString()
		});
	} catch (err) {
		console.error(`[/api/ai/generate-report/${scope}] error:`, err);
		return json({ report: null, error: 'Report generation failed' }, { status: 503 });
	}
};