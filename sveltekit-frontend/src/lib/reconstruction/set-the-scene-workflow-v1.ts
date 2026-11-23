import { assign, setup } from 'xstate';
import { z } from 'zod';

export const SetTheSceneRequestV1Schema = z.object({
	schema: z.literal('parent-atlas.set-the-scene-request/v1'),
	caseId: z.uuid(),
	mode: z.enum(['blockout', 'evidence']),
	prompt: z.string().trim().min(1).max(1000),
	sourceEvidenceIds: z.array(z.uuid()).max(100).refine((ids) => new Set(ids).size === ids.length)
}).strict();
export type SetTheSceneRequestV1 = z.infer<typeof SetTheSceneRequestV1Schema>;

export function validateSetTheSceneHandoffV1(input: unknown, authorizedCaseId: string, authorizedEvidenceIds: readonly string[]) {
	const parsed = SetTheSceneRequestV1Schema.safeParse(input);
	if (!parsed.success || parsed.data.caseId !== authorizedCaseId ||
		parsed.data.sourceEvidenceIds.some((id) => !authorizedEvidenceIds.includes(id))) return null;
	return parsed.data;
}

export type SceneWorkflowStateV1 =
	| 'idle' | 'checking_access' | 'preparing_inputs' | 'needs_input' | 'building_proposal'
	| 'proposal_review' | 'loading_scene' | 'preview_ready' | 'reviewing'
	| 'saving' | 'saved' | 'error' | 'stale' | 'canceled';

type SceneWorkflowContext = { caseId: string; requestId: number; selectedObjectId: string | null; error: string | null };
type SceneWorkflowEvent =
	| { type: 'START'; caseId: string } | { type: 'ACCESS_GRANTED' } | { type: 'ACCESS_REJECTED'; message?: string }
	| { type: 'INPUTS_READY' } | { type: 'NEEDS_INPUT'; message?: string } | { type: 'BUILD_PROPOSAL' }
	| { type: 'PROPOSAL_VALID' } | { type: 'PROPOSAL_INVALID'; message?: string } | { type: 'LOAD_SCENE' }
	| { type: 'OPEN_GENERATED_SCENE'; caseId: string }
	| { type: 'SCENE_READY' } | { type: 'SCENE_FAILED'; message?: string } | { type: 'SELECT_OBJECT'; objectId: string }
	| { type: 'REVIEW' } | { type: 'SOURCE_STALE' } | { type: 'CANCEL' } | { type: 'RETRY' }
	| { type: 'SAVE_REQUESTED' } | { type: 'SAVE_DISABLED' } | { type: 'SAVE_SUCCEEDED' } | { type: 'SAVE_FAILED'; message?: string };

export const setTheSceneWorkflowMachineV1 = setup({
	types: { context: {} as SceneWorkflowContext, events: {} as SceneWorkflowEvent }
}).createMachine({
	id: 'setTheSceneWorkflowV1', initial: 'idle',
	context: { caseId: '', requestId: 0, selectedObjectId: null, error: null },
	// A case switch is a new workflow even when the current state is preview/review/save.
	// Keep this at the machine root so START cannot be ignored by an in-flight state.
	on: {
		OPEN_GENERATED_SCENE: {
			guard: ({ context, event }) => context.caseId === event.caseId,
			target: '#setTheSceneWorkflowV1.loading_scene',
			actions: assign({ selectedObjectId: null, error: null })
		},
		START: {
			target: '#setTheSceneWorkflowV1.checking_access',
			actions: assign(({ event }) => ({ caseId: event.caseId, requestId: 0, selectedObjectId: null, error: null }))
		}
	},
	states: {
		idle: { on: { START: { target: 'checking_access', actions: assign(({ event }) => ({ caseId: event.caseId, requestId: 0, selectedObjectId: null, error: null })) } } },
		checking_access: { on: { ACCESS_GRANTED: 'preparing_inputs', ACCESS_REJECTED: { target: 'error', actions: assign(({ event }) => ({ error: event.message ?? 'Case access was not authorized.' })) }, CANCEL: 'canceled' } },
		preparing_inputs: { on: { INPUTS_READY: 'needs_input', NEEDS_INPUT: { target: 'needs_input', actions: assign(({ event }) => ({ error: event.message ?? null })) }, CANCEL: 'canceled', SOURCE_STALE: 'stale' } },
		needs_input: { on: { NEEDS_INPUT: { actions: assign(({ event }) => ({ error: event.message ?? 'Required scene inputs are missing.' })) }, BUILD_PROPOSAL: { target: 'building_proposal', actions: assign(({ context }) => ({ requestId: context.requestId + 1, error: null })) }, CANCEL: 'canceled', SOURCE_STALE: 'stale' } },
		building_proposal: { on: { PROPOSAL_VALID: 'proposal_review', PROPOSAL_INVALID: { target: 'error', actions: assign(({ event }) => ({ error: event.message ?? 'The proposed scene did not pass validation.' })) }, CANCEL: 'canceled', SOURCE_STALE: 'stale' } },
		proposal_review: { on: { BUILD_PROPOSAL: { target: 'building_proposal', actions: assign(({ context }) => ({ requestId: context.requestId + 1, error: null })) }, LOAD_SCENE: 'loading_scene', CANCEL: 'canceled', SOURCE_STALE: 'stale' } },
		loading_scene: { on: { SCENE_READY: 'preview_ready', SCENE_FAILED: { target: 'error', actions: assign(({ event }) => ({ error: event.message ?? 'The scene preview could not be rendered.' })) }, CANCEL: 'canceled', SOURCE_STALE: 'stale' } },
		preview_ready: { on: { BUILD_PROPOSAL: { target: 'building_proposal', actions: assign(({ context }) => ({ requestId: context.requestId + 1, error: null })) }, SELECT_OBJECT: { target: 'reviewing', actions: assign(({ event }) => ({ selectedObjectId: event.objectId })) }, REVIEW: 'reviewing', LOAD_SCENE: 'loading_scene', SAVE_REQUESTED: 'saving', SOURCE_STALE: 'stale', CANCEL: 'canceled' } },
		reviewing: { on: { BUILD_PROPOSAL: { target: 'building_proposal', actions: assign(({ context }) => ({ requestId: context.requestId + 1, error: null })) }, SELECT_OBJECT: { actions: assign(({ event }) => ({ selectedObjectId: event.objectId })) }, REVIEW: 'preview_ready', LOAD_SCENE: 'loading_scene', SAVE_REQUESTED: 'saving', SOURCE_STALE: 'stale', CANCEL: 'canceled' } },
		saving: { on: { SAVE_DISABLED: { target: 'preview_ready', actions: assign({ error: 'Scene saving is disabled by the current server feature gate.' }) }, SAVE_SUCCEEDED: 'saved', SAVE_FAILED: { target: 'error', actions: assign(({ event }) => ({ error: event.message ?? 'Scene save failed.' })) }, CANCEL: 'canceled', SOURCE_STALE: 'stale' } },
		saved: { on: { START: { target: 'checking_access', actions: assign(({ event }) => ({ caseId: event.caseId, requestId: 0, selectedObjectId: null, error: null })) }, SOURCE_STALE: 'stale' } },
		error: { on: { BUILD_PROPOSAL: { target: 'building_proposal', actions: assign(({ context }) => ({ requestId: context.requestId + 1, error: null })) }, RETRY: 'needs_input', CANCEL: 'canceled', SOURCE_STALE: 'stale' } },
		stale: { on: { RETRY: { target: 'checking_access', actions: assign({ error: null, requestId: 0, selectedObjectId: null }) }, CANCEL: 'canceled' } },
		canceled: {
			on: {
				BUILD_PROPOSAL: { target: 'building_proposal', actions: assign(({ context }) => ({ requestId: context.requestId + 1, error: null })) },
				RETRY: { target: 'checking_access', actions: assign({ error: null, requestId: 0, selectedObjectId: null }) },
				START: { target: 'checking_access', actions: assign(({ event }) => ({ caseId: event.caseId, requestId: 0, selectedObjectId: null, error: null })) }
			}
		}
	}
});

export function isCurrentSceneWorkflowResponseV1(input: { caseId: string; activeCaseId: string; requestId: number; activeRequestId: number }): boolean {
	return input.caseId === input.activeCaseId && input.requestId === input.activeRequestId;
}

export function buildSetTheSceneHrefV1(input: SetTheSceneRequestV1): string {
	const request = SetTheSceneRequestV1Schema.parse(input);
	const query = new URLSearchParams({ setScene: '1', mode: request.mode, prompt: request.prompt });
	for (const sourceId of request.sourceEvidenceIds) query.append('sourceEvidenceId', sourceId);
	return `/cases/${encodeURIComponent(request.caseId)}/crime-scene?${query.toString()}`;
}
