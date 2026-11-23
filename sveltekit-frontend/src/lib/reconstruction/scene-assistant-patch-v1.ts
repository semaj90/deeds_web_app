import { z } from 'zod';
import type { SceneDraftActorV1, SceneDraftEventV1, SceneDraftObjectV1 } from './case-scene-plan-draft-v1.js';

const id = z.string().uuid();
const vector3 = z.tuple([z.number().finite().min(-160).max(160), z.number().finite().min(-160).max(160), z.number().finite().min(-160).max(160)] as const)
	.transform((value): [number, number, number] => [value[0]!, value[1]!, value[2]!]);
const actor = z.object({ actorId: z.string().regex(/^ACTOR-[A-Z0-9-]{1,48}$/), label: z.string().min(1).max(120), appearance: z.string().max(500), evidenceIds: z.array(id).max(100) }).strict();
const object = z.object({ objectId: z.string().regex(/^OBJECT-[A-Z0-9-]{1,48}$/), registryId: z.string().min(1).max(80), label: z.string().min(1).max(120), positionMeters: vector3 }).strict();
const targetRef = z.object({ kind: z.enum(['actor', 'primitive']), targetId: z.string().min(1).max(100) }).strict();
const event = z.object({
	eventId: z.string().regex(/^EVENT-[A-Z0-9-]{1,48}$/), label: z.string().min(1).max(1000),
	cueType: z.enum(['enter', 'exit', 'move', 'interact', 'alarm', 'evacuate', 'timed_prop', 'interview', 'custom']),
	sourceEvidenceId: id, startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(), uncertaintyMs: z.number().int().nonnegative(),
	targetKind: z.enum(['actor', 'primitive']), targetId: z.string().min(1).max(100), action: z.enum(['none', 'visible', 'move']),
	additionalTargets: z.array(targetRef).max(63).default([]),
	fromMeters: vector3, toMeters: vector3
}).strict().superRefine((value, context) => {
	if (value.endMs <= value.startMs) context.addIssue({ code: 'custom', message: 'Event end must follow start' });
	const refs = [{ kind: value.targetKind, targetId: value.targetId }, ...value.additionalTargets];
	if (new Set(refs.map((ref) => `${ref.kind}:${ref.targetId}`)).size !== refs.length) {
		context.addIssue({ code: 'custom', path: ['additionalTargets'], message: 'Event target references must be unique' });
	}
});
const narrative = z.object({
	status: z.enum(['unknown', 'hypothesis', 'disputed']), text: z.string().max(1000), evidenceIds: z.array(id).max(100)
}).strict().superRefine((value, context) => {
	if (value.status === 'unknown' && (value.text.trim() || value.evidenceIds.length)) context.addIssue({ code: 'custom', message: 'Unknown must remain empty and uncited' });
	if (value.status !== 'unknown' && (!value.text.trim() || !value.evidenceIds.length)) context.addIssue({ code: 'custom', message: 'A hypothesis or dispute requires text and selected evidence' });
});
const sceneAssistantField = z.enum(['where', 'who', 'what_when', 'why', 'how']);

export const SceneAssistantChangeV1Schema = z.discriminatedUnion('field', [
	z.object({ field: z.literal('where'), value: z.object({ environmentKind: z.enum(['urban', 'beach', 'indoor', 'four-bedroom-house']), objects: z.array(object).max(100) }).strict() }).strict(),
	z.object({ field: z.literal('who'), value: z.array(actor).max(64) }).strict(),
	z.object({ field: z.literal('what_when'), value: z.array(event).max(128) }).strict(),
	z.object({ field: z.literal('why'), value: narrative }).strict(),
	z.object({ field: z.literal('how'), value: narrative }).strict()
]);

export const SceneAssistantPatchV1Schema = z.object({
	schema: z.literal('parent-atlas.scene-assistant-patch/v1'),
	baseDraftToken: z.string().regex(/^[a-f0-9]{64}$/),
	summary: z.string().min(1).max(1000),
	changes: z.array(z.object({
		changeId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
		field: sceneAssistantField,
		value: z.unknown(),
		sourceEvidenceIds: z.array(id).max(100),
		uncertainty: z.string().min(1).max(500),
		rationale: z.string().min(1).max(1000)
	}).strict()).max(5)
}).strict();

export type SceneAssistantChangeV1 = z.infer<typeof SceneAssistantChangeV1Schema>;
export type SceneAssistantPatchV1 = z.infer<typeof SceneAssistantPatchV1Schema>;
export type SceneAssistantDraftV1 = {
	environmentKind: 'urban' | 'beach' | 'indoor' | 'four-bedroom-house';
	selectedEvidenceIds: string[];
	selectedVideoTimeline: {
		evidenceId: string;
		sourceRevision: string;
		analysisRevision: string;
		clockId: string;
		events: Array<{ eventId: string; label: string; startMs: number; endMs: number }>;
	} | null;
	activeTimeWindow: {
		evidenceId: string;
		clockId: string;
		startMs: number;
		endMs: number;
		binding: 'reviewed_source_event' | 'draft_hypothesis';
	} | null;
	actors: SceneDraftActorV1[];
	objects: SceneDraftObjectV1[];
	events: SceneDraftEventV1[];
	why: { status: 'unknown' | 'hypothesis' | 'disputed'; text: string; evidenceIds: string[] };
	how: { status: 'unknown' | 'hypothesis' | 'disputed'; text: string; evidenceIds: string[] };
};

/** Keep the reconstruction assistant's persisted chat separate from general case chat history. */
export function sceneAssistantChatIdV1(caseId: string): string {
	return `scene-planner-${z.string().uuid().parse(caseId)}`;
}

function requiredVector3(value: readonly number[] | undefined): [number, number, number] {
	if (!value || value.length !== 3 || !value.every(Number.isFinite)) throw new Error('SCENE_ASSISTANT_VECTOR_INVALID');
	return [value[0]!, value[1]!, value[2]!];
}

export async function createSceneAssistantDraftTokenV1(draft: SceneAssistantDraftV1): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(draft));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildSceneAssistantPromptV1(input: {
	baseDraftToken: string;
	caseIntake: unknown;
	draft: SceneAssistantDraftV1;
	evidence: readonly { id: string; title: string; mimeType: string | null }[];
}): string {
	return [
		'You are proposing edits to an illustrative legal case-scene draft. Do not decide identity, age, guilt, intent, motive, or what actually happened. Treat all intake and current fields as unverified. Do not invent evidence IDs, source clocks, clock offsets, measurements, calibration, or citations.',
		'Return one JSON object only, matching this exact shape: {"schema":"parent-atlas.scene-assistant-patch/v1","baseDraftToken":"...","summary":"...","changes":[{"changeId":"...","field":"where|who|what_when|why|how","value":...,"sourceEvidenceIds":["selected evidence UUIDs only"],"uncertainty":"...","rationale":"..."}]}. Each field may appear at most once. Use only selected evidence IDs listed below. If support is missing or conflicting, leave the relevant field unchanged; if you cannot make a grounded proposal, return an empty changes array.',
		'Field values: where = {environmentKind: urban|beach|indoor|four-bedroom-house, objects:[{objectId,registryId,label,positionMeters:[x,y,z]}]}; who = [{actorId,label,appearance,evidenceIds}]; what_when = [{eventId,label,cueType,sourceEvidenceId,startMs,endMs,uncertaintyMs,targetKind,targetId,additionalTargets:[{kind,targetId}],action,fromMeters,toMeters}]; why/how = {status:unknown|hypothesis|disputed,text,evidenceIds}. Unknown motive/method must have empty text and no citations. A suggested scene position is always illustrative unless a reviewed calibration is explicitly present; do not output measured coordinates.',
		'Keep the case-intake object immutable. Keep each event on exactly one evidence-local clock, preserve an existing sourceEvent binding if one is present, and do not invent sourceEvent bindings. Use only registered actor/object IDs when targeting events. Mark uncertainty explicitly. Every change must include the evidence IDs it relies on and a short rationale.',
		'ACTIVE_VIDEO_TIMELINE is revision-pinned context, not a finding. If present, use its evidenceId, sourceRevision, analysisRevision, clockId, and event intervals exactly as listed when proposing time-aware changes. ACTIVE_TIME_WINDOW is the reviewer-selected working window: keep proposals within it when it matches the target source. A draft_hypothesis window is not observed evidence. Keep every other source clock separate; do not infer offsets or convert between media time and wall-clock time. If no active timeline is present, do not invent observed event timestamps; any user-requested time is only an illustrative hypothesis.',
	`BASE_DRAFT_TOKEN: ${input.baseDraftToken}`,
	`CASE_INTAKE_UNVERIFIED: ${JSON.stringify(input.caseIntake)}`,
	`SELECTED_EVIDENCE: ${JSON.stringify(input.evidence)}`,
	`ACTIVE_VIDEO_TIMELINE: ${JSON.stringify(input.draft.selectedVideoTimeline)}`,
	`ACTIVE_TIME_WINDOW: ${JSON.stringify(input.draft.activeTimeWindow)}`,
	`CURRENT_DRAFT: ${JSON.stringify(input.draft)}`
	].join('\n\n');
}

export function parseSceneAssistantPatchV1(input: unknown, expectedBaseDraftToken: string, draft: SceneAssistantDraftV1, allowedPrimitiveIds: readonly string[]): SceneAssistantPatchV1 {
	let parsed: SceneAssistantPatchV1;
	try { parsed = SceneAssistantPatchV1Schema.parse(input); }
	catch { throw new Error('SCENE_ASSISTANT_RESPONSE_INVALID'); }
	if (parsed.baseDraftToken !== expectedBaseDraftToken) throw new Error('SCENE_ASSISTANT_BASE_DRAFT_MISMATCH');
	if (new Set(parsed.changes.map((change) => change.changeId)).size !== parsed.changes.length ||
		new Set(parsed.changes.map((change) => change.field)).size !== parsed.changes.length) throw new Error('SCENE_ASSISTANT_DUPLICATE_CHANGE');
	const allowedEvidence = new Set(draft.selectedEvidenceIds);
	const whoChange = parsed.changes.find((change) => change.field === 'who');
	const whereChange = parsed.changes.find((change) => change.field === 'where');
	const actorIds = new Set(draft.actors.map((item) => item.actorId));
	if (whoChange) for (const item of SceneAssistantChangeV1Schema.parse({ field: 'who', value: whoChange.value }).value as SceneDraftActorV1[]) actorIds.add(item.actorId);
	const objectIds = new Set(draft.objects.map((item) => item.objectId));
	if (whereChange) for (const item of (SceneAssistantChangeV1Schema.parse({ field: 'where', value: whereChange.value }) as Extract<SceneAssistantChangeV1, { field: 'where' }>).value.objects) objectIds.add(item.objectId);
	const selectedObjects = new Set([...objectIds, ...allowedPrimitiveIds]);
	for (const rawChange of parsed.changes) {
		const change = SceneAssistantChangeV1Schema.parse({ field: rawChange.field, value: rawChange.value });
		if (rawChange.sourceEvidenceIds.some((sourceId) => !allowedEvidence.has(sourceId))) throw new Error('SCENE_ASSISTANT_UNSELECTED_SOURCE');
		const refs = change.field === 'who' ? change.value.flatMap((item) => item.evidenceIds)
			: change.field === 'what_when' ? change.value.map((item) => item.sourceEvidenceId)
			: change.field === 'why' || change.field === 'how' ? change.value.evidenceIds
			: [];
		if (refs.some((sourceId) => !allowedEvidence.has(sourceId)) || refs.some((sourceId) => !rawChange.sourceEvidenceIds.includes(sourceId))) {
			throw new Error('SCENE_ASSISTANT_CITATION_MISMATCH');
		}
		if (change.field === 'where' && change.value.objects.some((item) => !allowedPrimitiveIds.includes(item.registryId))) {
			throw new Error('SCENE_ASSISTANT_PRIMITIVE_NOT_REGISTERED');
		}
		if (change.field === 'what_when' && change.value.some((item) => {
			const refs = [{ kind: item.targetKind, targetId: item.targetId }, ...item.additionalTargets];
			return refs.some((target) => target.kind === 'actor' ? !actorIds.has(target.targetId) : !selectedObjects.has(target.targetId));
		})) {
			throw new Error('SCENE_ASSISTANT_EVENT_TARGET_NOT_REGISTERED');
		}
		if (change.field === 'what_when') for (const suggested of change.value) {
			const original = draft.events.find((event) => event.eventId === suggested.eventId);
			if (original?.sourceEvent && (original.sourceEvidenceId !== suggested.sourceEvidenceId || original.startMs !== suggested.startMs ||
				original.endMs !== suggested.endMs || original.label !== suggested.label)) throw new Error('SCENE_ASSISTANT_REVIEWED_EVENT_BINDING_IMMUTABLE');
		}
	}
	return parsed;
}

export function applySceneAssistantChangesV1(draft: SceneAssistantDraftV1, changes: readonly SceneAssistantPatchV1['changes'][number][], selectedChangeIds: readonly string[]): SceneAssistantDraftV1 {
	const selected = new Set(selectedChangeIds);
	const next = structuredClone(draft);
	for (const rawChange of changes) {
		if (!selected.has(rawChange.changeId)) continue;
		const change = SceneAssistantChangeV1Schema.parse({ field: rawChange.field, value: rawChange.value });
		if (change.field === 'where') {
			next.environmentKind = change.value.environmentKind;
			next.objects = change.value.objects.map((item) => ({ ...item, positionMeters: requiredVector3(item.positionMeters) }));
		}
		else if (change.field === 'who') next.actors = change.value;
		else if (change.field === 'what_when') next.events = change.value.map((suggested) => {
			const original = draft.events.find((event) => event.eventId === suggested.eventId);
			const normalized = { ...suggested, fromMeters: requiredVector3(suggested.fromMeters), toMeters: requiredVector3(suggested.toMeters) };
			return original?.sourceEvent ? { ...normalized, sourceEvent: original.sourceEvent } : normalized;
		});
		else if (change.field === 'why') next.why = change.value;
		else if (change.field === 'how') next.how = change.value;
	}
	const actorIds = new Set(next.actors.map((actor) => actor.actorId));
	const objectIds = new Set(next.objects.map((object) => object.objectId));
	if (new Set(next.actors.map((actor) => actor.actorId)).size !== next.actors.length ||
		new Set(next.objects.map((object) => object.objectId)).size !== next.objects.length ||
		new Set(next.events.map((event) => event.eventId)).size !== next.events.length ||
		next.events.some((event) => {
			const refs = [{ kind: event.targetKind, targetId: event.targetId }, ...(event.additionalTargets ?? [])];
			return refs.some((target) => target.kind === 'actor' ? !actorIds.has(target.targetId) : !objectIds.has(target.targetId)) || (event.sourceEvidenceId !== '' && !next.selectedEvidenceIds.includes(event.sourceEvidenceId));
		}) ||
		next.actors.some((actor) => actor.evidenceIds.some((sourceId) => !next.selectedEvidenceIds.includes(sourceId)))) {
		throw new Error('SCENE_ASSISTANT_PATCH_BREAKS_DRAFT_REFERENCES');
	}
	return next;
}
