import { planCall, type CallPlan } from './courtroom-api-allowlist-v1';

/** Mirrors the zod fields of POST /api/evidence/video/ingest (caseId uuid, title<=256, description<=10000, sourceUrl url). */
export interface VideoIngestDraft {
	caseId: string;
	title?: string;
	description?: string;
	sourceUrl?: string;
	fileName?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VideoDryRun {
	sent: false;
	plan: CallPlan;
	problems: string[];
	fields: string[];
}

/** Validate a draft and report what would be sent. Never calls fetch. */
export function dryRunVideoIngest(draft: VideoIngestDraft, approvedWrites = false): VideoDryRun {
	const problems: string[] = [];
	if (!UUID_RE.test(draft.caseId)) problems.push('caseId must be a uuid');
	if ((draft.title?.length ?? 0) > 256) problems.push('title over 256 characters');
	if ((draft.description?.length ?? 0) > 10_000) problems.push('description over 10000 characters');
	if (draft.sourceUrl) {
		try {
			new URL(draft.sourceUrl);
		} catch {
			problems.push('sourceUrl is not a url');
		}
	}
	if (!draft.sourceUrl && !draft.fileName) problems.push('needs a sourceUrl or a file');
	const fields = ['caseId', 'title', 'description', 'sourceUrl', 'fileName'].filter(
		(k) => (draft as unknown as Record<string, unknown>)[k] !== undefined
	);
	return { sent: false, plan: planCall('video.ingest', { approvedWrites }), problems, fields };
}
