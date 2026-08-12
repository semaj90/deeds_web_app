import { describe, expect, it } from 'vitest';

import { projectEventFabricToAnalytics } from './event-fabric-analytics-projection.js';
import { parseEventFabricMessage } from './event-fabric.js';

describe('event fabric analytics projection', () => {
	it('projects failure observations to analytics error events', () => {
		const projected = projectEventFabricToAnalytics(
			parseEventFabricMessage({
				eventId: '11111111-1111-4111-8111-111111111111',
				eventType: 'failure.observed',
				occurredAt: '2026-08-12T00:00:00.000Z',
				sourceRef: 'src/foo.ts',
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
			})
		);

		expect(projected?.eventType).toBe('error.occurred');
		expect(projected?.metadata).toMatchObject({
			component: 'analysis-worker',
			failureClass: 'TIMEOUT',
			errorHash: 'error-hash-1',
		});
	});

	it('projects code evidence persisted events to packet-created analytics events', () => {
		const projected = projectEventFabricToAnalytics(
			parseEventFabricMessage({
				eventId: '22222222-2222-4222-8222-222222222222',
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
			})
		);

		expect(projected?.eventType).toBe('acp.packet.created');
		expect(projected?.packetKey).toBe('packet-1');
		expect(projected?.metadata).toMatchObject({
			evidenceId: 'evidence-1',
			passKey: 'pass-1',
			logicalEvidenceHash: 'hash-1',
		});
	});
});
