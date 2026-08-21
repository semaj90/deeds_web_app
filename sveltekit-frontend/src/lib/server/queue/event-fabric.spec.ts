import { describe, expect, it } from 'vitest';
import { eventFabricEventSchema } from './event-fabric.js';

const baseEvent = {
	eventId: '11111111-1111-4111-8111-111111111111',
	occurredAt: '2026-08-12T00:00:00.000Z',
	traceId: 'trace-1',
	requestId: 'request-1',
	taskId: 'task-1',
	sourceRef: 'src/foo.ts',
	sourceRevision: 'source-v1',
	correlationId: 'corr-1',
	causationId: 'cause-1',
	schemaRevision: 'schema-v1',
} as const;

describe('event fabric contracts', () => {
	it('parses code evidence persisted events', () => {
		const event = eventFabricEventSchema.parse({
			...baseEvent,
			eventType: 'code.evidence.persisted',
			payload: {
				evidenceId: 'evidence-1',
				passKey: 'pass-1',
				sourceRef: 'src/foo.ts',
				sourceRevision: 'source-v1',
				parseNodeId: 'node-1',
				packetKey: 'packet-1',
				logicalEvidenceHash: 'hash-1',
				synthesisReceiptHash: 'hash-2',
				posConceptPacketHash: 'hash-3',
				producerId: 'producer-1',
				producerRevision: 'producer-rev-1',
				schemaRevision: 'schema-v1',
			},
		});

		expect(event.eventType).toBe('code.evidence.persisted');
	});

	it('parses failure observation events', () => {
		const event = eventFabricEventSchema.parse({
			...baseEvent,
			eventType: 'failure.observed',
			payload: {
				component: 'analysis-worker',
				operation: 'code_feature_registry',
				failureClass: 'TIMEOUT',
				retryable: true,
				retryCount: 1,
				retryBudget: 3,
				errorHash: 'error-hash-1',
				evidenceRefs: ['src/foo.ts'],
			},
		});

		expect(event.eventType).toBe('failure.observed');
	});

	it('parses analytics observation events', () => {
		const event = eventFabricEventSchema.parse({
			...baseEvent,
			eventType: 'analytics.observed',
			payload: {
				actorClass: 'agent',
				component: 'tensor-head-policy',
				signalClass: 'activation',
				targetType: 'packet',
				targetId: 'packet-1',
				score: 0.91,
				utility: 0.83,
			},
		});

		expect(event.eventType).toBe('analytics.observed');
	});

	it('parses recommendation signal events', () => {
		const event = eventFabricEventSchema.parse({
			...baseEvent,
			eventType: 'recommendation.signal',
			payload: {
				candidateId: 'candidate-1',
				targetType: 'packet',
				targetId: 'packet-1',
				action: 'BOOST',
				score: 0.81,
				confidence: 0.7,
				utility: 0.75,
				sourceEvidenceRefs: ['src/foo.ts'],
			},
		});

		expect(event.eventType).toBe('recommendation.signal');
	});

	it('parses policy decision receipt events', () => {
		const event = eventFabricEventSchema.parse({
			...baseEvent,
			eventType: 'policy.decision.receipt',
			payload: {
				decisionId: 'decision-1',
				recommendationEventId: '22222222-2222-4222-8222-222222222222',
				decision: 'accepted',
				decidedBy: 'policy-engine',
				policyRevision: 'policy-v1',
				sourceEvidenceRefs: ['src/foo.ts'],
			},
		});

		expect(event.eventType).toBe('policy.decision.receipt');
	});

	it('parses checkpoint commit events', () => {
		const event = eventFabricEventSchema.parse({
			...baseEvent,
			eventType: 'checkpoint.commit',
			payload: {
				checkpointId: 'checkpoint-1',
				stream: 'atlas.analytics.failure.v1',
				startOffset: '1',
				endOffset: '10',
				eventCount: 10,
				firstOccurredAt: '2026-08-12T00:00:00.000Z',
				lastOccurredAt: '2026-08-12T00:01:00.000Z',
				merkleRoot: 'merkle-root-1',
				schemaRevision: 'schema-v1',
			},
		});

		expect(event.eventType).toBe('checkpoint.commit');
	});

	it('parses artifact materialized events', () => {
		const event = eventFabricEventSchema.parse({
			...baseEvent,
			eventType: 'artifact.materialized',
			payload: {
				actionKey: 'action-key-0123456789abcdef',
				artifact: {
					schema: 'atlas.artifact-address.v1',
					artifactId: 'artifact-1',
					artifactHash: 'artifact-hash-0123456789abcdef',
					schemaId: 'atlas.candidate-feature-snapshot.v1',
					checksum: 'checksum-0123456789abcdef',
					revisionSetHash: 'revision-set-0123456789abcdef',
					locator: { storage: 'MMAP', path: '/tmp/artifact-1.bin' },
				},
				fencingToken: '1',
				producerRevision: 'materializer-v1',
			},
		});

		expect(event.eventType).toBe('artifact.materialized');
	});

	it('parses artifact failed events', () => {
		const event = eventFabricEventSchema.parse({
			...baseEvent,
			eventType: 'artifact.failed',
			payload: {
				actionKey: 'action-key-0123456789abcdef',
				expectedOutputSchema: 'atlas.candidate-feature-snapshot.v1',
				producerRevision: 'materializer-v1',
				failureClass: 'GPU_OOM',
				retryable: true,
				errorHash: 'error-hash-0123456789abcdef',
				inputArtifactRefs: [],
			},
		});

		expect(event.eventType).toBe('artifact.failed');
	});
});
