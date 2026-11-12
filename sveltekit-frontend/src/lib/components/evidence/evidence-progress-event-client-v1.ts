export interface EvidenceProgressEventEnvelopeV1 {
	eventId: string;
	jobId: string;
	evidenceId: string;
	caseId: string;
	stage: string;
	status: 'queued' | 'running' | 'completed' | 'failed';
	sourceRevision: string;
	progress: number;
}

export type EvidenceProgressEventAdmissionV1 =
	| { accepted: true; sequence: bigint; envelope: EvidenceProgressEventEnvelopeV1 }
	| { accepted: false; reason: 'invalid_cursor' | 'duplicate_or_old' | 'invalid_envelope' };

export type EvidenceProgressControlCodeV1 =
	| 'SOURCE_REVISION_UNAVAILABLE'
	| 'PROGRESS_READ_UNAVAILABLE'
	| 'AUTHORIZATION_REVOKED'
	| 'EVENT_HISTORY_GAP';

const EVENT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_REVISION_RE = /^sha256:[a-f0-9]{64}$/;
const MAX_EVENT_SEQUENCE = 9_223_372_036_854_775_807n;
const ALLOWED_STATUSES = new Set(['queued', 'running', 'completed', 'failed']);
const UUID_RE = EVENT_UUID_RE;

/** Build the case-authorized progress URL, including a bounded explicit replay cursor. */
export function caseEvidenceProgressEventUrlV1(caseId: string, jobId: string, after?: bigint): string {
	if (!UUID_RE.test(caseId) || !UUID_RE.test(jobId)) throw new TypeError('Invalid case or job identity');
	if (after !== undefined && (after < 0n || after > MAX_EVENT_SEQUENCE)) {
		throw new RangeError('Invalid evidence progress cursor');
	}
	const path = `/api/cases/${encodeURIComponent(caseId)}/evidence/jobs/${encodeURIComponent(jobId)}/events`;
	return after !== undefined && after > 0n ? `${path}?after=${after}` : path;
}

/** Admit only the small, redacted terminal-control vocabulary emitted by the case SSE route. */
export function parseEvidenceProgressControlCodeV1(eventName: string, data: unknown): EvidenceProgressControlCodeV1 | null {
	if (typeof data === 'string') {
		try { data = JSON.parse(data); } catch { return null; }
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
	const code = (data as { code?: unknown }).code;
	if (eventName === 'stream-error' && (code === 'SOURCE_REVISION_UNAVAILABLE' || code === 'PROGRESS_READ_UNAVAILABLE')) {
		return code;
	}
	if (eventName === 'stream-ended' && (code === 'AUTHORIZATION_REVOKED' || code === 'EVENT_HISTORY_GAP')) {
		return code;
	}
	return null;
}

/** Validate and deduplicate a source-qualified SSE frame before UI state changes. */
export function admitEvidenceProgressEventV1(input: {
	lastEventId: string;
	data: unknown;
	jobId: string;
	caseId: string;
	lastSequence: bigint;
}): EvidenceProgressEventAdmissionV1 {
	if (!/^\d{1,19}$/.test(input.lastEventId)) return { accepted: false, reason: 'invalid_cursor' };

	let sequence: bigint;
	try {
		sequence = BigInt(input.lastEventId);
	} catch {
		return { accepted: false, reason: 'invalid_cursor' };
	}
	if (sequence <= input.lastSequence || sequence > MAX_EVENT_SEQUENCE) {
		return { accepted: false, reason: 'duplicate_or_old' };
	}

	let data: Record<string, unknown>;
	try {
		data = typeof input.data === 'string' ? JSON.parse(input.data) : input.data as Record<string, unknown>;
	} catch {
		return { accepted: false, reason: 'invalid_envelope' };
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return { accepted: false, reason: 'invalid_envelope' };
	}

	const { eventId, jobId, evidenceId, caseId, stage, status, sourceRevision } = data;
	const progress = Number(data.progress);
	if (
		typeof eventId !== 'string' || !EVENT_UUID_RE.test(eventId) ||
		typeof jobId !== 'string' || jobId.toLowerCase() !== input.jobId.toLowerCase() ||
		typeof evidenceId !== 'string' || !EVENT_UUID_RE.test(evidenceId) ||
		typeof caseId !== 'string' || caseId.toLowerCase() !== input.caseId.toLowerCase() ||
		typeof stage !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(stage) ||
		typeof status !== 'string' || !ALLOWED_STATUSES.has(status) ||
		typeof sourceRevision !== 'string' || !SOURCE_REVISION_RE.test(sourceRevision) ||
		!Number.isFinite(progress)
	) {
		return { accepted: false, reason: 'invalid_envelope' };
	}

	return {
		accepted: true,
		sequence,
		envelope: {
			eventId,
			jobId,
			evidenceId,
			caseId,
			stage,
			status: status as EvidenceProgressEventEnvelopeV1['status'],
			sourceRevision,
			progress: Math.max(0, Math.min(100, progress)),
		},
	};
}
