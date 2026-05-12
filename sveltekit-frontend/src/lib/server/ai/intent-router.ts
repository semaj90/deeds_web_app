/**
 * Intent → MCP operator chain router.
 *
 * Phase B of the 2026-05-10 service-worker + regex-tool-router design
 * (next_steps/active/2026-05-10_service-worker-regex-tool-router.md §2.3).
 *
 * - `routeIntent()` is a pure function: intent + text + ctx → RouterDecision.
 *   No I/O. Easy to unit-test.
 * - `executeChain()` walks the chain over HTTP to TRACE MCP :8788 via the
 *   `callTraceMcp()` helper, with per-step AbortSignal deadlines and a
 *   partial-result contract so one failed step doesn't kill the whole loop.
 *
 * The chain mapping is the design doc §2.1 verbatim. No tool names are
 * invented — every entry exists in the 88-tool registry verified 2026-05-10.
 */

import type { IntentLabel, IntentResult } from '$lib/intent/regex-intent.js';
import { callTraceMcp } from '$lib/server/mcp/trace-http.js';
import { z } from 'zod';

const INTENT_LABELS = [
	'evidence_upload',
	'schema_drift',
	'graph_search',
	'gpu_rerank',
	'ui_bug',
	'legal_research',
] as const;

export const IntentLabelSchema = z.enum(INTENT_LABELS);

export const IntentResultSchema = z.object({
	label: z.union([IntentLabelSchema, z.literal('unknown')]),
	confidence: z.number().min(0).max(1),
	keywords: z.array(z.string()),
	fallback: z.boolean(),
	alternates: z.array(z.object({
		label: IntentLabelSchema,
		confidence: z.number().min(0).max(1),
	})).default([]),
});

export interface RouterContext {
	userId:       number;
	sessionId:    string;
	caseId?:      string;
	filePath?:    string;
	parentTaskId?: string;
	runId?:        string;
}

export interface OperatorChainStep {
	tool:      string;
	args:      Record<string, unknown>;
	/**
	 * 0-indexed: when set, the previous step's `result.data` is merged into this
	 * step's `args` under the `priorResult` key. Designed for two-step chains
	 * (e.g. graph.expand_neighborhood → graph.shortest_path).
	 */
	takeFrom?: number;
}

export const OperatorChainStepSchema = z.object({
	tool: z.string().min(1),
	args: z.record(z.string(), z.unknown()),
	takeFrom: z.number().int().min(0).optional(),
});

export interface RouterDecision {
	intent:   IntentResult;
	chain:    OperatorChainStep[];
	fallback: boolean;
	/** One-line audit trail. Lands in context_timeline as `payload.reason`. */
	reason:   string;
}

export const RouterDecisionSchema = z.object({
	intent: IntentResultSchema,
	chain: z.array(OperatorChainStepSchema).min(1),
	fallback: z.boolean(),
	reason: z.string().min(1),
});

export interface ChainStepTrace {
	tool:  string;
	ms:    number;
	ok:    boolean;
	error?: string;
}

export interface ChainExecution {
	/** Final result is the LAST step's data (whether ok or not). */
	result: unknown;
	trace:  ChainStepTrace[];
}

// ── Chain mapping (design doc §2.1) ───────────────────────────────────────────

const DEFAULT_LIMIT = 10;

function chainFor(label: IntentLabel, text: string, ctx: RouterContext): OperatorChainStep[] {
	const baseArgs = { query: text, limit: DEFAULT_LIMIT, caseId: ctx.caseId };

	switch (label) {
		case 'legal_research':
			return [
				{ tool: 'kag.multi_lane_search', args: baseArgs },
				{ tool: 'kb.search_summary_tree', args: baseArgs },
				{ tool: 'kag.feature_lookup', args: { query: text } },
			];

		case 'graph_search':
			return [
				{ tool: 'graph.expand_neighborhood', args: { query: text, depth: 1, limit: DEFAULT_LIMIT } },
				{ tool: 'graph.shortest_path', args: { query: text }, takeFrom: 0 },
			];

		case 'gpu_rerank':
			return [{ tool: 'search.rerank', args: baseArgs }];

		case 'evidence_upload':
			return [{ tool: 'kb.search_notecards', args: baseArgs }];

		case 'schema_drift':
			return [{ tool: 'kb.search_summary_tree', args: baseArgs }];

		case 'ui_bug':
			return [{ tool: 'search.dev_context', args: { query: text, filePath: ctx.filePath } }];
	}

	return [];
}

/**
 * Build a chain from an inferred intent + free-form text + caller context.
 *
 * Falls back to `kag.multi_lane_search` (the canonical hybrid retrieval) when
 * confidence is below the 0.5 floor or label is 'unknown'.
 */
export function routeIntent(
	intent: IntentResult,
	text:   string,
	ctx:    RouterContext
): RouterDecision {
	// Note: Zod schemas (RouterDecisionSchema / OperatorChainStepSchema) remain
	// exported for external boundary validation. We don't `.parse()` here on the
	// return because the schema's `.label` infers as optional (union widens it),
	// which mismatches the required `IntentResult.label`. Inputs are already typed,
	// so the literal return is the source of truth.
	if (intent.fallback || intent.label === 'unknown') {
		return {
			intent,
			chain: [
				{
					tool: 'kag.multi_lane_search',
					args: { query: text, limit: DEFAULT_LIMIT, caseId: ctx.caseId },
				},
			],
			fallback: true,
			reason:   `fallback (label=${intent.label}, confidence=${intent.confidence.toFixed(2)})`,
		};
	}

	const chain = chainFor(intent.label, text, ctx);
	return {
		intent,
		chain,
		fallback: false,
		reason:   `routed label=${intent.label} → ${chain.map((s) => s.tool).join(' → ')}`,
	};
}

// ── Chain executor ───────────────────────────────────────────────────────────

export interface ExecuteChainOptions {
	/** Per-step deadline (default 8s — design §2.5 partial-results contract). */
	stepTimeoutMs?: number;
	/** Injection point for tests. */
	callTool?: typeof callTraceMcp;
	/** Traceability IDs for sub-agent loops */
	parentTaskId?: string;
	runId?:        string;
}

/**
 * Walk a RouterDecision's chain over HTTP. Per-step deadline, partial-results
 * on failure. Returns the final step's data (whether ok or not).
 */
export async function executeChain(
	decision: RouterDecision,
	_ctx:     RouterContext,
	options:  ExecuteChainOptions = {}
): Promise<ChainExecution> {
	const stepTimeoutMs = options.stepTimeoutMs ?? 8_000;
	const callTool      = options.callTool ?? callTraceMcp;

	const trace: ChainStepTrace[] = [];
	const results: unknown[] = [];

	for (let i = 0; i < decision.chain.length; i++) {
		const step = decision.chain[i];

		// Merge the referenced prior result under `priorResult` when requested.
		let args = step.args;
		if (step.takeFrom !== undefined) {
			args = { ...step.args, priorResult: results[step.takeFrom] ?? null };
		}

		// Merge traceability context if present
		const callArgs = {
			...args,
			parentTaskId: options.parentTaskId,
			runId:        options.runId,
		};

		const r = await callTool(step.tool, callArgs, { timeoutMs: stepTimeoutMs });

		trace.push({ tool: step.tool, ms: r.ms, ok: r.ok, error: r.error });
		results[i] = r.data;

		// If a step fails, do NOT abort the loop — record the trace and continue
		// so the user gets a partial result. This matches the design doc's
		// "showing partial results" badge contract (§2.5).
		// Exception: if the failed step had takeFrom on the next step, that next
		// step would receive `priorResult: null` — still fires, just with weaker input.
	}

	return { result: results[results.length - 1] ?? null, trace };
}
