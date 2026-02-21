import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { evidence, cases } from '$lib/server/db/schema-postgres.js';
import { desc, eq, sql, count } from 'drizzle-orm';
import { getOllamaUrl } from '$lib/config/env.server.js';
import type { Actions, PageServerLoad } from './$types.js';

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user?.id;

	// Load real evidence items + case stats from DB
	const [recentEvidence, caseStats, evidenceStats] = await Promise.all([
		safe(
			db
				.select({
					id: evidence.id,
					title: evidence.title,
					evidenceType: evidence.evidenceType,
					description: evidence.description,
					caseId: evidence.caseId,
					createdAt: evidence.createdAt
				})
				.from(evidence)
				.orderBy(desc(evidence.createdAt))
				.limit(20),
			[]
		),
		safe(
			db
				.select({
					total: count(),
					open: count(sql`CASE WHEN ${cases.status} = 'open' THEN 1 END`),
					closed: count(sql`CASE WHEN ${cases.status} = 'closed' THEN 1 END`)
				})
				.from(cases)
				.then((r) => r[0] ?? { total: 0, open: 0, closed: 0 }),
			{ total: 0, open: 0, closed: 0 }
		),
		safe(
			db
				.select({ total: count() })
				.from(evidence)
				.then((r) => r[0]?.total ?? 0),
			0
		)
	]);

	return {
		recentEvidence,
		caseStats,
		evidenceCount: evidenceStats,
		timestamp: new Date().toISOString()
	};
};

export const actions: Actions = {
	// Semantic evidence search via RAG+KAG+DAG pipeline
	search: async ({ request, url, locals }) => {
		const data = await request.formData();
		const query = String(data.get('query') ?? '').trim();
		const mode = String(data.get('mode') ?? 'pattern');
		const caseId = String(data.get('caseId') ?? '');

		if (!query) {
			return fail(400, { searchError: 'Query cannot be empty' });
		}

		try {
			const origin = url.origin;
			const res = await fetch(`${origin}/api/evidence/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					caseId: caseId || undefined,
					limit: 10,
					expandSections: mode === 'correlation',
					jurisdiction: undefined
				})
			});

			if (!res.ok) {
				throw new Error(`Evidence search failed: ${res.status}`);
			}

			const searchResult = await res.json();
			return {
				searchResults: searchResult.results ?? [],
				bundles: searchResult.bundles ?? [],
				timing: searchResult.timing ?? {},
				query,
				mode
			};
		} catch (error) {
			console.error('Evidence search error:', error);
			return fail(500, {
				searchError: 'Search unavailable — ensure Ollama and Qdrant are running.'
			});
		}
	},

	// AI-powered analysis using RAG answer pipeline
	analyze: async ({ request, url }) => {
		const data = await request.formData();
		const query = String(data.get('query') ?? '').trim();
		const mode = String(data.get('mode') ?? 'pattern');

		if (!query) {
			return fail(400, { analysisError: 'Query cannot be empty' });
		}

		try {
			const ollamaUrl = getOllamaUrl();
			const systemPrompts: Record<string, string> = {
				pattern:
					'Analyze the following legal evidence for patterns. Identify recurring themes, behavioral patterns, temporal sequences, and anomalies. Be specific and cite evidence types.',
				correlation:
					'Analyze correlations between evidence items. Find connections, shared entities, temporal overlaps, geographic links, and causal chains. Rate connection strength.',
				prediction:
					'Based on the evidence patterns, provide predictive analysis. Identify likely next events, risk assessments, and recommended investigative priorities. Include confidence levels.'
			};

			const prompt = `${systemPrompts[mode] ?? systemPrompts.pattern}\n\nQuery: ${query}\n\nProvide structured analysis in this format:\n1. Key Findings (bullet points)\n2. Confidence Level (high/medium/low with percentage)\n3. Recommended Actions\n4. Related Evidence Types to investigate`;

			const res = await fetch(`${ollamaUrl}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma3-legal:latest',
					prompt,
					stream: false,
					options: { num_predict: 2048, temperature: 0.3 }
				}),
				signal: AbortSignal.timeout(30_000)
			});

			if (!res.ok) {
				throw new Error(`Ollama error: ${res.status}`);
			}

			const result = (await res.json()) as { response?: string };
			const analysisText = result.response ?? '';

			// Extract confidence from response text
			const confMatch = analysisText.match(/(\d{1,3})%/);
			const confidence = confMatch ? parseInt(confMatch[1]) / 100 : 0.75;

			return {
				analysis: {
					id: `A${Date.now()}`,
					query,
					mode,
					result: analysisText,
					confidence: Math.min(confidence, 0.99),
					timestamp: new Date().toISOString()
				}
			};
		} catch (error) {
			console.error('AI analysis error:', error);
			return fail(500, {
				analysisError:
					'AI analysis unavailable — Ollama may be offline. Try again later.'
			});
		}
	}
};