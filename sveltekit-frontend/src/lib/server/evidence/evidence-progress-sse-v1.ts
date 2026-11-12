export type EvidenceProgressSseEventV1 = 'connected' | 'progress' | 'complete' | 'error';

export type EvidenceAnalysisJobStatusV1 = 'queued' | 'running' | 'completed' | 'failed';

/** Server-suggested EventSource retry delay, randomized to spread reconnect bursts. */
export function formatEvidenceSseRetryV1(random = Math.random): string {
	const minMs = 2_500;
	const maxMs = 5_000;
	const sample = Math.min(0.999_999_999, Math.max(0, random()));
	return `retry: ${minMs + Math.floor(sample * (maxMs - minMs + 1))}\n\n`;
}

/** Minimal public progress envelope. Deliberately excludes filenames, errors and job result JSON. */
export interface EvidenceAnalysisProgressEnvelopeV1 {
	eventId: string;
	jobId: string;
	evidenceId: string;
	caseId: string;
	stage: string;
	status: EvidenceAnalysisJobStatusV1;
	sourceRevision: string;
	progress: number;
}

export function parseEvidenceEventCursorV1(value: string | null): bigint | null {
	if (value === null || value === '') return 0n;
	if (!/^\d{1,19}$/.test(value)) return null;
	try {
		const cursor = BigInt(value);
		return cursor <= 9_223_372_036_854_775_807n ? cursor : null;
	} catch {
		return null;
	}
}

export function formatEvidenceAnalysisProgressSseV1(
	sequence: bigint,
	payload: EvidenceAnalysisProgressEnvelopeV1,
): string {
	return `id: ${sequence.toString()}\nevent: analysis-progress\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function formatEvidenceProgressSseEventV1(
	event: EvidenceProgressSseEventV1,
	payload: Record<string, unknown>,
): string {
	return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function buildEvidenceProcessingCompletionV1(input: {
	jobId: string;
	evidenceId: string;
	result: unknown;
	projectionSchedulerEnabled: boolean;
}): Record<string, unknown> {
	const result = typeof input.result === 'object' && input.result !== null
		? input.result as Record<string, unknown>
		: {};
	const chunkCount = Number(result.chunkCount);
	const persistedCount = Number(result.persistedCount);
	const canonicalIndexed = result.canonicalStore === 'postgresql.evidence_vectors' &&
		result.representationId === 'semantic_768' &&
		Number.isSafeInteger(chunkCount) && chunkCount > 0 &&
		persistedCount === chunkCount;
	const projectionStatus = input.projectionSchedulerEnabled ? 'not_verified' : 'scheduler_disabled_not_verified';
	const message = canonicalIndexed
		? `PostgreSQL indexed ${chunkCount} semantic_768 chunk${chunkCount === 1 ? '' : 's'}. Qdrant projection is ${input.projectionSchedulerEnabled ? 'not verified by this status stream' : 'not scheduled by this application instance'}.`
		: 'The job completed, but its canonical PostgreSQL vector receipt is incomplete; verify before relying on search.';

	return {
		jobId: input.jobId,
		evidenceId: input.evidenceId,
		canonicalStatus: canonicalIndexed ? 'postgresql_indexed' : 'completion_unverified',
		canonicalStore: canonicalIndexed ? 'postgresql.evidence_vectors' : null,
		representationId: canonicalIndexed ? 'semantic_768' : null,
		chunkCount: canonicalIndexed ? chunkCount : null,
		projectionStatus,
		message,
	};
}
