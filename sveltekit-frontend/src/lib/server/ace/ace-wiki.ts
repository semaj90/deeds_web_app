/**
 * ace-wiki.ts — Generate wiki-style articles from ACE codebase context.
 *
 * Pipeline:
 *   1. assembleAceContext()          — pull cluster summaries + code chunks
 *   2. buildGemma4AcePrompt(ctx)     — build base codebase context section
 *   3. Compose systemPromptOverride  — base + wiki instructions on top
 *   4. callGemma4WithAceContext()    — reuse shared transport/fallback/telemetry
 *   5. parseWikiJson()               — validate + clamp JSON fields
 *   6. Heuristic fallback            — cluster summaries when LLM unavailable
 *
 * Always returns AceWikiResult — never throws.
 * Falls back gracefully at every stage.
 */
import { assembleAceContext } from './codeintel-datastore.js';
import { buildGemma4AcePrompt, callGemma4WithAceContext } from './gemma4-codeintel.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AceWikiRequest {
	query: string;
	repoId?: string;
	clusterIds?: number[];
	maxWords?: number;
	task?: 'explain' | 'troubleshoot' | 'overview' | 'deep-dive';
	useTools?: boolean;
}

export interface AceWikiSection {
	heading: string;
	content: string;
}

export interface AceWikiResult {
	ok: boolean;
	query: string;
	title: string | null;
	summary: string | null;
	sections: AceWikiSection[];
	relatedFiles: string[];
	relatedClusters: number[];
	degraded: boolean;
	errors: string[];
	latencyMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wiki JSON response schema (passed to Ollama as structured output hint)
// ─────────────────────────────────────────────────────────────────────────────

const WIKI_RESPONSE_SCHEMA: Record<string, unknown> = {
	type: 'object',
	properties: {
		title: { type: 'string' },
		summary: { type: 'string' },
		sections: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					heading: { type: 'string' },
					content: { type: 'string' },
				},
				required: ['heading', 'content'],
			},
		},
		relatedFiles: { type: 'array', items: { type: 'string' } },
		relatedClusters: { type: 'array', items: { type: 'number' } },
	},
	required: ['title', 'summary', 'sections', 'relatedFiles', 'relatedClusters'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const TASK_INSTRUCTION: Record<string, string> = {
	explain:
		'Explain the query subject clearly: what it does, why it exists, and how it fits the codebase.',
	troubleshoot:
		'Diagnose likely failure modes, common pitfalls, and debugging steps for the query subject.',
	overview:
		'Give a high-level architectural overview: key modules, data flow, and integration points.',
	'deep-dive':
		'Provide a thorough technical deep-dive: internals, edge cases, performance considerations, and risks.',
};

function buildWikiSystemPrompt(
	contextPrompt: string,
	query: string,
	maxWords: number,
	task: string,
): string {
	const instruction = TASK_INSTRUCTION[task] ?? TASK_INSTRUCTION.explain;
	return [
		contextPrompt,
		'',
		'You are generating an internal code intelligence wiki article.',
		`Task: ${instruction}`,
		`Topic: "${query}"`,
		'',
		'Return ONLY valid JSON — no markdown fences, no extra text — matching this shape:',
		'{ "title": "<concise title>", "summary": "<1-2 sentence overview>", "sections": [{ "heading": "...", "content": "..." }], "relatedFiles": ["src/..."], "relatedClusters": [0] }',
		'',
		`Constraints: 3-5 sections, each content ≤ 120 words, total body ≤ ${maxWords} words.`,
		'Only include relatedFiles and relatedClusters actually present in the context above.',
	].join('\n');
}

function parseWikiJson(raw: unknown): {
	title: string;
	summary: string;
	sections: AceWikiSection[];
	relatedFiles: string[];
	relatedClusters: number[];
} | null {
	const candidate =
		typeof raw === 'object' && raw !== null
			? raw
			: (() => {
					try {
						const text = String(raw ?? '');
						const m = text.match(/\{[\s\S]*\}/);
						return m ? JSON.parse(m[0]) : null;
					} catch {
						return null;
					}
				})();

	if (!candidate || typeof candidate !== 'object') return null;
	const obj = candidate as Record<string, unknown>;
	if (!obj.title || !obj.summary || !Array.isArray(obj.sections)) return null;

	return {
		title: String(obj.title).slice(0, 200),
		summary: String(obj.summary).slice(0, 400),
		sections: (obj.sections as Record<string, unknown>[]).slice(0, 5).map((s) => ({
			heading: String(s.heading ?? '').slice(0, 100),
			content: String(s.content ?? s.body ?? '').slice(0, 800),
		})),
		relatedFiles: Array.isArray(obj.relatedFiles)
			? (obj.relatedFiles as unknown[]).slice(0, 10).map(String)
			: [],
		relatedClusters: Array.isArray(obj.relatedClusters)
			? (obj.relatedClusters as unknown[])
					.slice(0, 10)
					.map(Number)
					.filter((n) => !isNaN(n))
			: [],
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a wiki-style article about `query` using ACE codebase context.
 * Never throws. Falls back to heuristic content from cluster summaries on any LLM failure.
 */
export async function generateAceWiki(req: AceWikiRequest): Promise<AceWikiResult> {
	const start = Date.now();
	const { query, repoId = 'default', clusterIds, maxWords = 600, task = 'explain' } = req;
	const collectedErrors: string[] = [];

	// ── Stage 1: Assemble ACE context ───────────────────────────────────────
	const ctx = await assembleAceContext(query, {
		repoId,
		clusterIds: clusterIds?.length ? clusterIds : undefined,
		limit: 10,
	});

	if (ctx.errors.length) collectedErrors.push(...ctx.errors);

	// Heuristic fallback — always computable regardless of LLM availability
	const fallbackSections: AceWikiSection[] = ctx.clusterContext.slice(0, 4).map((c) => ({
		heading: c.purpose ?? `Cluster ${c.gpuCluster}`,
		content: c.summary ?? 'No summary available for this cluster.',
	}));
	const fallbackFiles = ctx.chunkContext
		.slice(0, 8)
		.map((c) => c.relativePath ?? '')
		.filter(Boolean);
	const fallbackClusters = ctx.clusterContext.slice(0, 5).map((c) => c.gpuCluster);

	if (ctx.degraded && ctx.clusterContext.length === 0) {
		return {
			ok: false,
			query,
			title: null,
			summary: null,
			sections: [],
			relatedFiles: [],
			relatedClusters: [],
			degraded: true,
			errors: [...collectedErrors, 'Codebase context unavailable — check cluster summaries and indexing status.'],
			latencyMs: Date.now() - start,
		};
	}

	// ── Stage 2: Build system prompt override ────────────────────────────────
	const baseContextPrompt = buildGemma4AcePrompt(ctx);
	const systemPromptOverride = buildWikiSystemPrompt(baseContextPrompt, query, maxWords, task);

	// ── Stage 3: Call shared Gemma4 helper ───────────────────────────────────
	const userPrompt = `Generate a ${task} wiki article about: ${query}`;

	const llmResult = await callGemma4WithAceContext(ctx, userPrompt, {
		temperature: 0.1,
		maxTokens: 1400,
		systemPromptOverride,
		responseSchema: WIKI_RESPONSE_SCHEMA,
		lane: 'interactive-agent' as any, // Use Lane 1
		taskType: 'wiki-generation',
		useTools: req.useTools,
	});

	if (!llmResult.ok) {
		collectedErrors.push('LLM unavailable — returning heuristic wiki from cluster summaries.');
		return {
			ok: false,
			query,
			title: `${query} — Codebase Overview`,
			summary: ctx.clusterContext[0]?.summary ?? null,
			sections: fallbackSections,
			relatedFiles: fallbackFiles,
			relatedClusters: fallbackClusters,
			degraded: true,
			errors: collectedErrors,
			latencyMs: Date.now() - start,
		};
	}

	// ── Stage 4: Parse JSON ──────────────────────────────────────────────────
	const parsed = parseWikiJson(llmResult.parsed ?? llmResult.text);
	if (!parsed) {
		collectedErrors.push('LLM response could not be parsed as structured wiki.');
		return {
			ok: false,
			query,
			title: `${query} — Codebase Overview`,
			summary: llmResult.text.slice(0, 200) || null,
			sections: fallbackSections,
			relatedFiles: fallbackFiles,
			relatedClusters: fallbackClusters,
			degraded: true,
			errors: collectedErrors,
			latencyMs: Date.now() - start,
		};
	}

	return {
		ok: true,
		query,
		...parsed,
		degraded: ctx.degraded,
		errors: collectedErrors,
		latencyMs: Date.now() - start,
	};
}
