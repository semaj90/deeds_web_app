import { describe, expect, it } from 'vitest';
import { applySceneAssistantChangesV1, buildSceneAssistantPromptV1, createSceneAssistantDraftTokenV1, parseSceneAssistantPatchV1, sceneAssistantChatIdV1, type SceneAssistantDraftV1 } from './scene-assistant-patch-v1.js';

const evidenceId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const draft: SceneAssistantDraftV1 = {
	environmentKind: 'urban', selectedEvidenceIds: [evidenceId],
	selectedVideoTimeline: null,
	activeTimeWindow: null,
	actors: [{ actorId: 'ACTOR-01', label: 'Person 01', appearance: 'Unidentified proxy', evidenceIds: [evidenceId] }],
	objects: [{ objectId: 'OBJECT-01', registryId: 'box', label: 'Prop 01', positionMeters: [0, 0, 0] }],
	events: [{ eventId: 'EVENT-01', label: 'Reported entry', cueType: 'enter', sourceEvidenceId: evidenceId, startMs: 1000, endMs: 3000, uncertaintyMs: 100, targetKind: 'actor', targetId: 'ACTOR-01', action: 'none', fromMeters: [0, 0, 0], toMeters: [0, 0, 0] }],
	why: { status: 'unknown', text: '', evidenceIds: [] }, how: { status: 'unknown', text: '', evidenceIds: [] }
};

describe('scene assistant patch v1', () => {
	it('uses a dedicated, validated chat ID namespace for case scene planning', () => {
		expect(sceneAssistantChatIdV1(caseId)).toBe(`scene-planner-${caseId}`);
		expect(sceneAssistantChatIdV1(caseId)).not.toBe(`case-${caseId}`);
		expect(() => sceneAssistantChatIdV1('not-a-case-id')).toThrow();
	});

	it('hashes the exact editable draft and applies only selected fields', async () => {
		const baseDraftToken = await createSceneAssistantDraftTokenV1(draft);
		const patch = parseSceneAssistantPatchV1({
			schema: 'parent-atlas.scene-assistant-patch/v1', baseDraftToken, summary: 'Suggest a neutral four-bedroom blockout.',
			changes: [
				{ changeId: 'where-1', field: 'where', value: { environmentKind: 'four-bedroom-house', objects: draft.objects }, sourceEvidenceIds: [], uncertainty: 'Layout is illustrative.', rationale: 'Requested for blockout review.' },
				{ changeId: 'why-1', field: 'why', value: { status: 'unknown', text: '', evidenceIds: [] }, sourceEvidenceIds: [], uncertainty: 'Motive is not established.', rationale: 'No supported motive proposal.' }
			]
		}, baseDraftToken, draft, ['box']);
		const changed = applySceneAssistantChangesV1(draft, patch.changes, ['where-1']);
		expect(changed.environmentKind).toBe('four-bedroom-house');
		expect(changed.why).toEqual(draft.why);
		expect(draft.environmentKind).toBe('urban');
	});

	it('pins active video source revision and event intervals into the assistant token and prompt', async () => {
		const sourceTimeline = {
			evidenceId, sourceRevision: `sha256:${'a'.repeat(64)}`, analysisRevision: 'analysis-7',
			clockId: `evidence:${evidenceId}`, events: [{ eventId: 'VIDEO-EVENT-01', label: 'Person enters', startMs: 1200, endMs: 3400 }]
		};
		const pinned = { ...draft, selectedVideoTimeline: sourceTimeline };
		const token = await createSceneAssistantDraftTokenV1(pinned);
		const nextSourceRevision = await createSceneAssistantDraftTokenV1({
			...pinned, selectedVideoTimeline: { ...sourceTimeline, sourceRevision: `sha256:${'b'.repeat(64)}` }
		});
		expect(token).not.toBe(nextSourceRevision);
		const prompt = buildSceneAssistantPromptV1({ baseDraftToken: token, caseIntake: null, draft: pinned, evidence: [{ id: evidenceId, title: 'Camera A', mimeType: 'video/mp4' }] });
		expect(prompt).toContain(`ACTIVE_VIDEO_TIMELINE: ${JSON.stringify(sourceTimeline)}`);
		expect(prompt).toContain('do not infer offsets');
		const windowed = { ...pinned, activeTimeWindow: { evidenceId, clockId: `evidence:${evidenceId}`, startMs: 1200, endMs: 3400, binding: 'reviewed_source_event' as const } };
		expect(await createSceneAssistantDraftTokenV1(windowed)).not.toBe(token);
		const windowedPrompt = buildSceneAssistantPromptV1({ baseDraftToken: token, caseIntake: null, draft: windowed, evidence: [] });
		expect(windowedPrompt).toContain(`ACTIVE_TIME_WINDOW: ${JSON.stringify(windowed.activeTimeWindow)}`);
	});

	it('rejects stale drafts, unselected citations, unknown primitives and unresolved event targets', async () => {
		const baseDraftToken = await createSceneAssistantDraftTokenV1(draft);
		const envelope = (changes: unknown[]) => ({ schema: 'parent-atlas.scene-assistant-patch/v1', baseDraftToken, summary: 'Proposed edits', changes });
		const eventChange = { changeId: 'what-1', field: 'what_when', value: [{ ...draft.events[0], targetId: 'ACTOR-MISSING' }], sourceEvidenceIds: [evidenceId], uncertainty: 'Unknown.', rationale: 'Proposal.' };
		expect(() => parseSceneAssistantPatchV1(envelope([eventChange]), 'f'.repeat(64), draft, ['box'])).toThrow('SCENE_ASSISTANT_BASE_DRAFT_MISMATCH');
		expect(() => parseSceneAssistantPatchV1(envelope([{ ...eventChange, sourceEvidenceIds: [caseId] }]), baseDraftToken, draft, ['box'])).toThrow('SCENE_ASSISTANT_UNSELECTED_SOURCE');
		expect(() => parseSceneAssistantPatchV1(envelope([{ changeId: 'where-1', field: 'where', value: { environmentKind: 'beach', objects: [{ ...draft.objects[0], registryId: 'made-up' }] }, sourceEvidenceIds: [], uncertainty: 'Unknown.', rationale: 'Proposal.' }]), baseDraftToken, draft, ['box'])).toThrow('SCENE_ASSISTANT_PRIMITIVE_NOT_REGISTERED');
		expect(() => parseSceneAssistantPatchV1(envelope([eventChange]), baseDraftToken, draft, ['box'])).toThrow('SCENE_ASSISTANT_EVENT_TARGET_NOT_REGISTERED');
	});

	it('accepts assistant event proposals targeting a validated group of actors and props', async () => {
		const baseDraftToken = await createSceneAssistantDraftTokenV1(draft);
		const secondActor = { actorId: 'ACTOR-02', label: 'Person 02', appearance: 'Unidentified proxy', evidenceIds: [] };
		const expandedDraft: SceneAssistantDraftV1 = { ...draft, actors: [...draft.actors, secondActor] };
		const proposal = { ...draft.events[0]!, cueType: 'evacuate' as const, additionalTargets: [
			{ kind: 'actor' as const, targetId: 'ACTOR-02' }, { kind: 'primitive' as const, targetId: 'OBJECT-01' }
		] };
		const patch = parseSceneAssistantPatchV1({
			schema: 'parent-atlas.scene-assistant-patch/v1', baseDraftToken, summary: 'Bind the proposed group movement.',
			changes: [{ changeId: 'what-group', field: 'what_when', value: [proposal], sourceEvidenceIds: [evidenceId], uncertainty: 'Provisional event.', rationale: 'Targets are already registered.' }]
		}, baseDraftToken, expandedDraft, ['box']);
		const changed = applySceneAssistantChangesV1(expandedDraft, patch.changes, ['what-group']);
		expect(changed.events[0]?.additionalTargets).toEqual(proposal.additionalTargets);
	});
});
