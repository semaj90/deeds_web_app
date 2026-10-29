/**
 * Legal-AI API operations the courtroom simulation may call. Every route below
 * was checked against `src/routes/api/**` (method exported, path exists). The
 * ACP registry (`GET /api/acp/tools`) is a discovery list, never authorization:
 * a call is allowed only if it is on this list.
 */

export type ApiPurpose = 'registry' | 'evidence-analysis' | 'video-analysis' | 'upload' | 'progress' | 'sharing';

export interface ApiOperation {
	id: string;
	method: 'GET' | 'POST';
	path: string;
	purpose: ApiPurpose;
	/** True when the route writes records (DB, object store); such calls need explicit approval. */
	writes: boolean;
	/** Incidental side effects of a call that is otherwise a read (checked in the route source). */
	note?: string;
}

export const COURTROOM_API_ALLOWLIST: readonly ApiOperation[] = [
	{ id: 'registry.tools', method: 'GET', path: '/api/acp/tools', purpose: 'registry', writes: false },
	{
		id: 'evidence.search',
		method: 'POST',
		path: '/api/evidence/search',
		purpose: 'evidence-analysis',
		writes: false,
		note: 'Reads case evidence but the route also records search analytics and writes a vector cache entry. Fine for a user-initiated search; do not call it from automated probes.'
	},
	{ id: 'evidence.analyze', method: 'POST', path: '/api/evidence/analyze', purpose: 'evidence-analysis', writes: true },
	{ id: 'evidence.progress', method: 'GET', path: '/api/evidence/realtime', purpose: 'progress', writes: false },
	{ id: 'evidence.upload', method: 'POST', path: '/api/evidence/upload', purpose: 'upload', writes: true },
	{ id: 'video.ingest', method: 'POST', path: '/api/evidence/video/ingest', purpose: 'video-analysis', writes: true },
	{ id: 'courtroom.dialogue', method: 'POST', path: '/api/courtroom/dialogue', purpose: 'sharing', writes: false }
];

export type CallRefusalReason = 'NOT_ALLOWLISTED' | 'WRITE_NEEDS_APPROVAL' | 'LOCAL_PREVIEW_NO_WRITES';

export type CallPlan =
	| { ok: true; operation: ApiOperation; method: string; path: string }
	| { ok: false; reason: CallRefusalReason; id: string };

export interface PlanOptions {
	/** The operator explicitly approved writes for this call. A bare "yes" upstream is not approval. */
	approvedWrites?: boolean;
	/** The local story preview creates no server records. */
	localPreview?: boolean;
}

export function planCall(id: string, opts: PlanOptions = {}): CallPlan {
	const operation = COURTROOM_API_ALLOWLIST.find((o) => o.id === id);
	if (!operation) return { ok: false, reason: 'NOT_ALLOWLISTED', id };
	if (operation.writes && opts.localPreview) return { ok: false, reason: 'LOCAL_PREVIEW_NO_WRITES', id };
	if (operation.writes && !opts.approvedWrites) return { ok: false, reason: 'WRITE_NEEDS_APPROVAL', id };
	return { ok: true, operation, method: operation.method, path: operation.path };
}

export interface RegistryDrift {
	/** Allowlist entries whose path no longer appears in the route inventory. */
	missing: string[];
}

/** Compare the allowlist with an indexed route inventory (paths as `/api/...`). */
export function checkAgainstRouteInventory(paths: Iterable<string>): RegistryDrift {
	const known = new Set(paths);
	return { missing: COURTROOM_API_ALLOWLIST.filter((o) => !known.has(o.path)).map((o) => o.id) };
}

export function operationsFor(purpose: ApiPurpose): ApiOperation[] {
	return COURTROOM_API_ALLOWLIST.filter((o) => o.purpose === purpose);
}
