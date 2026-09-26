import { describe, expect, it } from 'vitest';
import { classifyCanonicalIdentityV1, prepareCanonicalActionWriteV1, validateCanonicalActionReadbackV1 } from './canonical-action-write-adapter-v1.js';

const runId = '00000000-0000-4000-8000-000000000001';
const actionId = '00000000-0000-4000-8000-000000000002';

function event(overrides: Record<string, unknown> = {}) {
	return {
		schema: 'atlas.workflow-action.v1', workflowId: 'workflow:repair', workflowRevision: 2,
		sequence: 3, actionId, dagNodeId: 'mutate', attempt: 1, lane: 'tool', kind: 'started',
		producerRevision: 'repair-adapter-v1', runId, ...overrides,
	};
}

describe('canonical action write adapter', () => {
	it('preserves canonical UUID identities, sequence, event type, and receipt', () => {
		const result = prepareCanonicalActionWriteV1(event());
		expect(result.runId).toBe(runId);
		expect(result.actionId).toBe(actionId);
		expect(result.sequenceNo).toBe(3);
		expect(result.eventType).toBe('action.started');
		expect(result.payload.eventReceipt).toMatchObject({ action_id: actionId, sequence: 3 });
	});

	it('rejects canonical events that cannot map to UUID-backed storage', () => {
		expect(() => prepareCanonicalActionWriteV1(event({ runId: 'run:non-uuid' })))
			.toThrow('CANONICAL_WORKFLOW_EVENT_RUN_ID_MUST_BE_UUID');
		expect(() => prepareCanonicalActionWriteV1(event({ actionId: 'action:non-uuid' })))
			.toThrow('CANONICAL_WORKFLOW_EVENT_ACTION_ID_MUST_BE_UUID');
	});

	it('validates workflow and outbox readback against the same canonical receipt', () => {
		const prepared = prepareCanonicalActionWriteV1(event());
		expect(validateCanonicalActionReadbackV1({
			event: prepared.event,
			workflowPayload: prepared.payload,
			outboxPayload: prepared.payload,
		})).toMatchObject({ eventChecksum: expect.any(String), runtimeEvidenceChecksum: expect.any(String) });
		expect(() => validateCanonicalActionReadbackV1({
			event: prepared.event,
			workflowPayload: prepared.payload,
			outboxPayload: { ...prepared.payload, canonicalEvent: { ...prepared.event, sequence: 99 } },
		})).toThrow('CANONICAL_WORKFLOW_EVENT_READBACK_IDENTITY_MISMATCH');
	});

	it('distinguishes idempotent retry from canonical identity collision', () => {
		const prepared = prepareCanonicalActionWriteV1(event());
		expect(classifyCanonicalIdentityV1({ event: prepared.event })).toEqual({ kind: 'NEW' });
		expect(classifyCanonicalIdentityV1({ event: prepared.event, existingEvent: prepared.event, existingReceipt: prepared.payload.eventReceipt }))
			.toMatchObject({ kind: 'IDEMPOTENT_DUPLICATE' });
		const changed = prepareCanonicalActionWriteV1(event({ metadata: { changed: true } }));
		expect(classifyCanonicalIdentityV1({ event: changed.event, existingEvent: prepared.event, existingReceipt: prepared.payload.eventReceipt }))
			.toMatchObject({ kind: 'CANONICAL_EVENT_IDENTITY_COLLISION' });
	});
});
