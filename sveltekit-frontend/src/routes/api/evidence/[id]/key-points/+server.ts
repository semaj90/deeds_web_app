import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq, sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const keyPointsSchema = z.object({
	caseId: z.string().uuid().optional()
});

/**
 * GET /api/evidence/[id]/key-points
 * Return stored key points from evidence.aiAnalysis.keyPoints
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const rows = await db
		.select({ aiAnalysis: evidence.aiAnalysis })
		.from(evidence)
		.where(eq(evidence.id, params.id))
		.limit(1);

	if (!rows[0]) return json({ error: 'Evidence not found' }, { status: 404 });

	const analysis = rows[0].aiAnalysis as Record<string, unknown> | null;
	return json({
		evidenceId: params.id,
		keyPoints: (analysis?.keyPoints as string[]) ?? [],
		confidence: (analysis?.keyPointsConfidence as number) ?? 0,
		generatedAt: (analysis?.keyPointsGeneratedAt as string) ?? null
	});
};

/**
 * POST /api/evidence/[id]/key-points
 * Generate 1-3 key point bullets via Ollama and store in evidence.aiAnalysis
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	let rawBody: unknown;
	try { rawBody = await request.json(); } catch { rawBody = {}; }
	const parsed = keyPointsSchema.safeParse(rawBody);
	if (!parsed.success) return json({ error: 'Invalid input' }, { status: 400 });

	const rows = await db
		.select({
			title: evidence.title,
			description: evidence.description,
			summary: evidence.summary,
			aiSummary: evidence.aiSummary,
			aiAnalysis: evidence.aiAnalysis,
			type: evidence.type,
			caseId: evidence.caseId
		})
		.from(evidence)
		.where(eq(evidence.id, params.id))
		.limit(1);

	if (!rows[0]) return json({ error: 'Evidence not found' }, { status: 404 });

	const row = rows[0];
	const contentForAnalysis = [
		row.title && `Title: ${row.title}`,
		row.description && `Description: ${row.description}`,
		row.type && `Type: ${row.type}`,
		row.aiSummary && `AI Summary: ${row.aiSummary}`,
		row.summary && `Summary: ${row.summary}`
	].filter(Boolean).join('\n');

	if (!contentForAnalysis || contentForAnalysis.length < 10) {
		return json({ error: 'Insufficient evidence content for analysis' }, { status: 422 });
	}

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

	let keyPoints: string[] = [];
	let confidence = 0.7;

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

		if (!ollamaRes.ok) {
			return json({ error: 'AI service unavailable' }, { status: 502 });
		}

		const data = await ollamaRes.json();
		const result = JSON.parse(data.response);

		if (Array.isArray(result.keyPoints) && result.keyPoints.length > 0) {
			keyPoints = result.keyPoints.slice(0, 3).map((p: unknown) => String(p).trim());
			confidence = Math.min(Math.max(Number(result.confidence) || 0.7, 0), 1);
		} else {
			return json({ error: 'AI returned invalid response' }, { status: 502 });
		}
	} catch {
		return json({ error: 'Key points generation failed' }, { status: 503 });
	}

	// Store in aiAnalysis via JSONB merge
	const generatedAt = new Date().toISOString();
	try {
		await db.execute(sql`
			UPDATE evidence
			SET ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) || ${JSON.stringify({
				keyPoints,
				keyPointsConfidence: confidence,
				keyPointsGeneratedAt: generatedAt
			})}::jsonb,
			updated_at = NOW()
			WHERE id = ${params.id}
		`);
	} catch {
		return json({ error: 'Failed to store key points' }, { status: 500 });
	}

	return json({
		evidenceId: params.id,
		keyPoints,
		confidence,
		generatedAt
	});
};
