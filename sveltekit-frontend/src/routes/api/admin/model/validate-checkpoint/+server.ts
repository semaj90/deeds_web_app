/**
 * POST /api/admin/model/validate-checkpoint
 *
 * Quality gate before swapping a QLoRA-trained checkpoint into production.
 *
 * Runs canonical legal test queries through both the candidate model and the
 * current baseline, self-evals each response, then returns a pass/fail verdict.
 *
 * Body:
 *   model         string   — candidate Ollama model name (e.g. "gemma4-legal-v2:latest")
 *   baseline?     string   — baseline model (default: gemma4-legal:latest)
 *   testQueries?  string[] — override the default probe set (max 10)
 *   minDelta?     number   — minimum avg score improvement required to pass (default 0.02)
 *   timeoutMs?    number   — per-query timeout in ms (default 30000)
 *
 * Response:
 *   { verdict: 'pass'|'fail'|'degraded', model, baseline, delta, results[] }
 *
 * GET /api/admin/model/validate-checkpoint?model=<name>
 *   Returns the last cached validation result for that model (1h TTL).
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { bifrostChat, listAvailableModels } from '$lib/server/ollama.js';
import { getRedis } from '$lib/server/redis.js';

// ── Default probe queries ──────────────────────────────────────────────────

const DEFAULT_PROBES = [
	'What is the hearsay rule and its main exceptions under the Federal Rules of Evidence?',
	'Explain the elements required to establish negligence in a personal injury case.',
	'What is the difference between a motion to dismiss and a motion for summary judgment?',
	'Under Brady v. Maryland, what must a prosecutor disclose to the defense?',
	'What constitutes ineffective assistance of counsel under Strickland v. Washington?',
];

// ── Schema ─────────────────────────────────────────────────────────────────

const bodySchema = z.object({
	model:       z.string().min(1).max(200),
	baseline:    z.string().max(200).default('gemma4-legal:latest'),
	testQueries: z.array(z.string().max(500)).max(10).optional(),
	minDelta:    z.number().min(-1).max(1).default(0.02),
	timeoutMs:   z.number().int().min(5000).max(120000).default(30000),
});

// ── Self-eval scorer ───────────────────────────────────────────────────────

const EVAL_SYSTEM = `You are a legal AI quality evaluator. Given a legal question and an AI response,
score the response from 0.0 to 1.0 on accuracy, completeness, and clarity.
Return ONLY a JSON object: {"score": <number 0.0-1.0>, "issues": ["..."]}
No explanation outside the JSON.`;

async function scoreResponse(
	question: string,
	response: string,
	evalModel: string,
	timeoutMs: number,
): Promise<{ score: number; issues: string[] }> {
	try {
		const evalPrompt = `Question: ${question}\n\nAI Response:\n${response.slice(0, 2000)}`;
		const raw = await Promise.race<string>([
			bifrostChat(
				[
					{ role: 'system', content: EVAL_SYSTEM },
					{ role: 'user', content: evalPrompt },
				],
				evalModel,
				{ temperature: 0.1, maxTokens: 200, cacheKey: 'qlora-eval' },
			),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('eval timeout')), timeoutMs),
			),
		]);

		const match = raw.match(/\{[\s\S]*?\}/);
		if (match) {
			const parsed = JSON.parse(match[0]) as { score?: number; issues?: string[] };
			return {
				score:  Math.max(0, Math.min(1, Number(parsed.score ?? 0))),
				issues: Array.isArray(parsed.issues) ? parsed.issues : [],
			};
		}
	} catch { /* non-fatal — return 0 */ }
	return { score: 0, issues: ['eval failed'] };
}

async function runProbe(
	query: string,
	model: string,
	evalModel: string,
	timeoutMs: number,
): Promise<{ score: number; issues: string[]; ms: number }> {
	const t0 = Date.now();
	try {
		const resp = await Promise.race<string>([
			bifrostChat(
				[
					{ role: 'system', content: 'You are a legal AI assistant. Answer accurately and concisely.' },
					{ role: 'user', content: query },
				],
				model,
				{ temperature: 0.2, maxTokens: 512, cacheKey: `qlora-probe-${model}` },
			),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('probe timeout')), timeoutMs),
			),
		]);
		const scored = await scoreResponse(query, resp, evalModel, timeoutMs);
		return { ...scored, ms: Date.now() - t0 };
	} catch {
		return { score: 0, issues: ['inference failed'], ms: Date.now() - t0 };
	}
}

// ── POST — run validation ──────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw    = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { model, baseline, testQueries, minDelta, timeoutMs } = parsed.data;
	const probes = (testQueries?.length ? testQueries : DEFAULT_PROBES).slice(0, 10);

	// Verify candidate model is available in Ollama
	const available = await listAvailableModels().catch(() => [] as string[]);
	if (available.length > 0 && !available.includes(model)) {
		return json({
			error:     `Model "${model}" not found in Ollama. Available: ${available.join(', ')}`,
			available,
		}, { status: 422 });
	}

	// Run all probes concurrently against both models
	interface QueryResult {
		query:           string;
		candidateScore:  number;
		baselineScore:   number;
		delta:           number;
		candidateIssues: string[];
		baselineIssues:  string[];
		candidateMs:     number;
		baselineMs:      number;
	}

	const results: QueryResult[] = await Promise.all(
		probes.map(async (query): Promise<QueryResult> => {
			const [candidate, base] = await Promise.all([
				runProbe(query, model,    baseline, timeoutMs),
				runProbe(query, baseline, baseline, timeoutMs),
			]);
			return {
				query,
				candidateScore:  candidate.score,
				baselineScore:   base.score,
				delta:           candidate.score - base.score,
				candidateIssues: candidate.issues,
				baselineIssues:  base.issues,
				candidateMs:     candidate.ms,
				baselineMs:      base.ms,
			};
		}),
	);

	// Aggregate
	const avgCandidate = results.reduce((s, r) => s + r.candidateScore, 0) / results.length;
	const avgBaseline  = results.reduce((s, r) => s + r.baselineScore,  0) / results.length;
	const avgDelta     = avgCandidate - avgBaseline;
	const regressions  = results.filter((r) => r.delta < -0.05).length;
	const improvements = results.filter((r) => r.delta >  0.05).length;

	let verdict: 'pass' | 'fail' | 'degraded';
	if (avgDelta >= minDelta && regressions <= 1) {
		verdict = 'pass';
	} else if (regressions > 2 || avgDelta < -0.05) {
		verdict = 'fail';
	} else {
		verdict = 'degraded';
	}

	const report = {
		verdict,
		model,
		baseline,
		avgCandidate: +avgCandidate.toFixed(4),
		avgBaseline:  +avgBaseline.toFixed(4),
		delta:        +avgDelta.toFixed(4),
		improvements,
		regressions,
		results,
		validatedAt: new Date().toISOString(),
		validatedBy: locals.user.id as string,
	};

	// Cache for 1h audit trail
	const cacheKey = `qlora:validation:${model.replace(/[^a-z0-9]/gi, '_')}`;
	getRedis().set(cacheKey, JSON.stringify(report), 'EX', 3600).catch(() => {});

	return json(report, { status: verdict === 'fail' ? 422 : 200 });
};

// ── GET — retrieve last cached validation result ───────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const model = url.searchParams.get('model');
	if (!model) return json({ error: 'model param required' }, { status: 400 });

	const cacheKey = `qlora:validation:${model.replace(/[^a-z0-9]/gi, '_')}`;
	try {
		const cached = await getRedis().get(cacheKey);
		if (cached) return json(JSON.parse(cached) as object);
	} catch { /* fall through */ }

	return json({ error: 'No validation result cached for this model' }, { status: 404 });
};
