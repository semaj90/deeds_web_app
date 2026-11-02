export type EvidenceProgressSseEventV1 = 'connected' | 'progress' | 'complete' | 'error';

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
