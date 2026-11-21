<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { createActor } from 'xstate';
import { requestScenePreviewV1, ScenePreviewRequestErrorV1 } from '$lib/reconstruction/request-scene-preview-v1.js';
	import { z } from 'zod';
	import { CaseSceneFetchParametersInputV1Schema } from '$lib/reconstruction/case-scene-fetch-contract-v1.js';
	import { buildCaseScenePlanDraftV1, restoreCaseSceneDraftV1, type SceneDraftActorV1, type SceneDraftEventV1, type SceneDraftObjectV1 } from '$lib/reconstruction/case-scene-plan-draft-v1.js';
	import { scenePreviewDraftV1Schema, type ScenePreviewAnnotationV1 } from '$lib/reconstruction/scene-preview-draft-v1.js';
	import { SceneGenerationPlanV1Schema, type SceneGenerationPlanV1 } from '$lib/reconstruction/scene-generation-plan-v1.js';
	import { compileSceneRuntimeRecipeV1 } from '$lib/reconstruction/scene-runtime-recipe-v1.js';
	import SceneRuntimeRecipeCanvas from './SceneRuntimeRecipeCanvas.svelte';
	import type { CaseSceneIntakeContextV1 } from '$lib/reconstruction/case-scene-fetch-contract-v1.js';
	import { SCENE_PRIMITIVE_KINDS_V1 } from '$lib/splat/scene-primitive-registry-v1.js';
	import { searchSceneAuthoringCatalogV1, type SceneAuthoringCatalogEntryV1 } from '$lib/reconstruction/scene-authoring-catalog-v1.js';
	import { sceneDocumentV1Schema, type SceneDocumentV1 } from '$lib/splat/scene-document-v1.js';
	import { ChatSession } from '$lib/models/ChatSession.svelte.js';
	import {
		applySceneAssistantChangesV1, buildSceneAssistantPromptV1, createSceneAssistantDraftTokenV1, sceneAssistantChatIdV1,
		parseSceneAssistantPatchV1, type SceneAssistantDraftV1, type SceneAssistantPatchV1
	} from '$lib/reconstruction/scene-assistant-patch-v1.js';
	import { setTheSceneWorkflowMachineV1, type SetTheSceneRequestV1, type SceneWorkflowStateV1 } from '$lib/reconstruction/set-the-scene-workflow-v1.js';

	type EvidenceOption = { id: string; title: string; mimeType: string | null };
	let { caseId, caseSceneIntake, evidenceItems, setSceneRequest = null, setSceneRequestError = null, scenePersistenceEnabled = false }: {
		caseId: string; caseSceneIntake: CaseSceneIntakeContextV1 | null; evidenceItems: EvidenceOption[];
		setSceneRequest?: SetTheSceneRequestV1 | null; setSceneRequestError?: string | null; scenePersistenceEnabled?: boolean;
	} = $props();
	let startMode = $state<'blockout' | 'evidence'>('blockout');
	let environmentKind = $state<'urban' | 'beach' | 'indoor' | 'four-bedroom-house'>('urban');
	let selectedEvidenceIds = $state<string[]>([]);
	let actors = $state<SceneDraftActorV1[]>([
		{ actorId: 'ACTOR-01', label: 'Person 01 · unidentified visual handle', appearance: 'Neutral generated placeholder; not a source identification', evidenceIds: [] }
	]);
	let objects = $state<SceneDraftObjectV1[]>([]);
	let catalogQuery = $state('');
	const catalogResults = $derived(searchSceneAuthoringCatalogV1(catalogQuery, 8));
	let events = $state<SceneDraftEventV1[]>([]);
	let targetEditorEventId = $state('');
	let whyBrief = $state<SceneAssistantDraftV1['why']>({ status: 'unknown', text: '', evidenceIds: [] });
	let howBrief = $state<SceneAssistantDraftV1['how']>({ status: 'unknown', text: '', evidenceIds: [] });
	let assistantQuestion = $state('');
	let assistantStatus = $state<'idle' | 'thinking' | 'streaming'>('idle');
	let assistantStreamText = $state('');
	let assistantError = $state('');
	let assistantPatch = $state<SceneAssistantPatchV1 | null>(null);
	let assistantSummary = $state('');
	let selectedChangeIds = $state<string[]>([]);
	let assistantSession: ChatSession | null = null;
	let assistantRequestToken = 0;
	let nextEventNumber = 1;
	let preview = $state.raw<{
		plan: SceneGenerationPlanV1;
		recipe: ReturnType<typeof compileSceneRuntimeRecipeV1>;
		revision?: { manifest: SceneDocumentV1; manifestSha256: string };
	} | null>(null);
	let proposal = $state.raw<typeof preview>(null);
	let busy = $state(false);
	let previewStage = $state<'parameters' | 'plan' | null>(null);
	let activeRequest: AbortController | null = null;
	let reviewedEventsRequest: AbortController | null = null;
	const workflowActor = createActor(setTheSceneWorkflowMachineV1);
	let workflowState = $state<SceneWorkflowStateV1>('idle');
	const workflowSubscription = workflowActor.subscribe((snapshot) => { workflowState = snapshot.value as SceneWorkflowStateV1; });
	let workflowMounted = false;
	onDestroy(() => { activeRequest?.abort(); reviewedEventsRequest?.abort(); assistantRequestToken++; assistantSession?.destroy(); workflowSubscription.unsubscribe(); workflowActor.stop(); });
	let saving = $state(false);
	let canEdit = $state(true);
	let annotations = $state<ScenePreviewAnnotationV1[]>([]);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let sceneId = $state<string | null>(null);
	const selectedEvidence = $derived(evidenceItems.filter((item) => selectedEvidenceIds.includes(item.id)));
	const targetEditorEvent = $derived(events.find((event) => event.eventId === targetEditorEventId) ?? events[0] ?? null);
	const reviewedEventSchema = z.object({
		eventId: z.uuid(), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(),
		label: z.string().min(1).max(160), reviewStatus: z.string(), sceneAdmission: z.string()
	});
	const reviewedTimelineSchema = z.object({
		caseId: z.uuid(), evidenceId: z.uuid(), sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/i), analysisRevision: z.string().min(1).max(256),
		events: z.array(reviewedEventSchema).max(4096)
	});
	let videoSource = $state('');
	let reviewedTimeline = $state.raw<z.infer<typeof reviewedTimelineSchema> | null>(null);
	let loadingEvents = $state(false);
	let reviewError = $state('');
	const reviewedEvents = $derived(reviewedTimeline?.evidenceId === videoSource && selectedEvidenceIds.includes(videoSource)
		? reviewedTimeline.events.filter((event) => event.reviewStatus === 'APPROVED' &&
			event.sceneAdmission === 'APPROVED_FOR_SCENE_PROPOSAL' && event.endMs > event.startMs) : []);
	$effect(() => {
		const nextCaseId = caseId;
		if (!workflowMounted || workflowActor.getSnapshot().context.caseId === nextCaseId) return;
		// A route can reuse this component while changing cases. Abort every in-flight
		// request and discard the old case draft before accepting the new case context.
		activeRequest?.abort(); activeRequest = null;
		reviewedEventsRequest?.abort(); reviewedEventsRequest = null;
		assistantRequestToken++; assistantSession?.destroy(); assistantSession = null;
		busy = false; saving = false; previewStage = null;
		preview = null; proposal = null; sceneId = null; annotations = [];
		selectedEvidenceIds = []; objects = []; events = [];
		startMode = 'blockout'; environmentKind = 'urban'; assistantQuestion = ''; nextEventNumber = 1;
		error = null; notice = null; canEdit = true;
		actors = [{ actorId: 'ACTOR-01', label: 'Person 01 · unidentified visual handle', appearance: 'Neutral generated placeholder; not a source identification', evidenceIds: [] }];
		whyBrief = { status: 'unknown', text: '', evidenceIds: [] };
		howBrief = { status: 'unknown', text: '', evidenceIds: [] };
		assistantPatch = null; selectedChangeIds = []; assistantSummary = '';
		assistantStatus = 'idle'; assistantStreamText = ''; assistantError = '';
		videoSource = ''; reviewedTimeline = null; loadingEvents = false; reviewError = ''; targetEditorEventId = '';
		workflowActor.send({ type: 'START', caseId: nextCaseId });
		workflowActor.send({ type: 'ACCESS_GRANTED' });
		workflowActor.send({ type: 'INPUTS_READY' });
		if (setSceneRequest) {
			startMode = setSceneRequest.mode;
			selectedEvidenceIds = setSceneRequest.sourceEvidenceIds.filter((id) => evidenceItems.some((item) => item.id === id));
			assistantQuestion = setSceneRequest.prompt;
			if (setSceneRequest.caseId !== nextCaseId || selectedEvidenceIds.length !== setSceneRequest.sourceEvidenceIds.length ||
				(setSceneRequest.mode === 'evidence' && selectedEvidenceIds.length === 0)) {
				workflowActor.send({ type: 'NEEDS_INPUT', message: 'Choose sources available in this case, or switch to an illustrative blockout.' });
			}
		}
	});

	async function loadReviewedEvents() {
		const source = videoSource;
		if (!source) return;
		reviewedEventsRequest?.abort();
		const controller = new AbortController();
		reviewedEventsRequest = controller;
		loadingEvents = true;
		reviewError = '';
		reviewedTimeline = null;
		try {
			const response = await fetch(`/api/evidence/${encodeURIComponent(source)}/video-events`, { cache: 'no-store', signal: controller.signal });
			if (!response.ok) throw new Error('Could not load reviewed events for this video.');
			const result = await response.json();
			if (reviewedEventsRequest !== controller || controller.signal.aborted || videoSource !== source || !selectedEvidenceIds.includes(source)) return;
			if (result.eventTimeline == null) {
				reviewError = 'No current event timeline is available.';
				return;
			}
			const timeline = reviewedTimelineSchema.parse(result.eventTimeline);
			if (timeline.caseId !== caseId || timeline.evidenceId !== source) throw new Error('The timeline scope does not match this case.');
			reviewedTimeline = timeline;
		} catch (cause) {
			if (reviewedEventsRequest === controller && !controller.signal.aborted && videoSource === source) reviewError = cause instanceof Error ? cause.message : 'Could not load reviewed events.';
		} finally {
			if (reviewedEventsRequest === controller) { reviewedEventsRequest = null; loadingEvents = false; }
		}
	}

	function addReviewedEvent(eventId: string) {
		const event = reviewedEvents.find((item) => item.eventId === eventId);
		if (!event || !reviewedTimeline || events.length >= 128) return;
		const evidenceId = reviewedTimeline.evidenceId;
		addEvent();
		updateEvent(events.length - 1, {
			label: event.label, sourceEvidenceId: evidenceId, cueType: 'custom', action: 'none',
			startMs: event.startMs, endMs: event.endMs,
			sourceEvent: {
				sourceEvidenceId: evidenceId, sourceEventId: event.eventId, analysisRevision: reviewedTimeline.analysisRevision,
				startMs: event.startMs, endMs: event.endMs
			}
		});
	}

	onMount(() => {
		workflowMounted = true;
		workflowActor.start();
		workflowActor.send({ type: 'START', caseId });
		workflowActor.send({ type: 'ACCESS_GRANTED' });
		workflowActor.send({ type: 'INPUTS_READY' });
		if (setSceneRequest) {
			startMode = setSceneRequest.mode;
			selectedEvidenceIds = setSceneRequest.sourceEvidenceIds.filter((id) => evidenceItems.some((item) => item.id === id));
			assistantQuestion = setSceneRequest.prompt;
			if (setSceneRequest.caseId !== caseId || selectedEvidenceIds.length !== setSceneRequest.sourceEvidenceIds.length ||
				(setSceneRequest.mode === 'evidence' && selectedEvidenceIds.length === 0)) {
				workflowActor.send({ type: 'NEEDS_INPUT', message: 'Choose at least one available source from this case, or switch to an illustrative blockout.' });
			}
		}
		const query = new URLSearchParams(window.location.search);
		const id = query.get('previewScene');
		const number = query.get('previewRevision');
		if (!id || !number) return;
		const controller = new AbortController();
		busy = true;
		void (async () => {
			try {
				const response = await fetch(`/api/cases/${caseId}/scenes/${encodeURIComponent(id)}/revisions?${new URLSearchParams({ revision: number })}`, {
					cache: 'no-store', signal: controller.signal
				});
				const result = await response.json();
				if (!response.ok) throw new Error(result.message ?? 'Could not reopen scene');
				const document = sceneDocumentV1Schema.parse(result.data?.manifest);
				const draft = document.proceduralPreviewDraft;
				if (!draft || document.caseId !== caseId || document.sceneId !== id || String(document.revision) !== number ||
					!/^[0-9a-f]{64}$/.test(result.data?.manifestSha256 ?? '')) throw new Error('This revision does not match the requested scene draft');
				if (controller.signal.aborted) return;
				preview = { plan: draft.plan, recipe: compileSceneRuntimeRecipeV1(draft.plan),
					revision: { manifest: document, manifestSha256: result.data.manifestSha256 } };
				annotations = draft.annotations;
				sceneId = document.sceneId;
				notice = `Opened saved draft revision ${document.revision} with its original evidence references.`;
				try {
					const restored = restoreCaseSceneDraftV1(draft.plan);
					environmentKind = restored.kind;
					selectedEvidenceIds = restored.evidenceIds;
					actors = restored.actors;
					objects = restored.objects;
					events = restored.events;
					whyBrief = restored.why;
					howBrief = restored.how;
				} catch (cause) {
					canEdit = false;
					notice = cause instanceof Error ? cause.message : 'The saved plan is available for viewing.';
				}
			} catch (cause) {
				if (!controller.signal.aborted) error = cause instanceof Error ? cause.message : 'Could not reopen scene';
			} finally {
				if (!controller.signal.aborted) busy = false;
			}
		})();
		return () => controller.abort();
	});
	const envOptions = [
		{ value: 'urban', label: 'City / urban area' },
		{ value: 'beach', label: 'Beach / shoreline' },
		{ value: 'indoor', label: 'Single room' },
		{ value: 'four-bedroom-house', label: 'Four-bedroom house' }
	] as const;

	function toggleEvidence(id: string) {
		selectedEvidenceIds = selectedEvidenceIds.includes(id) ? selectedEvidenceIds.filter((item) => item !== id) : [...selectedEvidenceIds, id];
	}
	function addActor() {
		if (actors.length >= 64) return;
		let number = actors.length + 1;
		while (actors.some((actor) => actor.actorId === `ACTOR-${String(number).padStart(2, '0')}`)) number += 1;
		actors = [...actors, { actorId: `ACTOR-${String(number).padStart(2, '0')}`, label: `Person ${String(number).padStart(2, '0')} · unidentified visual handle`, appearance: 'Neutral generated placeholder; identity and role unresolved', evidenceIds: [] }];
	}
	function addObject() {
		if (objects.length >= 100) return;
		let number = objects.length + 1;
		while (objects.some((object) => object.objectId === `OBJECT-${String(number).padStart(2, '0')}`)) number += 1;
		objects = [...objects, { objectId: `OBJECT-${String(number).padStart(2, '0')}`, registryId: 'box', label: `Prop ${String(number).padStart(2, '0')}`, positionMeters: [number * 1.5, 0, 0] }];
	}
	function addCatalogObject(entry: SceneAuthoringCatalogEntryV1) {
		if (objects.length >= 100) return;
		let number = 1;
		while (objects.some((object) => object.objectId === `OBJECT-${String(number).padStart(2, '0')}`)) number += 1;
		objects = [...objects, {
			objectId: `OBJECT-${String(number).padStart(2, '0')}`,
			registryId: entry.kind,
			label: `${entry.label} · illustrative`,
			positionMeters: [number * 1.5, 0, 0]
		}];
	}
	function addEvent() {
		if (events.length >= 128) return;
		while (events.some((event) => event.eventId === `EVENT-${String(nextEventNumber).padStart(2, '0')}`)) nextEventNumber += 1;
		const number = nextEventNumber++;
		const target = objects[0] ? { targetKind: 'primitive' as const, targetId: objects[0].objectId } : { targetKind: 'actor' as const, targetId: actors[0]?.actorId ?? 'ACTOR-01' };
		const eventId = `EVENT-${String(number).padStart(2, '0')}`;
		events = [...events, { eventId, label: '', cueType: target.targetKind === 'primitive' ? 'timed_prop' : 'custom', sourceEvidenceId: selectedEvidenceIds[0] ?? '', startMs: 0, endMs: 10_000, uncertaintyMs: 0, ...target, additionalTargets: [], action: target.targetKind === 'primitive' ? 'visible' : 'move', fromMeters: [0, 0, 0], toMeters: [2, 0, 0] }];
		targetEditorEventId = eventId;
	}
	function updateEvent(index: number, patch: Partial<SceneDraftEventV1>) {
		const next = { ...events[index]!, ...patch };
		if ('targetKind' in patch || 'targetId' in patch) {
			const primary = `${next.targetKind}:${next.targetId}`;
			next.additionalTargets = (next.additionalTargets ?? []).filter((target) => `${target.kind}:${target.targetId}` !== primary);
		}
		events[index] = next;
	}
	function updateAdditionalTargets(event: SceneDraftEventV1, input: HTMLSelectElement) {
		const primary = `${event.targetKind}:${event.targetId}`;
		const additionalTargets = Array.from(input.selectedOptions, (option) => option.value)
			.filter((value) => value !== primary)
			.map((value) => {
				const separator = value.indexOf(':');
				return { kind: value.slice(0, separator) as 'actor' | 'primitive', targetId: value.slice(separator + 1) };
			});
		const index = events.findIndex((item) => item.eventId === event.eventId);
		if (index >= 0) updateEvent(index, { additionalTargets });
	}
	function updateActor(index: number, patch: Partial<SceneDraftActorV1>) { actors[index] = { ...actors[index]!, ...patch }; }
	function updateObject(index: number, patch: Partial<SceneDraftObjectV1>) { objects[index] = { ...objects[index]!, ...patch }; }
	function parseCoordinateTriplet(value: string): [number, number, number] | null {
		const parts = value.split(',').map((part) => Number(part.trim()));
		return parts.length === 3 && parts.every(Number.isFinite) ? [parts[0]!, parts[1]!, parts[2]!] : null;
	}

	function assistantDraftSnapshot(): SceneAssistantDraftV1 {
		const timeline = reviewedTimeline?.evidenceId === videoSource && selectedEvidenceIds.includes(videoSource) ? {
			evidenceId: reviewedTimeline.evidenceId,
			sourceRevision: reviewedTimeline.sourceRevision,
			analysisRevision: reviewedTimeline.analysisRevision,
			clockId: `evidence:${reviewedTimeline.evidenceId}`,
			events: reviewedEvents.map(({ eventId, label, startMs, endMs }) => ({ eventId, label, startMs, endMs }))
				.sort((left, right) => left.eventId.localeCompare(right.eventId))
		} : null;
		const activeEvent = targetEditorEvent;
		const activeTimeWindow = activeEvent && selectedEvidenceIds.includes(activeEvent.sourceEvidenceId) ? {
			evidenceId: activeEvent.sourceEvidenceId,
			clockId: `evidence:${activeEvent.sourceEvidenceId}`,
			startMs: activeEvent.startMs,
			endMs: activeEvent.endMs,
			binding: activeEvent.sourceEvent ? 'reviewed_source_event' as const : 'draft_hypothesis' as const
		} : null;
		return structuredClone($state.snapshot({ environmentKind, selectedEvidenceIds, selectedVideoTimeline: timeline, activeTimeWindow, actors, objects, events, why: whyBrief, how: howBrief })) as SceneAssistantDraftV1;
	}

	async function assertAssistantTimelineFresh(snapshot: SceneAssistantDraftV1) {
		const expected = snapshot.selectedVideoTimeline;
		if (!expected) return;
		const response = await fetch(`/api/evidence/${encodeURIComponent(expected.evidenceId)}/video-events`, { cache: 'no-store' });
		if (!response.ok) throw new Error('Could not recheck the selected video timeline. Reload reviewed events before applying suggestions.');
		const result = await response.json();
		const parsed = reviewedTimelineSchema.safeParse(result.eventTimeline);
		if (!parsed.success || parsed.data.caseId !== caseId || parsed.data.evidenceId !== expected.evidenceId ||
			parsed.data.sourceRevision !== expected.sourceRevision || parsed.data.analysisRevision !== expected.analysisRevision) {
			throw new Error('The selected video source or analysis revision changed. Reload reviewed events and request new suggestions.');
		}
		const currentEvents = parsed.data.events.filter((event) => event.reviewStatus === 'APPROVED' && event.sceneAdmission === 'APPROVED_FOR_SCENE_PROPOSAL')
			.map(({ eventId, label, startMs, endMs }) => ({ eventId, label, startMs, endMs }))
			.sort((left, right) => left.eventId.localeCompare(right.eventId));
		if (JSON.stringify(currentEvents) !== JSON.stringify(expected.events)) {
			throw new Error('The reviewed event intervals changed. Reload reviewed events and request new suggestions.');
		}
	}

	function readAssistantJson(content: string): unknown {
		const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
		return JSON.parse(normalized);
	}

	async function requestAssistantSuggestions() {
		const question = assistantQuestion.trim();
		if (!question || assistantStatus !== 'idle' || !canEdit) return;
		const requestToken = ++assistantRequestToken;
		assistantSession?.destroy();
		const session = new ChatSession(sceneAssistantChatIdV1(caseId), [], true);
		assistantSession = session;
		assistantError = ''; assistantPatch = null; assistantSummary = ''; assistantStreamText = '';
		assistantStatus = 'thinking';
		const snapshot = assistantDraftSnapshot();
		try {
			const baseDraftToken = await createSceneAssistantDraftTokenV1(snapshot);
			if (requestToken !== assistantRequestToken) return;
			const prompt = `${buildSceneAssistantPromptV1({
				baseDraftToken, caseIntake: caseSceneIntake, draft: snapshot,
				evidence: selectedEvidence.map(({ id, title, mimeType }) => ({ id, title, mimeType }))
			})}\n\nUSER_REQUEST: ${question}`;
			const monitor = window.setInterval(() => {
				if (requestToken !== assistantRequestToken) return;
				assistantStatus = session.status === 'streaming' ? 'streaming' : session.status === 'thinking' ? 'thinking' : 'idle';
				assistantStreamText = [...session.messages].reverse().find((message) => message.role === 'assistant')?.content ?? '';
			}, 100);
			try {
				await session.sendMessage(prompt, { forceServer: true, caseId, enableTools: false });
			} finally {
				window.clearInterval(monitor);
			}
			if (requestToken !== assistantRequestToken) return;
			if (session.lastSource !== 'server-generation') throw new Error('The configured case assistant did not use its authorized server context. Try again when it is available.');
			if (session.error) throw new Error(session.error);
			const content = [...session.messages].reverse().find((message) => message.role === 'assistant')?.content;
			if (!content) throw new Error('The assistant returned no proposal.');
			await assertAssistantTimelineFresh(snapshot);
			const currentToken = await createSceneAssistantDraftTokenV1(assistantDraftSnapshot());
			if (currentToken !== baseDraftToken) throw new Error('The draft changed while the assistant was working. Your edits were kept; request suggestions again for the current draft.');
			const patch = parseSceneAssistantPatchV1(readAssistantJson(content), baseDraftToken, snapshot, SCENE_PRIMITIVE_KINDS_V1);
			if (!patch.changes.length) throw new Error('No grounded changes were proposed. The current fields were left unchanged.');
			assistantPatch = patch; assistantSummary = patch.summary;
			selectedChangeIds = patch.changes.map((change) => change.changeId);
			assistantQuestion = '';
		} catch (cause) {
			if (requestToken === assistantRequestToken) assistantError = cause instanceof Error ? cause.message : 'Assistant suggestion failed.';
		} finally {
			if (requestToken === assistantRequestToken) {
				assistantStatus = 'idle'; assistantStreamText = ''; assistantSession = null; session.destroy();
			}
		}
	}

	function cancelAssistantRequest() {
		assistantRequestToken++;
		assistantSession?.destroy(); assistantSession = null;
		assistantStatus = 'idle'; assistantStreamText = '';
	}

	async function applyAssistantSuggestions() {
		if (!assistantPatch || !selectedChangeIds.length) return;
		try {
			const currentDraft = assistantDraftSnapshot();
			await assertAssistantTimelineFresh(currentDraft);
			const token = await createSceneAssistantDraftTokenV1(currentDraft);
			if (token !== assistantPatch.baseDraftToken) throw new Error('The draft changed after the suggestions arrived. Request fresh suggestions before applying them.');
			const next = applySceneAssistantChangesV1(assistantDraftSnapshot(), assistantPatch.changes, selectedChangeIds);
			environmentKind = next.environmentKind; selectedEvidenceIds = next.selectedEvidenceIds;
			actors = next.actors; objects = next.objects; events = next.events; whyBrief = next.why; howBrief = next.how;
			assistantPatch = null; selectedChangeIds = [];
			notice = 'Selected assistant suggestions were applied to the form. Generate a scene preview when ready.';
		} catch (cause) {
			assistantError = cause instanceof Error ? cause.message : 'Could not apply assistant suggestions.';
		}
	}

	function cancelPreview() {
		if (!activeRequest) return;
		activeRequest.abort();
		activeRequest = null;
		previewStage = null;
		busy = false;
		workflowActor.send({ type: 'CANCEL' });
		notice = 'Preview preparation canceled.';
	}

	function retryAfterSourceRefresh() {
		if (workflowState !== 'stale') return;
		workflowActor.send({ type: 'RETRY' });
		workflowActor.send({ type: 'ACCESS_GRANTED' });
		workflowActor.send({ type: 'INPUTS_READY' });
	}

	async function generatePreview() {
		if (busy || saving || !canEdit) return;
		const controller = new AbortController();
		activeRequest = controller;
		workflowActor.send({ type: 'BUILD_PROPOSAL' });
		busy = true; error = null; notice = null;
		previewStage = 'parameters';
		try {
			if ((actors.some((actor) => actor.evidenceIds.some((id) => !selectedEvidenceIds.includes(id)))) || events.some((event) => event.sourceEvidenceId && !selectedEvidenceIds.includes(event.sourceEvidenceId))) {
				throw new Error('Choose each event source from the selected case evidence.');
			}
			if (events.some((event) => !event.label.trim() || event.endMs <= event.startMs)) {
				throw new Error('Each event needs a description and a valid interval on its selected clock.');
			}
			const nextSceneId = sceneId ?? crypto.randomUUID(); sceneId = nextSceneId;
			const expectedRevision = preview?.revision?.manifest.revision ?? 0;
			const edits = $state.snapshot({ actors, objects, events, environmentKind });
			const fetchInput = CaseSceneFetchParametersInputV1Schema.parse({
				sceneId: nextSceneId, expectedRevision, sourceEvidenceIds: selectedEvidenceIds,
				brief: {
					who: actors.map(({ actorId, label, appearance, evidenceIds }) => ({ actorId, label, appearance, evidenceIds })),
					what: events.filter((event) => event.sourceEvidenceId).map((event) => ({ eventId: event.eventId, what: event.label, status: 'hypothesis' as const, evidenceIds: [event.sourceEvidenceId], timeLanes: [{ evidenceId: event.sourceEvidenceId, clockId: `evidence:${event.sourceEvidenceId}`, startMs: event.startMs, endMs: event.endMs, uncertaintyMs: event.uncertaintyMs }] })),
					why: { status: whyBrief.status, ...(whyBrief.text ? { text: whyBrief.text } : {}), evidenceIds: whyBrief.evidenceIds },
					how: { status: howBrief.status, ...(howBrief.text ? { description: howBrief.text } : {}), evidenceIds: howBrief.evidenceIds }
				}, environment: { kind: environmentKind, cellSizeMeters: 32, coordinateStatus: 'illustrative_uncalibrated' as const }
			});
			const scope = { caseId, sceneId: nextSceneId, expectedSceneRevision: expectedRevision };
			const basePlan = preview?.plan;
			const result = await requestScenePreviewV1({
				caseId: scope.caseId, parameters: fetchInput, signal: controller.signal,
				buildCandidate: (parameters) => buildCaseScenePlanDraftV1({ ...scope, parameters, seed: 1, ...edits, basePlan }),
				onValidate: () => { previewStage = 'plan'; }
			});
			if (activeRequest !== controller || controller.signal.aborted) return;
			const plan = SceneGenerationPlanV1Schema.parse(result);
			if (plan.caseId !== caseId || plan.caseId !== scope.caseId || plan.sceneId !== nextSceneId ||
				plan.expectedSceneRevision !== expectedRevision) throw new Error('The returned plan did not match this scene revision.');
			if (preview?.plan.planHash !== plan.planHash) {
				const previous = preview?.plan;
				const retained = scenePreviewDraftV1Schema.safeParse({ schema: 'parent-atlas.scene-preview-draft/v1', plan, annotations });
				const changedSource = annotations.some((note) => {
					const before = previous?.events.find((event) => event.eventId === note.eventId);
					const after = plan.events.find((event) => event.eventId === note.eventId);
					return before?.clock.evidenceId !== after?.clock.evidenceId ||
						JSON.stringify(before?.sourceEvent) !== JSON.stringify(after?.sourceEvent) ||
						previous?.sources.find((source) => source.evidenceId === before?.clock.evidenceId)?.sourceRevision !==
							plan.sources.find((source) => source.evidenceId === after?.clock.evidenceId)?.sourceRevision;
				});
				if (!retained.success || changedSource) throw new Error('An existing note no longer matches the proposed event, source, or object. Export or remove that note before changing its binding.');
			}
			proposal = { plan, recipe: compileSceneRuntimeRecipeV1(plan), revision: preview?.revision };
			workflowActor.send({ type: 'PROPOSAL_VALID' });
			notice = 'Proposal validated. Review its sources, event clocks, objects, and assumptions before generating the preview.';
		} catch (cause) {
			if (activeRequest === controller && !controller.signal.aborted) {
				error = cause instanceof Error ? cause.message : 'Scene preview could not be generated.';
				if (cause instanceof ScenePreviewRequestErrorV1 && cause.sourceStale) workflowActor.send({ type: 'SOURCE_STALE' });
				else workflowActor.send({ type: 'PROPOSAL_INVALID', message: error });
			}
		} finally {
			if (activeRequest === controller) {
				activeRequest = null;
				previewStage = null;
				busy = false;
			}
		}
	}

	function loadScenePreview() {
		if (!proposal || busy || saving) return;
		const unchangedPreview = preview?.plan.planHash === proposal.plan.planHash;
		workflowActor.send({ type: 'LOAD_SCENE' });
		preview = proposal;
		proposal = null;
		if (unchangedPreview) queueMicrotask(handlePreviewReady);
	}

	function handlePreviewReady() {
		workflowActor.send({ type: 'SCENE_READY' });
		notice = 'Three.js preview ready. All generated geometry and actor actions remain illustrative.';
	}

	function handlePreviewFailed(message: string) {
		workflowActor.send({ type: 'SCENE_FAILED', message });
	}
</script>

<section class="builder" aria-labelledby="scene-builder-title">
	<div class="intro"><div><p class="eyebrow">CASE SCENE WORKSPACE</p><h2 id="scene-builder-title">Build an editable scene</h2><p>Choose a blockout-first or evidence-first start. Both stay in this case workspace and produce an illustrative preview.</p></div>
		<div class="start-choice"><button type="button" aria-pressed={startMode === 'blockout'} class:chosen={startMode === 'blockout'} onclick={() => startMode = 'blockout'}>Build blockout first</button><button type="button" aria-pressed={startMode === 'evidence'} class:chosen={startMode === 'evidence'} onclick={() => startMode = 'evidence'}>Add evidence first</button></div>
	</div>
	{#if setSceneRequestError}<p class="error" role="alert">{setSceneRequestError}</p>{/if}
	<p class="workflow-status" role="status">Workflow: {workflowState.replaceAll('_', ' ')}{workflowState === 'error' && workflowActor.getSnapshot().context.error ? ` · ${workflowActor.getSnapshot().context.error}` : workflowState === 'stale' ? ' · Source evidence or scene revision changed; refresh the source snapshot before retrying.' : ''}</p>
	{#if workflowState === 'stale'}<button type="button" onclick={retryAfterSourceRefresh}>Refresh source snapshot</button>{/if}
	{#if caseSceneIntake}<details class="intake"><summary>Case intake · user supplied and unverified</summary><dl>{#each [['Who', caseSceneIntake.who], ['What', caseSceneIntake.what], ['When', caseSceneIntake.when], ['Where', caseSceneIntake.where], ['Why', caseSceneIntake.why], ['How', caseSceneIntake.how]] as [label, value]}<dt>{label}</dt><dd>{value ?? 'Not supplied'}</dd>{/each}</dl></details>{/if}
	<div class="builder-grid">
		{#if canEdit}
		<div class="inputs" data-start-mode={startMode}>
			<section class="assistant-step" aria-label="Case scene assistant">
				<h3>Ask the case assistant</h3>
				<p class="hint">It can suggest edits to Who, What/When, Where, Why, and How using this case context and selected evidence. Suggestions stay provisional. They do not change case intake, approve claims, render geometry, or save the scene.</p>
				<label>Your request<textarea rows="3" maxlength="1200" bind:value={assistantQuestion} placeholder="Organize the selected evidence into separate source-clock event proposals…" disabled={assistantStatus !== 'idle'}></textarea></label>
				<div class="actions"><button type="button" onclick={requestAssistantSuggestions} disabled={!assistantQuestion.trim() || assistantStatus !== 'idle'}>{assistantStatus === 'idle' ? 'Ask for suggestions' : 'Assistant working…'}</button>
					{#if assistantStatus !== 'idle'}<button type="button" onclick={cancelAssistantRequest}>Cancel</button>{/if}</div>
				{#if assistantStreamText}<details open><summary>{assistantStatus === 'streaming' ? 'Streaming draft response' : 'Assistant response'}</summary><pre>{assistantStreamText}</pre></details>{/if}
				{#if assistantError}<p class="error" role="alert">{assistantError}</p>{/if}
				{#if assistantPatch}<div class="suggestions"><strong>Proposed field changes</strong><p>{assistantSummary}</p>
					{#each assistantPatch.changes as change (change.changeId)}<label class="suggestion"><input type="checkbox" checked={selectedChangeIds.includes(change.changeId)} onchange={() => { selectedChangeIds = selectedChangeIds.includes(change.changeId) ? selectedChangeIds.filter((id) => id !== change.changeId) : [...selectedChangeIds, change.changeId]; }} />
						<span><b>{change.field.replace('_', ' / ')}</b><small>{change.rationale} · Uncertainty: {change.uncertainty}</small><code>{JSON.stringify(change.value)}</code><small>Source references: {change.sourceEvidenceIds.join(', ') || 'None; illustrative proposal'}</small></span></label>{/each}
					<button type="button" onclick={applyAssistantSuggestions} disabled={!selectedChangeIds.length}>Apply selected suggestions to form</button>
				</div>{/if}
			</section>
			<section class="environment-step"><h3>Environment</h3><label>Scene shape<select bind:value={environmentKind}>{#each envOptions as option}<option value={option.value}>{option.label}</option>{/each}</select></label><p class="hint">World coordinates are illustrative and uncalibrated. This preview places repeated assets efficiently in one scene area; large-world streaming remains future work.</p></section>
			<section class="evidence-step"><h3>Case evidence</h3><p class="hint">Choose only sources relevant to this scene. Each event uses one source clock lane.</p>
				{#if evidenceItems.length}<ul class="evidence-list">{#each evidenceItems as item (item.id)}<li><label><input type="checkbox" checked={selectedEvidenceIds.includes(item.id)} onchange={() => toggleEvidence(item.id)} /><span>{item.title || 'Untitled evidence'}<small>{item.mimeType ?? 'Media type unavailable'} · {item.id.slice(0, 8)}</small></span></label></li>{/each}</ul>{:else}<p>No evidence available. You can still make an evidence-free blockout.</p>{/if}
			</section>
			<section class="objects-step"><h3>People and scene objects</h3><p class="hint">People are pseudonymous visual handles. A scene proxy does not establish identity, age, or role.</p>
				{#each actors as actor, index (actor.actorId)}<div class="entity"><strong>{actor.actorId}</strong><label>Label<input value={actor.label} oninput={(event) => updateActor(index, { label: (event.currentTarget as HTMLInputElement).value })} /></label><label>Description<input value={actor.appearance} oninput={(event) => updateActor(index, { appearance: (event.currentTarget as HTMLInputElement).value })} /></label></div>{/each}
				<div class="actions"><button type="button" onclick={addActor} disabled={actors.length >= 64}>Add person handle</button><button type="button" onclick={addObject} disabled={objects.length >= 100}>Add box blockout</button></div>
				<div class="catalog-picker"><label>Primitive catalog · local recipes<input type="search" bind:value={catalogQuery} placeholder="Search sphere, flat panel, column…" /></label><p class="hint">Searches the versioned source-code geometry registry. These are primitive blockout shapes, not evidence-derived objects or a stored asset library.</p><div class="catalog-results" aria-label="Primitive catalog results">
					{#each catalogResults as entry (entry.id)}<button type="button" class="catalog-entry" onclick={() => addCatalogObject(entry)} disabled={objects.length >= 100}><span>{entry.label}</span><small>{entry.kind} · {entry.dimensionsMeters.join(' × ')} m · estimated triangles R/B/D: {entry.triangleEstimates.retro}/{entry.triangleEstimates.balanced}/{entry.triangleEstimates.detailed} · illustrative</small></button>{/each}
					{#if catalogResults.length === 0}<p class="hint">No matching primitive recipes.</p>{/if}
				</div></div>
				{#each objects as object, index (object.objectId)}<div class="entity"><strong>{object.objectId}</strong><label>Object label<input value={object.label} oninput={(event) => updateObject(index, { label: (event.currentTarget as HTMLInputElement).value })} /></label><label>Primitive<select value={object.registryId} onchange={(event) => updateObject(index, { registryId: (event.currentTarget as HTMLInputElement).value })}>{#each SCENE_PRIMITIVE_KINDS_V1 as kind}<option value={kind}>{kind}</option>{/each}</select></label><label>Position · x,y,z meters<input value={object.positionMeters.join(', ')} oninput={(event) => { const position = parseCoordinateTriplet((event.currentTarget as HTMLInputElement).value); if (position) updateObject(index, { positionMeters: position }); }} /></label></div>{/each}
			</section>
			<section class="events-step"><h3>Events and source times</h3><p class="hint">Enter elapsed milliseconds within one source clock. For wall-clock reports, preserve the quoted time wording in the description; do not convert it to media time until a reviewed alignment exists. Overnight source-local intervals must pass midnight monotonically (the end value is later than the start).</p>
				{#each events as event, index (event.eventId)}<div class="entity event-form"><strong>{event.eventId} · {event.sourceEvent ? "reviewed source, illustrative cue" : "hypothesis / review pending"}</strong><label>Description<input value={event.label} placeholder="Reported activity; cite and review before treating as a finding" oninput={(input) => updateEvent(index, { label: (input.currentTarget as HTMLInputElement).value })} /></label><label>Timeline clock<select disabled={!!event.sourceEvent} value={event.sourceEvidenceId} onchange={(input) => updateEvent(index, { sourceEvidenceId: (input.currentTarget as HTMLInputElement).value })}><option value="">Scene time (illustrative)</option>{#each selectedEvidence as item (item.id)}<option value={item.id}>{item.title || item.id}</option>{/each}</select></label><div class="time-row"><label>Start ms<input type="number" min="0" readonly={!!event.sourceEvent} value={event.startMs} oninput={(input) => updateEvent(index, { startMs: Number((input.currentTarget as HTMLInputElement).value) })} /></label><label>End ms<input type="number" min="1" readonly={!!event.sourceEvent} value={event.endMs} oninput={(input) => updateEvent(index, { endMs: Number((input.currentTarget as HTMLInputElement).value) })} /></label><label>Uncertainty ms<input type="number" min="0" value={event.uncertaintyMs} oninput={(input) => updateEvent(index, { uncertaintyMs: Number((input.currentTarget as HTMLInputElement).value) })} /></label></div><label>Event type<select value={event.cueType} onchange={(input) => updateEvent(index, { cueType: (input.currentTarget as HTMLInputElement).value as SceneDraftEventV1['cueType'] })}><option value="custom">Reported event</option><option value="timed_prop">Timed prop</option><option value="enter">Entry proposal</option><option value="exit">Exit proposal</option><option value="move">Movement proposal</option><option value="alarm">Alarm proposal</option><option value="evacuate">Evacuation proposal</option><option value="interview">Interview statement</option><option value="interact">Interaction proposal</option></select></label><label>Target<select value={`${event.targetKind}:${event.targetId}`} onchange={(input) => { const [kind, id] = (input.currentTarget as HTMLInputElement).value.split(':'); if (kind === 'actor' && id) updateEvent(index, { targetKind: 'actor', targetId: id }); else if (kind === 'primitive' && id) updateEvent(index, { targetKind: 'primitive', targetId: id }); }}><optgroup label="People">{#each actors as person (person.actorId)}<option value={`actor:${person.actorId}`}>{person.label}</option>{/each}</optgroup><optgroup label="Props">{#each objects as prop (prop.objectId)}<option value={`primitive:${prop.objectId}`}>{prop.label}</option>{/each}</optgroup></select></label><label>Presentation behavior<select value={event.action} onchange={(input) => updateEvent(index, { action: (input.currentTarget as HTMLInputElement).value as SceneDraftEventV1['action'] })}><option value="none">Timeline marker only</option><option value="visible">Show target only during interval</option><option value="move">Move target along illustrative path</option><option value="pulse">Pulse a light at the target</option></select></label>{#if event.action === 'move'}<div class="time-row"><label>From x,y,z<input value={event.fromMeters.join(', ')} oninput={(input) => { const value = parseCoordinateTriplet((input.currentTarget as HTMLInputElement).value); if (value) updateEvent(index, { fromMeters: value }); }} /></label><label>To x,y,z<input value={event.toMeters.join(', ')} oninput={(input) => { const value = parseCoordinateTriplet((input.currentTarget as HTMLInputElement).value); if (value) updateEvent(index, { toMeters: value }); }} /></label></div>{/if}{#if event.action === 'pulse'}<p class="hint">Illustrative point light pulses only within this selected source-clock interval; it does not establish that a light was observed.</p>{/if}<button type="button" onclick={() => { events = events.filter((item) => item.eventId !== event.eventId); }}>Remove event</button></div>{/each}
				<button type="button" onclick={addEvent} disabled={events.length >= 128}>Add timed event</button>
				{#if selectedEvidence.some((item) => item.mimeType?.startsWith('video/'))}
					<label>Video with reviewed events
						<select value={videoSource} onchange={(event) => {
							const nextSource = (event.currentTarget as HTMLSelectElement).value;
							if (nextSource !== videoSource) {
								reviewedEventsRequest?.abort(); reviewedEventsRequest = null;
								loadingEvents = false; reviewedTimeline = null; reviewError = ''; videoSource = nextSource;
							}
						}}>
							<option value="">Choose a selected video</option>
							{#each selectedEvidence.filter((item) => item.mimeType?.startsWith('video/')) as item (item.id)}
								<option value={item.id}>{item.title || item.id}</option>
							{/each}
						</select>
					</label>
					<button type="button" onclick={loadReviewedEvents} disabled={!selectedEvidenceIds.includes(videoSource) || loadingEvents}>
						{loadingEvents ? 'Loading…' : 'Load reviewed events'}
					</button>
					{#if reviewError}<p role="status">{reviewError}</p>{/if}
					{#if reviewedTimeline?.evidenceId === videoSource}
						{#if reviewedEvents.length}
							<label>Add reviewed source event
								<select value="" disabled={events.length >= 128} onchange={(change) => {
									const select = change.currentTarget as HTMLSelectElement;
									addReviewedEvent(select.value);
									select.value = '';
								}}>
									<option value="">Choose an event</option>
									{#each reviewedEvents as event (event.eventId)}
										<option value={event.eventId}>{event.label} · {event.startMs}–{event.endMs} ms</option>
									{/each}
								</select>
							</label>
						{:else}<p>No approved events are available for this video.</p>{/if}
					{/if}
				{/if}
			</section>
			<section class="events-step additional-targets" aria-label="Event targets">
				<h3>Bind events to people and props</h3>
				<p class="hint">One cue may affect several registered objects. All targets share this event’s source clock; clocks are never merged here.</p>
				<label>Event<select value={targetEditorEvent?.eventId ?? ''} onchange={(event) => targetEditorEventId = (event.currentTarget as HTMLSelectElement).value}>
					<option value="">Choose an event</option>{#each events as event (event.eventId)}<option value={event.eventId}>{event.eventId} · {event.label || 'Untitled event'}</option>{/each}
				</select></label>
				{#if targetEditorEvent}
					<label>Additional actor and prop targets<select multiple size="5"
						value={(targetEditorEvent.additionalTargets ?? []).map((target) => `${target.kind}:${target.targetId}`)}
						onchange={(event) => updateAdditionalTargets(targetEditorEvent!, event.currentTarget as HTMLSelectElement)}>
						<optgroup label="People">{#each actors as actor (actor.actorId)}<option value={`actor:${actor.actorId}`}>{actor.label}</option>{/each}</optgroup>
						<optgroup label="Props">{#each objects as object (object.objectId)}<option value={`primitive:${object.objectId}`}>{object.label}</option>{/each}</optgroup>
					</select></label>
					<p class="hint">The primary target remains attached separately. Every selection here adds another person or prop target.</p>
				{/if}
			</section>
			<section class="narrative-step"><h3>Why and How · proposal only</h3><p class="hint">Unknown is a valid answer. Hypotheses remain unreviewed until a reviewer checks their cited evidence.</p>
				<label>Why status<select value={whyBrief.status} onchange={(event) => whyBrief = { ...whyBrief, status: (event.currentTarget as HTMLSelectElement).value as typeof whyBrief.status }}><option value="unknown">Unknown</option><option value="hypothesis">Hypothesis</option><option value="disputed">Disputed proposal</option></select></label>
				<label>Why / motive proposal<textarea rows="2" maxlength="1000" value={whyBrief.text} oninput={(event) => whyBrief = { ...whyBrief, text: (event.currentTarget as HTMLTextAreaElement).value }} placeholder="Leave blank when unknown"></textarea></label>
				<label>Why citations<select multiple size="3" value={whyBrief.evidenceIds} onchange={(event) => whyBrief = { ...whyBrief, evidenceIds: Array.from((event.currentTarget as HTMLSelectElement).selectedOptions, (option) => option.value) }}>{#each selectedEvidence as item (item.id)}<option value={item.id}>{item.title || item.id}</option>{/each}</select></label>
				<label>How status<select value={howBrief.status} onchange={(event) => howBrief = { ...howBrief, status: (event.currentTarget as HTMLSelectElement).value as typeof howBrief.status }}><option value="unknown">Unknown</option><option value="hypothesis">Hypothesis</option><option value="disputed">Disputed proposal</option></select></label>
				<label>How / method proposal<textarea rows="2" maxlength="1000" value={howBrief.text} oninput={(event) => howBrief = { ...howBrief, text: (event.currentTarget as HTMLTextAreaElement).value }} placeholder="Leave blank when unknown"></textarea></label>
				<label>How citations<select multiple size="3" value={howBrief.evidenceIds} onchange={(event) => howBrief = { ...howBrief, evidenceIds: Array.from((event.currentTarget as HTMLSelectElement).selectedOptions, (option) => option.value) }}>{#each selectedEvidence as item (item.id)}<option value={item.id}>{item.title || item.id}</option>{/each}</select></label>
			</section>
			<button class="generate" type="button" onclick={generatePreview} disabled={busy || saving}>{busy ? 'Preparing proposal…' : proposal ? 'Refresh proposal' : 'Prepare scene proposal'}</button>
			{#if previewStage}
				<p role="status">{previewStage === 'parameters' ? 'Checking selected evidence…' : 'Validating the scene plan…'}</p>
				<button type="button" onclick={cancelPreview}>Cancel preview preparation</button>
			{/if}
			{#if error}<p class="error" role="alert">{error}</p>{/if}{#if notice}<p class="notice" role="status">{notice}</p>{/if}
		</div>
		{:else}<p role="status">{notice}</p>{/if}
		{#if proposal}
			<section class="proposal-review" aria-label="Scene proposal review">
				<h3>Review proposal before rendering</h3>
				<p>Illustrative {proposal.plan.environment.kind} scene · {proposal.plan.environment.coordinateStatus.replaceAll('_', ' ')} · no identity or guilt determination.</p>
				<h4>Actors and props</h4><p>{proposal.plan.actors.length} neutral actor placeholder(s); {proposal.plan.primitives.length} registered primitive(s); {proposal.plan.placements.length} placement(s).</p>
				<h4>Timed events and assumptions</h4>
				<ul>{#each proposal.plan.events as event (event.eventId)}<li>{event.label} · {event.status} · {event.clock.clockId}: {event.clock.startMs}–{event.clock.endMs} ms</li>{/each}</ul>
				<p>Independent source clocks remain separate. Motive and method: {proposal.plan.narrative.why.status} / {proposal.plan.narrative.how.status}.</p>
				<h4>Source citations</h4><ul>{#each proposal.plan.sources as source (source.evidenceId)}<li><a href={`/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(source.evidenceId)}`}>{evidenceItems.find((item) => item.id === source.evidenceId)?.title || source.evidenceId}</a> · {source.sourceRevision}</li>{/each}</ul>
				<button class="generate" type="button" onclick={loadScenePreview} disabled={busy || saving}>Generate Preview</button>
			</section>
		{/if}
		{#if preview}
			<div class="preview" aria-label="Generated scene preview">
				{#key preview.plan.planHash}
					<SceneRuntimeRecipeCanvas plan={preview.plan} recipe={preview.recipe} revision={preview.revision} {evidenceItems}
						bind:annotations bind:saving preparing={busy} persistenceEnabled={scenePersistenceEnabled}
						onObjectSelected={(objectId) => workflowActor.send({ type: 'SELECT_OBJECT', objectId })}
						onSaveRequested={() => workflowActor.send({ type: 'SAVE_REQUESTED' })}
						onSaveFailed={(message) => workflowActor.send({ type: 'SAVE_FAILED', message })}
						onPreviewReady={handlePreviewReady} onPreviewFailed={handlePreviewFailed}
						onSaved={(revision) => { workflowActor.send({ type: 'SAVE_SUCCEEDED' }); if (preview) preview = { ...preview, revision }; }} />
				{/key}
			</div>
		{:else if !proposal}
			<div class="placeholder"><strong>Scene preview appears here</strong><p>The server must first confirm the case, source revisions, scene revision, and references.</p></div>
		{/if}
	</div>
</section>

<style>
	.builder{margin:1rem 0;padding:1rem;background:#f8f6f1;border:1px solid #d5d0c5;border-radius:.5rem;color:#1e2a31}.intro{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.eyebrow{font-size:.7rem;font-weight:800;letter-spacing:.14em;color:#9a6617;margin:0}.intro h2{margin:.2rem 0}.intro p,.hint{color:#536068;font-size:.84rem}.start-choice,.actions{display:flex;flex-wrap:wrap;gap:.4rem}.builder button{cursor:pointer;border:1px solid #bbc0c0;border-radius:.3rem;background:#fff;padding:.5rem .7rem;color:#1e2a31}.builder button:disabled{opacity:.55;cursor:not-allowed}.start-choice button.chosen{border-color:#b87813;background:#fff0cf}.intake{margin:.8rem 0;padding:.6rem;background:#fff;border:1px solid #dedbd3}.intake dl{display:grid;grid-template-columns:7rem 1fr;gap:.35rem;margin:.5rem 0}.intake dt{font-weight:700}.intake dd{margin:0}.builder-grid{display:grid;grid-template-columns:minmax(18rem,.8fr) minmax(0,1.4fr);gap:1rem;margin-top:1rem}.inputs{display:grid;gap:.75rem}.inputs section{padding:.8rem;background:#fff;border:1px solid #ddd9d0;border-radius:.35rem}.inputs h3{margin:0 0 .35rem;font-size:1rem}.inputs label{display:grid;gap:.25rem;margin:.5rem 0;font-size:.8rem}.inputs input:not([type=checkbox]),.inputs select{min-height:2.2rem;width:100%;box-sizing:border-box;padding:.4rem;border:1px solid #c4c7c7;border-radius:.25rem;background:#fff}.evidence-list{list-style:none;margin:0;padding:0;max-height:13rem;overflow:auto}.evidence-list li{padding:.35rem 0;border-bottom:1px solid #eee}.evidence-list label{display:flex;align-items:flex-start;gap:.5rem}.evidence-list small{display:block;color:#626d73}.entity{margin:.5rem 0;padding:.65rem;background:#f7f7f4;border:1px solid #e3e0d8;border-radius:.3rem}.entity>strong{font-size:.8rem}.catalog-picker{margin:.65rem 0;padding:.65rem;background:#f7f7f4;border:1px solid #e3e0d8;border-radius:.3rem}.catalog-results{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.4rem}.catalog-entry{display:grid;text-align:left;gap:.2rem}.catalog-entry span{font-weight:700}.catalog-entry small{color:#536068}.time-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.4rem}.event-form{border-left:3px solid #ca9635}.generate{font-weight:700;background:#f3c96d!important;border-color:#d8a837!important}.notice{padding:.6rem;background:#e9f4ed;border-left:3px solid #53916c}.error{color:#8a1924}.preview{min-width:0}.placeholder{display:grid;place-content:center;min-height:20rem;text-align:center;padding:1rem;border:1px dashed #a8afb1;color:#536068}.placeholder p{max-width:30rem}@media(max-width:1100px){.builder-grid{grid-template-columns:1fr}.intro{display:grid}.time-row{grid-template-columns:1fr}}
	.inputs[data-start-mode='blockout'] .environment-step{order:1}.inputs[data-start-mode='blockout'] .objects-step{order:2}.inputs[data-start-mode='blockout'] .evidence-step{order:3}.inputs[data-start-mode='blockout'] .events-step{order:4}
	.inputs[data-start-mode='evidence'] .evidence-step{order:1}.inputs[data-start-mode='evidence'] .events-step{order:2}.inputs[data-start-mode='evidence'] .environment-step{order:3}.inputs[data-start-mode='evidence'] .objects-step{order:4}
	.inputs textarea{width:100%;box-sizing:border-box;padding:.5rem;border:1px solid #c4c7c7;border-radius:.25rem;font:inherit}.assistant-step{border-top:3px solid #6586a8!important}.assistant-step pre{max-height:16rem;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f7;padding:.6rem;font-size:.72rem}.suggestions{display:grid;gap:.4rem;margin-top:.7rem}.suggestion{display:grid!important;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:.55rem!important;padding:.55rem;background:#f7f8fa;border:1px solid #d9e0e5;border-radius:.3rem}.suggestion input{width:auto!important;min-height:auto!important;margin-top:.2rem}.suggestion span{display:grid;gap:.25rem;min-width:0}.suggestion small{color:#536068}.suggestion code{max-height:7rem;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.7rem}
	.proposal-review{padding:.9rem;margin:.5rem 0;background:#fffdf7;border:1px solid #c9ae73;border-left:4px solid #b87813;border-radius:.35rem}.proposal-review h3{margin:.1rem 0 .5rem}.proposal-review h4{margin:.7rem 0 .2rem}.proposal-review ul{padding-left:1.25rem}.workflow-status{font-size:.78rem;color:#475761}
</style>
