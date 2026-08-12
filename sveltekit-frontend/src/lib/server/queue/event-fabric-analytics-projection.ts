import { makeEvent, emit } from '$lib/server/analytics/analytics-sink.js';
import type { AnalyticsEventEnvelope } from '$lib/server/analytics/analytics-event-envelope.js';
import type {
	AnalyticsObservationEventV1,
	CheckpointCommitEventV1,
	CodeEvidencePersistedEventV1,
	FailureObservationEventV1,
	PolicyDecisionReceiptEventV1,
	RecommendationSignalEventV1,
	EventFabricEventV1,
} from './event-fabric.js';

function projectCodeEvidencePersisted(event: CodeEvidencePersistedEventV1): AnalyticsEventEnvelope {
	return makeEvent({
		eventType: 'acp.packet.created',
		traceId: event.traceId ?? `code-evidence:${event.payload.evidenceId}`,
		sourceRef: event.payload.sourceRef,
		packetKey: event.payload.packetKey,
		metadata: {
			sourceRevision: event.payload.sourceRevision,
			evidenceId: event.payload.evidenceId,
			passKey: event.payload.passKey,
			parseNodeId: event.payload.parseNodeId,
			logicalEvidenceHash: event.payload.logicalEvidenceHash,
			synthesisReceiptHash: event.payload.synthesisReceiptHash,
			posConceptPacketHash: event.payload.posConceptPacketHash,
			producerId: event.payload.producerId,
			producerRevision: event.payload.producerRevision,
			schemaRevision: event.payload.schemaRevision,
		},
	});
}

function projectFailureObservation(event: FailureObservationEventV1): AnalyticsEventEnvelope {
	return makeEvent({
		eventType: 'error.occurred',
		traceId: event.traceId ?? `failure:${event.eventId}`,
		sourceRef: event.sourceRef,
		metadata: {
			component: event.payload.component,
			operation: event.payload.operation,
			failureClass: event.payload.failureClass,
			retryable: event.payload.retryable,
			retryCount: event.payload.retryCount,
			retryBudget: event.payload.retryBudget,
			errorHash: event.payload.errorHash,
			evidenceRefs: event.payload.evidenceRefs,
			graphRevision: event.payload.graphRevision ?? null,
			modelRevision: event.payload.modelRevision ?? null,
			toolCatalogRevision: event.payload.toolCatalogRevision ?? null,
			sourceRevision: event.payload.sourceRevision ?? null,
		},
	});
}

function projectAnalyticsObservation(event: AnalyticsObservationEventV1): AnalyticsEventEnvelope {
	return makeEvent({
		eventType: 'lane.result',
		traceId: event.traceId ?? `analytics:${event.eventId}`,
		sourceRef: event.sourceRef,
		packetKey: event.payload.targetType === 'packet' ? event.payload.targetId : undefined,
		laneId: event.payload.component,
		score: event.payload.score,
		metadata: {
			actorClass: event.payload.actorClass,
			actorId: event.payload.actorId ?? null,
			signalClass: event.payload.signalClass,
			targetType: event.payload.targetType,
			targetId: event.payload.targetId,
			utility: event.payload.utility ?? null,
			modelRevision: event.payload.modelRevision ?? null,
			graphRevision: event.payload.graphRevision ?? null,
			sourceRevision: event.payload.sourceRevision ?? null,
		},
	});
}

function projectRecommendationSignal(event: RecommendationSignalEventV1): AnalyticsEventEnvelope {
	return makeEvent({
		eventType: 'candidate.selected',
		traceId: event.traceId ?? `recommendation:${event.eventId}`,
		sourceRef: event.sourceRef,
		packetKey: event.payload.targetType === 'packet' ? event.payload.targetId : undefined,
		laneId: event.payload.action,
		score: event.payload.score,
		metadata: {
			candidateId: event.payload.candidateId,
			targetType: event.payload.targetType,
			targetId: event.payload.targetId,
			action: event.payload.action,
			confidence: event.payload.confidence ?? null,
			utility: event.payload.utility ?? null,
			expiresAt: event.payload.expiresAt ?? null,
			sourceEvidenceRefs: event.payload.sourceEvidenceRefs,
			featureRevision: event.payload.featureRevision ?? null,
			graphRevision: event.payload.graphRevision ?? null,
			modelRevision: event.payload.modelRevision ?? null,
		},
	});
}

function projectPolicyDecisionReceipt(event: PolicyDecisionReceiptEventV1): AnalyticsEventEnvelope {
	const eventType =
		event.payload.decision === 'rejected' ? 'recommendation.dismiss' : 'recommendation.accept';

	return makeEvent({
		eventType,
		traceId: event.traceId ?? `policy:${event.eventId}`,
		sourceRef: event.sourceRef,
		metadata: {
			decisionId: event.payload.decisionId,
			recommendationEventId: event.payload.recommendationEventId ?? null,
			decision: event.payload.decision,
			decidedBy: event.payload.decidedBy,
			decisionReason: event.payload.decisionReason ?? null,
			policyRevision: event.payload.policyRevision,
			resultingStateHash: event.payload.resultingStateHash ?? null,
			sourceEvidenceRefs: event.payload.sourceEvidenceRefs,
		},
	});
}

function projectCheckpointCommit(event: CheckpointCommitEventV1): AnalyticsEventEnvelope {
	return makeEvent({
		eventType: 'lane.result',
		traceId: event.traceId ?? `checkpoint:${event.eventId}`,
		sourceRef: event.sourceRef,
		laneId: event.payload.stream,
		metadata: {
			checkpointId: event.payload.checkpointId,
			stream: event.payload.stream,
			startOffset: event.payload.startOffset,
			endOffset: event.payload.endOffset,
			eventCount: event.payload.eventCount,
			firstOccurredAt: event.payload.firstOccurredAt,
			lastOccurredAt: event.payload.lastOccurredAt,
			merkleRoot: event.payload.merkleRoot,
			schemaRevision: event.payload.schemaRevision,
			modelRevisionSetHash: event.payload.modelRevisionSetHash ?? null,
			sourceRevisionSetHash: event.payload.sourceRevisionSetHash ?? null,
		},
	});
}

export function projectEventFabricToAnalytics(event: EventFabricEventV1): AnalyticsEventEnvelope | null {
	switch (event.eventType) {
		case 'code.evidence.persisted':
			return projectCodeEvidencePersisted(event);
		case 'failure.observed':
			return projectFailureObservation(event);
		case 'analytics.observed':
			return projectAnalyticsObservation(event);
		case 'recommendation.signal':
			return projectRecommendationSignal(event);
		case 'policy.decision.receipt':
			return projectPolicyDecisionReceipt(event);
		case 'checkpoint.commit':
			return projectCheckpointCommit(event);
	}
}

export function emitEventFabricAnalyticsProjection(event: EventFabricEventV1): void {
	const projected = projectEventFabricToAnalytics(event);
	if (projected) emit(projected);
}
