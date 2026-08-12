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
	};
}

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
});
