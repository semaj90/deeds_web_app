import { describe, expect, it, vi } from 'vitest';

import { parseEventFabricMessage } from './event-fabric.js';
import { dispatchEventFabricEvent, type EventFabricProjectionHandlers } from '../workers/code-evidence-projection-worker.js';

function makeHandlers(): EventFabricProjectionHandlers {
	return {
		'code.evidence.persisted': vi.fn(async () => {}),
		'failure.observed': vi.fn(async () => {}),
		'analytics.observed': vi.fn(async () => {}),
		'recommendation.signal': vi.fn(async () => {}),
		'policy.decision.receipt': vi.fn(async () => {}),
		'checkpoint.commit': vi.fn(async () => {}),
		'artifact.materialized': vi.fn(async () => {}),
		'artifact.failed': vi.fn(async () => {}),
	};
}

const artifactAddress = {
	schema: 'atlas.artifact-address.v1' as const,
	artifactId: 'artifact-semantic-768-1',
	artifactHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
	schemaId: 'atlas.semantic-vector.v1',
	checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
	revisionSetHash: 'cccccccccccccccccccccccccccccccc',
	revisions: { semantic: 'semantic-v1' },
	locator: {
		storage: 'POSTGRES' as const,
		table: 'workflow_artifacts',
		primaryKey: 'artifact-semantic-768-1',
	},
};

describe('event fabric dispatch', () => {
	it('routes code evidence events to the code evidence handler', async () => {
		const handlers = makeHandlers();
		const event = parseEventFabricMessage({
			eventId: '11111111-1111-4111-8111-111111111111',
			eventType: 'code.evidence.persisted',
			occurredAt: '2026-08-12T00:00:00.000Z',
			sourceRef: 'src/foo.ts',
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

		await dispatchEventFabricEvent(event, handlers);

		expect(handlers['code.evidence.persisted']).toHaveBeenCalledTimes(1);
		expect(handlers['failure.observed']).not.toHaveBeenCalled();
	});

	it('routes recommendation signals to the recommendation handler', async () => {
		const handlers = makeHandlers();
		const event = parseEventFabricMessage({
			eventId: '22222222-2222-4222-8222-222222222222',
			eventType: 'recommendation.signal',
			occurredAt: '2026-08-12T00:00:00.000Z',
			sourceRef: 'src/foo.ts',
			payload: {
				candidateId: 'candidate-1',
				targetType: 'packet',
				targetId: 'packet-1',
				action: 'BOOST',
				sourceEvidenceRefs: ['src/foo.ts'],
			},
		});

		await dispatchEventFabricEvent(event, handlers);

		expect(handlers['recommendation.signal']).toHaveBeenCalledTimes(1);
		expect(handlers['code.evidence.persisted']).not.toHaveBeenCalled();
	});

	it('routes materialized artifacts to the durable artifact handler', async () => {
		const handlers = makeHandlers();
		const event = parseEventFabricMessage({
			eventId: '33333333-3333-4333-8333-333333333333',
			eventType: 'artifact.materialized',
			occurredAt: '2026-08-21T00:00:00.000Z',
			payload: {
				actionKey: 'action-key-00000001',
				artifact: artifactAddress,
				fencingToken: '7',
				producerRevision: 'producer-v1',
				inputArtifactRefs: [],
			},
		});

		await dispatchEventFabricEvent(event, handlers);

		expect(handlers['artifact.materialized']).toHaveBeenCalledTimes(1);
		expect(handlers['artifact.failed']).not.toHaveBeenCalled();
	});

	it('routes artifact failures without treating them as materializations', async () => {
		const handlers = makeHandlers();
		const event = parseEventFabricMessage({
			eventId: '44444444-4444-4444-8444-444444444444',
			eventType: 'artifact.failed',
			occurredAt: '2026-08-21T00:00:00.000Z',
			payload: {
				actionKey: 'action-key-00000001',
				expectedOutputSchema: 'atlas.semantic-vector.v1',
				fencingToken: '8',
				producerRevision: 'producer-v1',
				failureClass: 'GPU_OOM',
				retryable: true,
				errorHash: 'dddddddddddddddddddddddddddddddd',
				inputArtifactRefs: [],
			},
		});

		await dispatchEventFabricEvent(event, handlers);

		expect(handlers['artifact.failed']).toHaveBeenCalledTimes(1);
		expect(handlers['artifact.materialized']).not.toHaveBeenCalled();
	});
});
