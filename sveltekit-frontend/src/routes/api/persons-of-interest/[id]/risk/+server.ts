import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { personsOfInterest, evidence, cases } from '$lib/server/db/schema-postgres.js';
import { eq, sql, arrayContains } from 'drizzle-orm';

/**
 * GET /api/persons-of-interest/[id]/risk
 * Compute risk score based on evidence connections, case severity, threat level
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const poi = await db.select().from(personsOfInterest)
		.where(eq(personsOfInterest.id, params.id))
		.limit(1)
		.then(r => r[0]);

	if (!poi) throw error(404, 'Person of interest not found');

	// Gather signals in parallel
	const [evidenceCount, caseData] = await Promise.all([
		// Count evidence items linked to POI's cases
		poi.caseIds?.length
			? db.execute(sql`
				SELECT COUNT(*)::int AS cnt FROM evidence
				WHERE case_id = ANY(${sql.raw(`ARRAY[${poi.caseIds.map(id => `'${id}'`).join(',')}]::uuid[]`)})
			`).then(r => Number((r.rows[0] as any)?.cnt ?? 0)).catch(() => 0)
			: Promise.resolve(0),
		// Get case priorities
		poi.caseIds?.length
			? db.execute(sql`
				SELECT priority, status FROM cases
				WHERE id = ANY(${sql.raw(`ARRAY[${poi.caseIds.map(id => `'${id}'`).join(',')}]::uuid[]`)})
			`).then(r => r.rows as Array<{ priority: string; status: string }>).catch(() => [])
			: Promise.resolve([]),
	]);

	// Risk scoring: weighted signals (0-100)
	const threatWeights: Record<string, number> = { low: 10, medium: 30, high: 60, critical: 90 };
	const priorityWeights: Record<string, number> = { low: 5, medium: 15, high: 30, critical: 50 };

	const threatScore = threatWeights[poi.threatLevel] ?? 10;
	const caseCount = poi.caseIds?.length ?? 0;
	const caseSeverity = caseData.reduce((sum, c) => sum + (priorityWeights[(c as any).priority] ?? 10), 0);
	const activeCases = caseData.filter(c => ['open', 'active', 'investigating'].includes((c as any).status)).length;

	// Composite risk: 40% threat + 20% evidence + 20% case severity + 20% active cases
	const evidenceSignal = Math.min(evidenceCount * 5, 100);
	const caseSeveritySignal = Math.min(caseSeverity, 100);
	const activeCaseSignal = Math.min(activeCases * 25, 100);

	const riskScore = Math.round(
		threatScore * 0.4 +
		evidenceSignal * 0.2 +
		caseSeveritySignal * 0.2 +
		activeCaseSignal * 0.2
	);

	const riskLevel = riskScore >= 75 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low';

	return json({
		poiId: poi.id,
		name: poi.name,
		riskScore: Math.min(riskScore, 100),
		riskLevel,
		signals: {
			threatLevel: { value: poi.threatLevel, score: threatScore, weight: 0.4 },
			evidenceVolume: { value: evidenceCount, score: evidenceSignal, weight: 0.2 },
			caseSeverity: { value: caseSeverity, score: caseSeveritySignal, weight: 0.2 },
			activeCases: { value: activeCases, score: activeCaseSignal, weight: 0.2 },
		},
		metadata: {
			totalCases: caseCount,
			totalEvidence: evidenceCount,
			existingAiProfile: poi.aiProfile ?? null,
		},
		computedAt: new Date().toISOString(),
	});
};

/**
 * POST /api/persons-of-interest/[id]/risk
 * Update the AI risk profile via Ollama analysis
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const poi = await db.select().from(personsOfInterest)
		.where(eq(personsOfInterest.id, params.id))
		.limit(1)
		.then(r => r[0]);

	if (!poi) throw error(404, 'Person of interest not found');

	// Generate AI risk assessment via Ollama
	const prompt = `Analyze risk profile for person of interest:
Name: ${poi.name}
Threat Level: ${poi.threatLevel}
Status: ${poi.status}
Cases: ${poi.caseIds?.length ?? 0}
Description: ${poi.description ?? 'None'}

Provide a JSON object with: riskScore (0-100), patterns (string[]), recommendations (string[]).`;

	let aiProfile = poi.aiProfile ?? { riskScore: 0, patterns: [], recommendations: [], lastUpdated: '' };

	try {
		const ollamaRes = await fetch('http://localhost:11434/api/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'gemma3-legal:latest', prompt, format: 'json', stream: false }),
			signal: AbortSignal.timeout(30000),
		});
		if (ollamaRes.ok) {
			const data = await ollamaRes.json();
			const parsed = JSON.parse(data.response);
			aiProfile = {
				riskScore: Math.min(Math.max(Number(parsed.riskScore) || 0, 0), 100),
				patterns: Array.isArray(parsed.patterns) ? parsed.patterns.slice(0, 10) : [],
				recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 10) : [],
				lastUpdated: new Date().toISOString(),
			};
		}
	} catch (e) {
		console.warn('[POI Risk] Ollama unavailable, using existing profile:', (e as Error).message);
	}

	// Persist the updated profile
	await db.update(personsOfInterest)
		.set({ aiProfile, updatedAt: new Date() })
		.where(eq(personsOfInterest.id, params.id));

	return json({ success: true, aiProfile });
};
