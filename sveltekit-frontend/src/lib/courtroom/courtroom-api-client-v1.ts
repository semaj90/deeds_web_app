import { z } from 'zod';
import { planCall, type CallPlan, type PlanOptions } from './courtroom-api-allowlist-v1';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ApiResult<T> =
	| { ok: true; data: T }
	| { ok: false; reason: 'REFUSED'; plan: Extract<CallPlan, { ok: false }> }
	| { ok: false; reason: 'BAD_REQUEST'; issues: string[] }
	| { ok: false; reason: 'HTTP'; status: number }
	| { ok: false; reason: 'NETWORK'; message: string }
	| { ok: false; reason: 'BAD_RESPONSE' };

/** Mirrors `evidenceSearchSchema` in POST /api/evidence/search (query 1..5000, caseId uuid, limit 1..100). */
const searchRequest = z.object({
	query: z.string().min(1).max(5000),
	caseId: z.string().uuid().optional(),
	limit: z.number().int().min(1).max(100).optional()
});
export type EvidenceSearchRequest = z.infer<typeof searchRequest>;

/** The registry lists tools by name; the client only needs a stable, validated subset. */
const toolList = z.object({
	tools: z.array(z.object({ name: z.string(), description: z.string().optional(), category: z.string().optional() }))
});
export type RegistryTool = z.infer<typeof toolList>['tools'][number];

/**
 * Legal-AI calls for the courtroom. Every call goes through `planCall` first, so a route that is not on the allowlist,
 * or a write without approval, never reaches `fetch`. Reads in the local preview are allowed; writes are not.
 */
export function createCourtroomApi(fetchImpl: FetchLike, opts: PlanOptions = {}) {
	async function send(id: string, init: RequestInit = {}, query = ''): Promise<ApiResult<unknown>> {
		const plan = planCall(id, opts);
		if ('reason' in plan) return { ok: false, reason: 'REFUSED', plan };
		let res: Response;
		try {
			res = await fetchImpl(plan.path + query, {
				method: plan.method,
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				...init
			});
		} catch (e) {
			return { ok: false, reason: 'NETWORK', message: e instanceof Error ? e.message : String(e) };
		}
		if (!res.ok) return { ok: false, reason: 'HTTP', status: res.status };
		try {
			return { ok: true, data: await res.json() };
		} catch {
			return { ok: false, reason: 'BAD_RESPONSE' };
		}
	}

	return {
		/** GET /api/acp/tools — discovery only, never authorization. */
		async listTools(queryHint?: string): Promise<ApiResult<RegistryTool[]>> {
			const r = await send('registry.tools', {}, queryHint ? `?queryHint=${encodeURIComponent(queryHint.slice(0, 500))}` : '');
			if ('reason' in r) return r;
			const parsed = toolList.safeParse(r.data);
			return parsed.success ? { ok: true, data: parsed.data.tools } : { ok: false, reason: 'BAD_RESPONSE' };
		},

		/** POST /api/evidence/search — read-only retrieval. The response shape is passed through for the caller to validate. */
		async searchEvidence(request: EvidenceSearchRequest): Promise<ApiResult<unknown>> {
			const parsed = searchRequest.safeParse(request);
			if (!parsed.success) return { ok: false, reason: 'BAD_REQUEST', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
			return send('evidence.search', { body: JSON.stringify(parsed.data) });
		}
	};
}
