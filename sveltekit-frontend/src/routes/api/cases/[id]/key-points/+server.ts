import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq, sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

/**
 * POST /api/cases/[id]/key-points
 * Batch-generate key points for all evidence in a case that don't have them yet.
 * Sequential to avoid Ollama overload, max 10 items per batch.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const caseId = params.id;

	const rows = await db
		.select({
			id: evidence.id,
			title: evidence.title,
			description: evidence.description,
			summary: evidence.summary,
			aiSummary: evidence.aiSummary,
			aiAnalysis: evidence.aiAnalysis,
			type: evidence.type
		})
		.from(evidence)
		.where(eq(evidence.caseId, caseId));

	if (rows.length === 0) {
		return json({ generated: 0, skipped: 0, total: 0, message: 'No evidence found for this case' });
	}

	// Filter to items missing keyPoints
	const needsGeneration = rows.filter(r => {
		const analysis = r.aiAnalysis as Record<string, unknown> | null;
		return !analysis?.keyPoints || !Array.isArray(analysis.keyPoints) || analysis.keyPoints.length === 0;
	});

	const alreadyHave = rows.length - needsGeneration.length;
	const toProcess = needsGeneration.slice(0, 10); // Cap at 10
	let generated = 0;

	for (const item of toProcess) {
		const contentForAnalysis = [
			item.title && `Title: ${item.title}`,
			item.description && `Description: ${item.description}`,
			item.type && `Type: ${item.type}`,
			item.aiSummary && `AI Summary: ${String(item.aiSummary)}`,
			item.summary && `Summary: ${String(item.summary)}`
		].filter(Boolean).join('\n');

		if (!contentForAnalysis || contentForAnalysis.length < 10) continue;

		const prompt = `Analyze this evidence item and provide exactly 3 concise bullet points:

${contentForAnalysis.slice(0, 3000)}

Respond with ONLY a JSON object:
{
  "keyPoints": [
    "What this evidence shows (factual finding)",
    "Why it matters legally (significance)",
    "How it connects to the case (relevance)"
  ],
  "confidence": 0.0-1.0
}`;

		try {
			const ollamaRes = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma3-legal:latest',
					prompt,
					format: 'json',
					stream: false,
					options: { temperature: 0.3, num_predict: 512 }
				}),
				signal: AbortSignal.timeout(45000)
			});

			if (!ollamaRes.ok) continue;

			const data = await ollamaRes.json();
			const result = JSON.parse(data.response);

			if (Array.isArray(result.keyPoints) && result.keyPoints.length > 0) {
				const keyPoints = result.keyPoints.slice(0, 3).map((p: unknown) => String(p).trim());
				const confidence = Math.min(Math.max(Number(result.confidence) || 0.7, 0), 1);

				await db.execute(sql`
					UPDATE evidence
					SET ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) || ${JSON.stringify({
						keyPoints,
						keyPointsConfidence: confidence,
						keyPointsGeneratedAt: new Date().toISOString()
					})}::jsonb,
					updated_at = NOW()
					WHERE id = ${item.id}
				`);
				generated++;
			}
		} catch {
			// Skip failed items, continue with next
			continue;
		}
	}

	return json({
		generated,
		skipped: alreadyHave,
		remaining: Math.max(needsGeneration.length - toProcess.length, 0),
		total: rows.length
	});
};
