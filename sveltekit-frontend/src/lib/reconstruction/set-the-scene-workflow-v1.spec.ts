import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import {
	buildSetTheSceneHrefV1, isCurrentSceneWorkflowResponseV1, setTheSceneWorkflowMachineV1,
	validateSetTheSceneHandoffV1
} from './set-the-scene-workflow-v1.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '22222222-2222-4222-8222-222222222222';
function actor() { return createActor(setTheSceneWorkflowMachineV1).start(); }
function authorized(a: ReturnType<typeof actor>) {
	a.send({ type: 'START', caseId }); a.send({ type: 'ACCESS_GRANTED' }); a.send({ type: 'INPUTS_READY' });
}

describe('Set the Scene workflow v1', () => {
	it('validates the assistant handoff against the authorized case evidence snapshot', () => {
		const request = { schema: 'parent-atlas.set-the-scene-request/v1', caseId, mode: 'evidence', prompt: 'Map the reported entrance.', sourceEvidenceIds: [evidenceId] };
		expect(validateSetTheSceneHandoffV1(request, caseId, [evidenceId])).toEqual(request);
		expect(validateSetTheSceneHandoffV1(request, '33333333-3333-4333-8333-333333333333', [evidenceId])).toBeNull();
		expect(validateSetTheSceneHandoffV1(request, caseId, [])).toBeNull();
		expect(validateSetTheSceneHandoffV1({ ...request, sourceEvidenceIds: [evidenceId, evidenceId] }, caseId, [evidenceId])).toBeNull();
	});

	it('builds a URL encoded handoff preserving mode, prompt, and source IDs', () => {
		const href = buildSetTheSceneHrefV1({ schema: 'parent-atlas.set-the-scene-request/v1', caseId, mode: 'evidence', prompt: 'Review entry & exit', sourceEvidenceIds: [evidenceId] });
		const url = new URL(href, 'https://parent-atlas.test');
		expect(url.searchParams.get('prompt')).toBe('Review entry & exit');
		expect(url.searchParams.get('sourceEvidenceId')).toBe(evidenceId);
	});

	it('runs access, input, proposal, preview and object review in order', () => {
		const a = actor(); authorized(a);
		expect(a.getSnapshot().matches('needs_input')).toBe(true);
		a.send({ type: 'BUILD_PROPOSAL' }); a.send({ type: 'PROPOSAL_VALID' }); a.send({ type: 'LOAD_SCENE' }); a.send({ type: 'SCENE_READY' });
		a.send({ type: 'SELECT_OBJECT', objectId: 'OBJECT-DESK-01' });
		expect(a.getSnapshot().matches('reviewing')).toBe(true);
		expect(a.getSnapshot().context.selectedObjectId).toBe('OBJECT-DESK-01'); a.stop();
	});

	it('resets to the newly authorized case from an active review state', () => {
		const a = actor(); authorized(a);
		a.send({ type: 'BUILD_PROPOSAL' }); a.send({ type: 'PROPOSAL_VALID' }); a.send({ type: 'LOAD_SCENE' }); a.send({ type: 'SCENE_READY' });
		a.send({ type: 'SELECT_OBJECT', objectId: 'OBJECT-OLD-CASE' });
		a.send({ type: 'START', caseId: '33333333-3333-4333-8333-333333333333' });
		expect(a.getSnapshot().matches('checking_access')).toBe(true);
		expect(a.getSnapshot().context).toMatchObject({ caseId: '33333333-3333-4333-8333-333333333333', requestId: 0, selectedObjectId: null, error: null });
		a.stop();
	});

	it('rejects unauthorized access and keeps incomplete evidence requests in needs_input', () => {
		const denied = actor(); denied.send({ type: 'START', caseId }); denied.send({ type: 'ACCESS_REJECTED' });
		expect(denied.getSnapshot().matches('error')).toBe(true); denied.stop();
		const missing = actor(); missing.send({ type: 'START', caseId }); missing.send({ type: 'ACCESS_GRANTED' });
		missing.send({ type: 'NEEDS_INPUT', message: 'Select case evidence.' });
		expect(missing.getSnapshot().matches('needs_input')).toBe(true); missing.stop();
	});

	it('supports proposal and renderer failure, cancellation, retry and stale response rejection', () => {
		const a = actor(); authorized(a); a.send({ type: 'BUILD_PROPOSAL' }); a.send({ type: 'PROPOSAL_INVALID' });
		expect(a.getSnapshot().matches('error')).toBe(true); a.send({ type: 'RETRY' }); a.send({ type: 'BUILD_PROPOSAL' });
		a.send({ type: 'PROPOSAL_VALID' }); a.send({ type: 'LOAD_SCENE' }); a.send({ type: 'SCENE_FAILED' });
		expect(a.getSnapshot().matches('error')).toBe(true); a.send({ type: 'RETRY' }); a.send({ type: 'SOURCE_STALE' });
		expect(a.getSnapshot().matches('stale')).toBe(true);
		expect(isCurrentSceneWorkflowResponseV1({ caseId, activeCaseId: caseId, requestId: 3, activeRequestId: 3 })).toBe(true);
		expect(isCurrentSceneWorkflowResponseV1({ caseId, activeCaseId: '33333333-3333-4333-8333-333333333333', requestId: 3, activeRequestId: 3 })).toBe(false);
		expect(isCurrentSceneWorkflowResponseV1({ caseId, activeCaseId: caseId, requestId: 2, activeRequestId: 3 })).toBe(false); a.stop();
		const canceled = actor(); authorized(canceled); canceled.send({ type: 'BUILD_PROPOSAL' }); canceled.send({ type: 'CANCEL' });
		expect(canceled.getSnapshot().matches('canceled')).toBe(true); canceled.stop();
	});

	it('keeps gated persistence disabled and exposes that save cannot proceed', () => {
		const a = actor(); authorized(a); a.send({ type: 'BUILD_PROPOSAL' }); a.send({ type: 'PROPOSAL_VALID' }); a.send({ type: 'LOAD_SCENE' }); a.send({ type: 'SCENE_READY' });
		a.send({ type: 'SAVE_REQUESTED' }); a.send({ type: 'SAVE_DISABLED' });
		expect(a.getSnapshot().matches('preview_ready')).toBe(true);
		expect(a.getSnapshot().context.error).toContain('feature gate'); a.stop();
	});
});
