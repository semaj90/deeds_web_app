// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
	IntentResultSchema,
	OperatorChainStepSchema,
	routeIntent,
	executeChain,
} from '$lib/server/ai/intent-router.js';
import { inferIntent } from '$lib/intent/regex-intent.js';

const ctx = { userId: 1, sessionId: 'sess-test' } as const;

describe('routeIntent — chain mapping (design §2.1)', () => {
	it('legal_research → kag.multi_lane_search → kb.search_summary_tree → kag.feature_lookup', () => {
		const r = routeIntent(inferIntent('search case law for hearsay precedent'), 'q', ctx);
		expect(r.fallback).toBe(false);
		expect(r.chain.map((s) => s.tool)).toEqual([
			'kag.multi_lane_search',
			'kb.search_summary_tree',
			'kag.feature_lookup',
		]);
	});

	it('graph_search → graph.expand_neighborhood → graph.shortest_path (with takeFrom)', () => {
		const r = routeIntent(
			inferIntent('expand the neighborhood of this node in the graph'),
			'q',
			ctx
		);
		expect(r.fallback).toBe(false);
		expect(r.chain.map((s) => s.tool)).toEqual([
			'graph.expand_neighborhood',
			'graph.shortest_path',
		]);
		// Second step pipes prior result in
		expect(r.chain[1].takeFrom).toBe(0);
	});

	it('gpu_rerank → search.rerank (single step)', () => {
		const r = routeIntent(
			inferIntent('rerank these by the attention score'),
			'q',
			ctx
		);
		expect(r.chain.map((s) => s.tool)).toEqual(['search.rerank']);
	});

	it('evidence_upload → kb.search_notecards', () => {
		const r = routeIntent(inferIntent('upload the pdf evidence and hash it'), 'q', ctx);
		expect(r.chain.map((s) => s.tool)).toEqual(['kb.search_notecards']);
	});

	it('schema_drift → kb.search_summary_tree', () => {
		const r = routeIntent(inferIntent('schema drift in the column types'), 'q', ctx);
		expect(r.chain.map((s) => s.tool)).toEqual(['kb.search_summary_tree']);
	});

	it('ui_bug → search.dev_context (passes filePath when present)', () => {
		const r = routeIntent(
			inferIntent('the button click is broken in the modal'),
			'q',
			{ ...ctx, filePath: 'src/lib/components/X.svelte' }
		);
		expect(r.chain.map((s) => s.tool)).toEqual(['search.dev_context']);
		expect(r.chain[0].args.filePath).toBe('src/lib/components/X.svelte');
	});
});

describe('routeIntent — fallback contract', () => {
	it('falls back to kag.multi_lane_search when intent is unknown', () => {
		const r = routeIntent(inferIntent('hello there'), 'q', ctx);
		expect(r.fallback).toBe(true);
		expect(r.chain.map((s) => s.tool)).toEqual(['kag.multi_lane_search']);
		expect(r.reason).toContain('fallback');
	});

	it('falls back when confidence is below 0.5', () => {
		const r = routeIntent(inferIntent('attach this'), 'q', ctx); // 0.3 → fallback
		expect(r.fallback).toBe(true);
		expect(r.chain[0].tool).toBe('kag.multi_lane_search');
	});

	it('reason field is a one-liner audit trail', () => {
		const r = routeIntent(inferIntent('upload the pdf evidence'), 'q', ctx);
		expect(typeof r.reason).toBe('string');
		expect(r.reason.length).toBeLessThan(200);
		expect(r.reason).toContain('evidence_upload');
	});

	it('propagates caseId into args', () => {
		const r = routeIntent(
			inferIntent('search case law for hearsay precedent'),
			'q',
			{ ...ctx, caseId: '11111111-1111-1111-1111-111111111111' }
		);
		expect(r.chain[0].args.caseId).toBe('11111111-1111-1111-1111-111111111111');
	});

	it('validates chain steps with Zod', () => {
		expect(() => OperatorChainStepSchema.parse({ tool: 'x', args: {}, takeFrom: -1 })).toThrow();
		expect(OperatorChainStepSchema.parse({ tool: 'x', args: {}, takeFrom: 0 })).toBeTruthy();
		expect(
			IntentResultSchema.parse({
				label: 'graph_search',
				confidence: 0.8,
				keywords: ['graph'],
				fallback: false,
				alternates: [],
			})
		).toBeTruthy();
	});
});

describe('executeChain — partial results contract', () => {
	it('walks the chain in order and records per-step trace', async () => {
		const calls: string[] = [];
		const fakeCall = vi.fn(async (tool: string) => {
			calls.push(tool);
			return { data: { hit: tool }, ms: 5, ok: true } as any;
		});

		const decision = routeIntent(
			inferIntent('search case law for hearsay precedent'),
			'q',
			ctx
		);
		const exec = await executeChain(decision, ctx, { callTool: fakeCall as any });

		expect(calls).toEqual([
			'kag.multi_lane_search',
			'kb.search_summary_tree',
			'kag.feature_lookup',
		]);
		expect(exec.trace).toHaveLength(3);
		expect(exec.trace.every((t) => t.ok)).toBe(true);
		expect(exec.result).toEqual({ hit: 'kag.feature_lookup' });
	});

	it('pipes prior result into args when takeFrom is set', async () => {
		const seenArgs: any[] = [];
		const fakeCall = vi.fn(async (_tool: string, args: any) => {
			seenArgs.push(args);
			return { data: { ids: ['x', 'y'] }, ms: 5, ok: true } as any;
		});

		const decision = routeIntent(
			inferIntent('expand the neighborhood of this node in the graph'),
			'q',
			ctx
		);
		await executeChain(decision, ctx, { callTool: fakeCall as any });

		// Step 0: no priorResult yet
		expect(seenArgs[0].priorResult).toBeUndefined();
		// Step 1: takeFrom: 0 → priorResult should be step 0's data
		expect(seenArgs[1].priorResult).toEqual({ ids: ['x', 'y'] });
	});

	it('continues after a failed step (partial-results contract)', async () => {
		let callCount = 0;
		const fakeCall = vi.fn(async (tool: string) => {
			callCount++;
			if (callCount === 2) {
				return { data: null, ms: 5, ok: false, error: 'simulated timeout' } as any;
			}
			return { data: { hit: tool }, ms: 5, ok: true } as any;
		});

		const decision = routeIntent(
			inferIntent('search case law for hearsay precedent'),
			'q',
			ctx
		);
		const exec = await executeChain(decision, ctx, { callTool: fakeCall as any });

		expect(exec.trace).toHaveLength(3); // ALL three steps still recorded
		expect(exec.trace[0].ok).toBe(true);
		expect(exec.trace[1].ok).toBe(false);
		expect(exec.trace[1].error).toBe('simulated timeout');
		expect(exec.trace[2].ok).toBe(true);
	});

	it('returns last step result even if that step failed', async () => {
		const fakeCall = vi.fn(async () => ({
			data:  null,
			ms:    5,
			ok:    false,
			error: 'unreachable',
		} as any));

		const decision = routeIntent(inferIntent('rerank by attention'), 'q', ctx);
		const exec = await executeChain(decision, ctx, { callTool: fakeCall as any });

		expect(exec.result).toBe(null);
		expect(exec.trace[0].ok).toBe(false);
	});
});
