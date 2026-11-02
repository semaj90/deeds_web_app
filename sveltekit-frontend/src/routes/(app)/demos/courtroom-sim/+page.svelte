<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { CourtroomScene } from '$lib/courtroom/courtroom-scene.svelte.js';
	import type { ModelDef } from '$lib/courtroom/courtroom-scene.svelte.js';
	import { TimelineEngine } from '$lib/courtroom/timeline-engine.svelte.js';
	import type { TimelineKeyframe } from '$lib/courtroom/timeline-engine.svelte.js';
	import { ROLE_COLORS } from '$lib/courtroom/courtroom-types.js';
	import { sampleStory, type State as StoryState } from '$lib/courtroom/story/engine.js';
	import { ActorRegistry } from '$lib/courtroom/runtime/actor-runtime.js';
	import { createSceneAdapter } from '$lib/courtroom/runtime/scene-adapter.js';
	import { CourtroomSimulation } from '$lib/courtroom/runtime/simulation.js';
	import { createSessionPresentationStory, sessionActorIdForRole } from '$lib/courtroom/runtime/session-presentation.js';
	import { makeDialogueRequest, requestDialogue, type DialogueProposal } from '$lib/courtroom/runtime/ai-context.js';
	import StrategyWizard from '$lib/components/courtroom/StrategyWizard.svelte';
	import CourtroomDemoTutorial from '$lib/components/courtroom/CourtroomDemoTutorial.svelte';
	import LoadingAssistant from '$lib/components/courtroom/LoadingAssistant.svelte';
	import CourtroomActionBar from '$lib/components/courtroom/CourtroomActionBar.svelte';
	import CourtroomTimelinePanel from '$lib/components/courtroom/CourtroomTimelinePanel.svelte';
	import { animForUserText } from '$lib/courtroom/text-emotion-v1.js';
	import CourtroomEvidenceSearch from '$lib/components/courtroom/CourtroomEvidenceSearch.svelte';
	import CourtroomCastDialog from '$lib/components/courtroom/CourtroomCastDialog.svelte';
	import CourtroomCoordinateReadout from '$lib/components/courtroom/CourtroomCoordinateReadout.svelte';
	import CourtroomLevelPanel from '$lib/components/courtroom/CourtroomLevelPanel.svelte';
	import { deriveLevel1, type MoveOutcome } from '$lib/courtroom/demo-level1-v1.js';
	import type { CourtroomView } from '$lib/courtroom/courtroom-types.js';
	import CourtroomProgressOrbit from '$lib/components/courtroom/CourtroomProgressOrbit.svelte';
	import { OBJECTIONS, actionBarButtons, type ActionId } from '$lib/courtroom/courtroom-hud-v1.js';

	let { data } = $props();

	// ── Types ──
	interface DialogueEntry {
		phase: string;
		turn: number;
		speaker: string;
		role: string;
		content: string;
		canonRefs: string[];
		timestamp: string;
	}

	/** Shape returned by GET /api/simulation (the list endpoint names the id `id`, the phase by name, progress as 'n/total'). */
	interface SessionSummary {
		id: string;
		caseNumber: string;
		status: string;
		currentPhase: string;
		progress: string;
		charge: string;
		defendant: string;
		createdAt: string;
	}

	interface InsightPopup {
		text: string;
		x: number;
		y: number;
		analysis: string;
		loading: boolean;
	}

	// ── State ──
	let view = $state<'lobby' | 'courtroom'>('lobby');
	let sessionId = $state<string | null>(null);
	let sessionData = $state<Record<string, any> | null>(null);
	let dialogue = $state<DialogueEntry[]>([]);
	let activeSessions = $state<SessionSummary[]>([]);
	let isLoading = $state(false);
	let isAdvancing = $state(false);
	let error = $state('');
	let selectedCategory = $state('all');
	let searchQuery = $state('');
	let showEvidence = $state(false);
	let showStrategy = $state(false);
	let showLog = $state(false);
	let crtEnabled = $state(false);
	let textAnimating = $state(false);
	let displayedText = $state('');
	let currentSpeaker = $state('');
	let currentRole = $state('');
	let insight = $state<InsightPopup | null>(null);
	// The app shell puts a header above this page, so a fixed 100vh-60px pushed the bottom bars off-screen.
	let wrapperEl = $state<HTMLDivElement | null>(null);
	let wrapperHeight = $state<string | undefined>(undefined);
	function fitWrapper() {
		if (!wrapperEl) return;
		const top = wrapperEl.getBoundingClientRect().top + window.scrollY;
		wrapperHeight = `${Math.max(360, Math.floor(window.innerHeight - top))}px`;
	}
	let userInputMode = $state(false);
	let userInputText = $state('');
	let scriptedMode = $state(false);
	let showDemoTutorial = $state(false);
	let scriptedStoryState = $state<StoryState | null>(null);
	let scriptedPlaying = $state(false);
	let movementReceipt = $state<{ actorId: string; station: string; outcome: string; position: { x: number; z: number } | null } | null>(null);
	let scene = new CourtroomScene();
	let dialogueProposal = $state<DialogueProposal | null>(null);
	let dialogueProposalAccepted = $state(false);
	let dialogueProposalLoading = $state(false);
	let dialogueProposalError = $state('');
	let storySimulation: CourtroomSimulation | null = null;
	// Level 1 demo: the adapter the local story already uses, kept so the controls issue the same validated moves.
	let storyAdapter: ReturnType<typeof createSceneAdapter> | null = null;
	let camerasSeen = $state<CourtroomView[]>([]);
	$effect(() => {
		if (!scriptedMode || !scene.isReady) return;
		const view = scene.currentView;
		if (!camerasSeen.includes(view)) camerasSeen = [...camerasSeen, view];
	});
	let level1 = $derived(
		deriveLevel1({
			sceneReady: scene.isReady,
			storyTick: scriptedStoryState?.tick ?? null,
			cameraPreset: scene.currentView,
			camerasSeen,
			activeActor: scene.activeCharacter ?? null,
			move: movementReceipt
				? { actorId: movementReceipt.actorId, station: movementReceipt.station, outcome: movementReceipt.outcome as MoveOutcome, position: movementReceipt.position }
				: null
		})
	);
	function issueDemoMove(station: string) {
		if (!storyAdapter?.moveActor) return;
		movementReceipt = null;
		storyAdapter.moveActor('jester', station);
	}

	let sessionPresentationSimulation: CourtroomSimulation | null = null;
	let unsubscribeStory: (() => void) | null = null;

	// ── Babylon Scene ──
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let dialogueBoxEl = $state<HTMLDivElement | null>(null);

	// ── Timeline Engine ──
	let timeline = new TimelineEngine();
	let showTimeline = $state(false);
	let showCast = $state(false);
	let showCoords = $state(false);
	let timelineLoading = $state(false);

	// ── Derived timeline state ──
	let timelineProgress = $derived(timeline.progress);
	let timelineState = $derived(timeline.state);
	let timelineDuration = $derived(timeline.totalDurationMs);
	let timelineCurrentTime = $derived(timeline.currentTimeMs);

	// ── Derived ──
	let filteredCases = $derived.by(() => {
		let cases = data.fictionalCases;
		if (selectedCategory !== 'all') {
			cases = cases.filter((c: Record<string, any>) => c.category === selectedCategory);
		}
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			cases = cases.filter(
				(c: Record<string, any>) =>
					c.charge.toLowerCase().includes(q) ||
					c.defendantName.toLowerCase().includes(q) ||
					c.category.toLowerCase().includes(q) ||
					(c.jurisdiction ?? '').toLowerCase().includes(q),
			);
		}
		return cases;
	});

	let categories = $derived.by((): string[] => {
		const cats = new Set(data.fictionalCases.map((c: Record<string, any>) => String(c.category)));
		return ['all', ...Array.from(cats).sort()] as string[];
	});

	let currentPhaseName = $derived(sessionData?.phases?.[sessionData?.currentPhase] ?? '');
	let progress = $derived(
		scriptedMode
			? Math.min(100, ((scriptedStoryState?.tick ?? 0) / 450) * 100)
			: sessionData ? ((sessionData.currentPhase + 1) / (sessionData.phases?.length ?? 1)) * 100 : 0,
	);

	// ── Lifecycle ──
	$effect(() => {
		if (!wrapperEl) return;
		fitWrapper();
		window.addEventListener('resize', fitWrapper);
		return () => window.removeEventListener('resize', fitWrapper);
	});

	onMount(() => {
		loadActiveSessions();
		loadModels();

		// Wire timeline engine → courtroom scene
		timeline.onKeyframeReached((kf) => {
			if (scene.isReady) {
					const sessionProjection = sessionId && !scriptedMode
						? sessionPresentationSimulation
						: null;
					const actorId = sessionProjection ? sessionActorIdForRole(kf.characterRole) : null;
					if (sessionProjection && actorId && kf.animType) {
						sessionProjection.dispatch({ type: 'SCENE_ANIMATION', actorId, animation: kf.animType });
						scene.executeKeyframe(kf, { skipAnimation: true });
					} else {
					scene.executeKeyframe(kf);
				}
				// Sync dialogue display to timeline
				if (kf.dialogueTurn != null && kf.animType === 'speaking') {
					const entry = dialogue.find((d) => d.turn === kf.dialogueTurn);
					if (entry) {
						currentSpeaker = entry.speaker;
						currentRole = entry.role;
						typewriterText(entry.content);
					}
				}
			}
		});

		const handler = (e: KeyboardEvent) => {
			if (view !== 'courtroom' || userInputMode) return;
			if (scriptedMode) {
				if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advanceScriptedStory(); }
				if (e.key === 'Escape') {
					if (showCast || showTimeline || showCoords || showEvidence || showLog || showStrategy || insight) {
						showCast = false;
						showTimeline = false;
						showCoords = false;
						showEvidence = false;
						showLog = false;
						showStrategy = false;
						insight = null;
					} else {
						backToLobby();
					}
				}
				// View-only toggles also work in the local preview (they change what is shown, never the story).
				if (e.key === 'p' || e.key === 'P') showTimeline = !showTimeline;
				if (e.key === 'i' || e.key === 'I') showCast = !showCast;
				if (e.key === 'g' || e.key === 'G') showCoords = !showCoords;
				if (e.key === 'e' || e.key === 'E') showEvidence = !showEvidence;
				if (e.key === 'l' || e.key === 'L') showLog = !showLog;
				return;
			}
			if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advanceTurn('next_turn'); }
			if (e.key === 'o' || e.key === 'O') advanceTurn('objection', { objectionType: 'hearsay', objectionBasis: 'Rule 802' });
			if (e.key === 'h' || e.key === 'H') advanceTurn('objection', { objectionType: 'relevance', objectionBasis: 'Rule 401/403' });
			if (e.key === 't' || e.key === 'T') advanceTurn('objection', { objectionType: 'foundation', objectionBasis: 'Insufficient foundation' });
			if (e.key === 's' || e.key === 'S') showStrategy = !showStrategy;
			if (e.key === 'e' || e.key === 'E') showEvidence = !showEvidence;
			if (e.key === 'l' || e.key === 'L') showLog = !showLog;
			if (e.key === 'n' || e.key === 'N') advanceTurn('next_phase');
			if (e.key === 'p' || e.key === 'P') { showTimeline = !showTimeline; }
			if (e.key === 'i' || e.key === 'I') { showCast = !showCast; }
			if (e.key === 'g' || e.key === 'G') { showCoords = !showCoords; }
			if (e.key === 'Escape') { insight = null; showStrategy = false; showLog = false; }
			if (e.key === 'r' || e.key === 'R') { userInputMode = true; }
		};
		window.addEventListener('keydown', handler);
		return () => {
			window.removeEventListener('keydown', handler);
			stopStoryRuntime();
			timeline.dispose();
		};
	});

	// Init Babylon when canvas appears, then load models + timeline
	$effect(() => {
		if (canvasEl && view === 'courtroom' && !scene.isReady) {
			scene.init(canvasEl).then(() => {
				void loadModels().then(() => {
					if (scriptedMode) startStoryRuntime();
				else if (sessionId) startSessionPresentationRuntime();
				});
				if (sessionId) loadTimeline();
			});
		}
	});

	// React to new dialogue: switch camera + typewriter text
	$effect(() => {
		if (dialogue.length > 0 && scene.isReady) {
			const latest = dialogue[dialogue.length - 1];
			currentSpeaker = latest.speaker;
			currentRole = latest.role;
			scene.showCharacter(latest.role);
			typewriterText(latest.content);
		}
	});

	// React to phase changes
	$effect(() => {
		if (sessionData?.currentPhase != null && scene.isReady) {
			const phase = sessionData.phases?.[sessionData.currentPhase];
			if (phase) scene.setPhase(phase);
		}
	});

	// CRT toggle
	$effect(() => {
		if (scene.isReady) {
			scene.setCRT(crtEnabled);
		}
	});

	// ── Typewriter ──
	let typewriterTimer: ReturnType<typeof setTimeout> | null = null;

	function typewriterText(text: string) {
		if (typewriterTimer) clearTimeout(typewriterTimer);
		displayedText = '';
		textAnimating = true;
		let i = 0;
		const speed = 15;
		function tick() {
			if (i < text.length) {
				displayedText = text.slice(0, i + 1);
				i++;
				typewriterTimer = setTimeout(tick, speed);
			} else {
				textAnimating = false;
			}
		}
		tick();
	}

	function skipTypewriter() {
		if (typewriterTimer) clearTimeout(typewriterTimer);
		if (dialogue.length > 0) {
			displayedText = dialogue[dialogue.length - 1].content;
		}
		textAnimating = false;
	}

	// ── Interactive Text Click → LLM Insight ──
	async function handleTextClick(e: MouseEvent) {
		if (textAnimating) { skipTypewriter(); return; }

		const selection = window.getSelection();
		const selectedText = selection?.toString().trim();
		if (!selectedText || selectedText.length < 3) return;

		// Position popup near click
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		insight = {
			text: selectedText,
			x: e.clientX - rect.left,
			y: e.clientY - rect.top - 80,
			analysis: '',
			loading: true,
		};

		try {
			const res = await fetch(`/api/simulation/${sessionId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'next_turn',
					userInput: `[ANALYZE] Explain the legal significance of: "${selectedText}" — in the context of this case, what does this mean for the defense/prosecution strategy?`,
				}),
			});
			if (res.ok) {
				const data = await res.json();
				await loadSessionState(sessionId!);
				const latest = data.newDialogue?.[0];
				insight = { ...insight!, analysis: latest?.content ?? 'Analysis generated — see dialogue.', loading: false };
			} else {
				insight = { ...insight!, analysis: `"${selectedText}" — This statement is legally significant. Select text and the LLM will analyze its implications for the case strategy.`, loading: false };
			}
		} catch {
			insight = { ...insight!, analysis: 'Analysis unavailable — check connection.', loading: false };
		}
	}

	function handleDialogueEntryClick(entry: DialogueEntry) {
		currentSpeaker = entry.speaker;
		currentRole = entry.role;
		typewriterText(entry.content);
		if (scene.isReady) scene.showCharacter(entry.role);
	}

	// ── User Response Input ──
	function submitUserInput() {
		if (!userInputText.trim()) { userInputMode = false; return; }
		// The witness reacts to what the user (prosecution) just said; offline lexicon, no model wait.
		if (scene.isReady) scene.playAnimation('witness', animForUserText(userInputText));
		advanceTurn('next_turn', { userInput: userInputText.trim() });
		userInputText = '';
		userInputMode = false;
	}

	// ── API Functions ──
	async function loadActiveSessions() {
		try {
			const res = await fetch('/api/simulation');
			if (res.ok) {
				const d = await res.json();
				activeSessions = d.sessions ?? [];
			}
		} catch { /* optional */ }
	}

	async function startSimulation(fictionalCaseId: string) {
		stopStoryRuntime();
		scriptedMode = false;
		isLoading = true;
		error = '';
		try {
			const res = await fetch('/api/simulation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fictionalCaseId }),
			});
			const result = await res.json();
			if (!res.ok) { error = result.error ?? 'Failed to start simulation'; return; }
			sessionId = result.sessionId;
			dialogue = result.dialogue ?? [];
			await loadSessionState(result.sessionId);
			view = 'courtroom';
		} catch { error = 'Network error starting simulation'; }
		finally { isLoading = false; }
	}

	async function resumeSession(sid: string) {
		stopStoryRuntime();
		scriptedMode = false;
		isLoading = true;
		error = '';
		try {
			sessionId = sid;
			await loadSessionState(sid);
			view = 'courtroom';
		} catch { error = 'Failed to resume session'; }
		finally { isLoading = false; }
	}

	async function loadSessionState(sid: string) {
		const res = await fetch(`/api/simulation/${sid}`);
		if (!res.ok) throw new Error('Failed to load session');
		const result = await res.json();
		sessionData = result.session ?? result;
		dialogue = sessionData?.dialogueHistory ?? [];
	}

	async function advanceTurn(action: string, extra?: Record<string, string>) {
		if (!sessionId || isAdvancing) return;
		if (textAnimating) { skipTypewriter(); return; }
		isAdvancing = true;
		error = '';
		try {
			const res = await fetch(`/api/simulation/${sessionId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, ...extra }),
			});
			const result = await res.json();
			if (!res.ok) { error = result.error ?? 'Failed to advance'; return; }
			if (action === 'objection' && scene.isReady) scene.triggerObjection();
			await loadSessionState(sessionId);
			if (result.status === 'completed') sessionData = { ...sessionData!, status: 'completed' };
		} catch { error = 'Network error advancing simulation'; }
		finally { isAdvancing = false; }
	}

	async function abandonSession() {
		if (!sessionId) return;
		try { await fetch(`/api/simulation/${sessionId}`, { method: 'DELETE' }); } catch { /* best effort */ }
		backToLobby();
	}

	/** Load 3D models from the database (if any registered) */
	async function loadModels() {
		try {
			const res = await fetch('/api/courtroom/models');
			if (!res.ok) {
				if (scene.isReady) await scene.loadModels([]);
				return;
			}
			const data = await res.json();
			if (data.models?.length > 0 && scene.isReady) {
				const modelDefs: ModelDef[] = data.models
					.filter((m: any) => m.role !== 'environment')
					.map((m: any) => ({
					role: m.role,
					modelUrl: m.modelUrl,
					scale: m.scale,
					animations: m.animations?.map((a: any) => ({
						name: a.name,
						url: a.animationUrl,
						animType: a.animType,
					})),
				}));
				await scene.loadModels(modelDefs);
			} else if (scene.isReady) {
				await scene.loadModels([]);
			}
		} catch {
			if (scene.isReady) await scene.loadModels([]);
		}
	}

	async function startScriptedPreview() {
		stopStoryRuntime();
		scriptedMode = true;
		showDemoTutorial = true;
		scriptedStoryState = null;
		movementReceipt = null;
		dialogueProposal = null;
		dialogueProposalAccepted = false;
		dialogueProposalError = '';
		sessionId = null;
		sessionData = null;
		dialogue = [];
		error = '';
		view = 'courtroom';
		if (scene.isReady) {
			await loadModels();
			startStoryRuntime();
		}
	}

	function acceptScriptedDialogueProposal() {
		const proposal = dialogueProposal;
		const state = scriptedStoryState;
		if (!proposal || !state || !storySimulation || dialogueProposalAccepted) return;
		const evidenceMatches = proposal.evidenceIds.length === state.evidence.length &&
			proposal.evidenceIds.every((id, index) => id === state.evidence[index]);
		if (proposal.phase !== state.phase || !evidenceMatches || !sampleStory.actors.some((actor) => actor.id === proposal.actorId)) {
			dialogueProposalError = 'This suggestion is stale because the story phase or evidence changed. Request a fresh suggestion.';
			return;
		}
		storySimulation.dispatch({
			type: 'ACCEPT_DIALOGUE_PROPOSAL',
			actorId: proposal.actorId,
			expectedPhase: proposal.phase,
			expectedEvidenceIds: proposal.evidenceIds,
			text: proposal.text,
			intent: proposal.intent,
		});
		dialogueProposalAccepted = true;
	}

	function startStoryRuntime() {
		if (!scriptedMode || !scene.isReady || storySimulation) return;
		const registry = ActorRegistry.fromStory(sampleStory);
		const adapter = createSceneAdapter(scene, registry, {
			onDialogue: (actorId, text) => {
				const actor = registry.find(actorId);
				const role = actor?.role === 'jester' ? 'defense' : (actor?.role ?? 'witness');
				dialogue = [...dialogue, {
					phase: scriptedStoryState?.phase ?? 'lobby',
					turn: dialogue.length + 1,
					speaker: actor?.name ?? actorId,
					role,
					content: text,
					canonRefs: [],
					timestamp: new Date().toISOString(),
				}];
			},
			onCueSettled: ({ actorId, clip, outcome }) => {
				if (!clip.startsWith('move:')) return;
				const station = clip.slice('move:'.length);
				storySimulation?.dispatch({
					type: 'MOVE_SETTLED',
					actorId,
					station,
					outcome,
				});
				const actor = registry.find(actorId);
				const role = actor?.role === 'jester' ? 'defense' : actor?.role;
				movementReceipt = { actorId, station, outcome, position: role ? scene.getPosition(role) : null };
			},
		});
		storyAdapter = adapter;
		storySimulation = new CourtroomSimulation(sampleStory, adapter);
		unsubscribeStory = storySimulation.subscribe((state) => {
			scriptedStoryState = state;
		});
		storySimulation.dispatch({ type: 'TICK' });
	}

	function startSessionPresentationRuntime() {
		if (!sessionId || scriptedMode || !scene.isReady || sessionPresentationSimulation) return;
		const story = createSessionPresentationStory();
		const registry = ActorRegistry.fromStory(story);
		const adapter = createSceneAdapter(scene, registry);
		sessionPresentationSimulation = new CourtroomSimulation(story, adapter);
	}

	function stopStoryRuntime() {
		unsubscribeStory?.();
		unsubscribeStory = null;
		storySimulation?.dispose();
		storySimulation = null;
		storyAdapter = null;
		camerasSeen = [];
		sessionPresentationSimulation?.dispose();
		sessionPresentationSimulation = null;
		scriptedPlaying = false;
	}

	function toggleScriptedPlayback() {
		if (!storySimulation) return;
		if (scriptedPlaying) {
			storySimulation.stop();
			scriptedPlaying = false;
		} else {
			storySimulation.start();
			scriptedPlaying = true;
		}
	}

	function advanceScriptedStory() {
		storySimulation?.dispatch({ type: 'TICK', steps: 30 });
	}

	function askScriptedWitness() {
		storySimulation?.dispatch({ type: 'QUESTION', actorId: 'jester', topic: 'the ledger photograph' });
	}

	async function requestScriptedDialogueProposal() {
		if (!scriptedMode || !scriptedStoryState || dialogueProposalLoading) return;
		dialogueProposalLoading = true;
		dialogueProposal = null;
		dialogueProposalAccepted = false;
		dialogueProposalError = '';
		try {
			const request = makeDialogueRequest(
				sampleStory,
				scriptedStoryState,
				ActorRegistry.fromStory(sampleStory),
				'jester',
				'the ledger photograph'
			);
			dialogueProposal = await requestDialogue(request);
			if (!dialogueProposal) dialogueProposalError = 'No valid proposal returned. The story was not changed.';
		} catch {
			dialogueProposalError = 'AI assistance is unavailable. The scripted story remains unchanged.';
		} finally {
			dialogueProposalLoading = false;
		}
	}

	function submitScriptedEvidence() {
		storySimulation?.dispatch({ type: 'SUBMIT_EVIDENCE', id: 'ledger-photo' });
	}

	function advanceTutorialStory() {
		advanceScriptedStory();
		showDemoTutorial = false;
	}

	/** Load or generate timeline keyframes for the current session */
	async function loadTimeline() {
		if (!sessionId) return;
		timelineLoading = true;
		try {
			// Try to fetch existing keyframes
			let res = await fetch(`/api/simulation/${sessionId}/keyframes`);
			let data = await res.json();

			// If no keyframes exist and we have dialogue, auto-generate
			if ((!data.keyframes || data.keyframes.length === 0) && dialogue.length > 0) {
				res = await fetch(`/api/simulation/${sessionId}/keyframes`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'generate', msPerTurn: 3000 }),
				});
				data = await res.json();
			}

			if (data.keyframes?.length > 0) {
				timeline.loadKeyframes(data.keyframes);
			}
		} catch { /* timeline is optional */ }
		finally { timelineLoading = false; }
	}

	function formatTime(ms: number): string {
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		const sec = s % 60;
		return `${m}:${sec.toString().padStart(2, '0')}`;
	}

	const timelineMarkers = $derived(
		(timeline.keyframes ?? []).map((kf) => ({ timeMs: kf.timeMs, label: `${kf.characterRole}: ${kf.animType} @ ${formatTime(kf.timeMs)}` }))
	);

	const actionButtons = $derived(
		actionBarButtons({
			mode: scriptedMode ? 'scripted' : sessionData?.status === 'completed' ? 'completed' : 'live',
			isAdvancing,
			textAnimating,
			storyReady: scriptedStoryState !== null, // storySimulation is a plain field; this state is set in the same call, and reactive
			scriptedPlaying,
			proposalLoading: dialogueProposalLoading,
			evidenceAdmitted: Boolean(scriptedStoryState?.evidence.includes('ledger-photo'))
		})
	);

	/** One entry point for the action bar; each case calls the handler the old inline buttons called. */
	function handleAction(id: ActionId) {
		switch (id) {
			case 'next_turn': return void advanceTurn('next_turn');
			case 'next_phase': return void advanceTurn('next_phase');
			case 'respond': userInputMode = !userInputMode; return;
			case 'strategy': showStrategy = !showStrategy; return;
			case 'objection_hearsay':
			case 'objection_relevance':
			case 'objection_foundation': return void advanceTurn('objection', { ...OBJECTIONS[id] });
			case 'quit': return void abandonSession();
			case 'cast': showCast = !showCast; return;
			case 'return_to_lobby':
			case 'scripted_exit': return backToLobby();
			case 'scripted_toggle': return toggleScriptedPlayback();
			case 'scripted_advance': return advanceScriptedStory();
			case 'scripted_ask': return askScriptedWitness();
			case 'scripted_ai': return void requestScriptedDialogueProposal();
			case 'scripted_evidence': return submitScriptedEvidence();
		}
	}

	function backToLobby() {
		stopStoryRuntime();
		scene.dispose();
		timeline.reset();
		sessionId = null;
		sessionData = null;
		dialogue = [];
		displayedText = '';
		currentSpeaker = '';
		currentRole = '';
		insight = null;
		userInputMode = false;
		scriptedMode = false;
		scriptedStoryState = null;
		movementReceipt = null;
		showTimeline = false;
		view = 'lobby';
		loadActiveSessions();
	}

	function formatCategory(cat: string): string {
		return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function roleColor(role: string): string {
		return ROLE_COLORS[role] ?? '#7c7c7c';
	}
</script>

<svelte:head>
	<title>Courtroom Simulation — Deeds</title>
</svelte:head>

{#if view === 'lobby'}
	<!-- ════════ LOBBY ════════ -->
	<div class="lobby">
		<header class="lobby-header">
			<div class="header-title">
				<Icon name="scale" size={28} />
				<h1>COURTROOM SIMULATION</h1>
			</div>
			<span class="disclaimer-tag">FICTIONAL TRAINING — NOT LEGAL ADVICE</span>
		</header>

		{#if activeSessions.length > 0}
			<section class="section">
				<h2 class="section-title">ACTIVE SESSIONS</h2>
				<div class="sessions-row">
					{#each activeSessions as sess}
						<button class="session-chip" onclick={() => resumeSession(sess.id)}>
							<span class="chip-type">{sess.caseNumber}</span>
							<span class="chip-charge">{sess.charge}</span>
							<span class="chip-progress">Phase {sess.currentPhase.replace(/_/g, ' ')} · {sess.progress}</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}

		<section class="section scripted-preview-card">
			<div>
				<h2 class="section-title">LOCAL SCRIPTED PREVIEW</h2>
				<p>A deterministic fictional story drives the existing Babylon scene. This preview creates no case or server session.</p>
			</div>
			<button class="btn-prosecute" onclick={startScriptedPreview} disabled={isLoading}>PLAY LOCAL STORY</button>
		</section>

		<section class="section">
			<div class="toolbar">
				<h2 class="section-title">SELECT CASE ({filteredCases.length})</h2>
				<div class="filters">
					<select bind:value={selectedCategory}>
						{#each categories as cat}
							<option value={cat}>{cat === 'all' ? 'All Categories' : formatCategory(cat)}</option>
						{/each}
					</select>
					<input type="text" placeholder="Search..." bind:value={searchQuery} />
				</div>
			</div>

			{#if error}
				<div class="error-msg">{error}</div>
			{/if}

			<div class="case-grid">
				{#each filteredCases as fc}
					<div class="case-card">
						<div class="card-top">
							<span class="card-cat">{formatCategory(fc.category)}</span>
							<span class="card-jur">{fc.jurisdiction ?? 'US-FED'}</span>
						</div>
						<h3 class="card-charge">{fc.charge}</h3>
						<div class="card-meta">
							<span>v. <strong>{fc.defendantName}</strong></span>
							{#if fc.primaryStatute}
								<span class="card-statute">{fc.primaryStatute}</span>
							{/if}
						</div>
						<p class="card-narrative">{fc.narrative.slice(0, 150)}{fc.narrative.length > 150 ? '...' : ''}</p>
						<button class="btn-prosecute" onclick={() => startSimulation(fc.id)} disabled={isLoading}>
							{isLoading ? 'LOADING...' : 'BEGIN PROSECUTION'}
						</button>
					</div>
				{/each}
			</div>
		</section>
	</div>

{:else}
	<!-- ════════ COURTROOM ════════ -->
	<div class="courtroom-wrapper" bind:this={wrapperEl} style:height={wrapperHeight} data-camera-view={scene.currentView} data-scene-ready={scene.isReady}>
		<canvas
			class="courtroom-canvas"
			data-scene-ready={scene.isReady ? 'true' : 'false'}
			data-models-loaded={scene.modelsLoaded ? 'true' : 'false'}
			bind:this={canvasEl}
		></canvas>

		<!-- ── Top Bar ── -->
		<div class="overlay-top absolute top-0 inset-x-0 z-10 flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-slate-950/95 via-slate-900/85 to-slate-900/40 border-b border-[#8bdfff]/20 shadow-[0_8px_28px_rgba(0,0,0,0.24)] backdrop-blur-md">
			<button class="btn-icon flex items-center justify-center w-8.5 h-8.5 rounded border border-[#bad0ff]/20 bg-[#141d30]/75 text-[#c4d2e6] hover:text-[#8bdfff] hover:border-[#8bdfff]/70 hover:bg-[#1b2740]/90 transition" onclick={backToLobby} title="Back to lobby" aria-label="Back to lobby">
				<Icon name="arrow-left" size={16} />
			</button>
			<div class="top-case-info flex-1 flex items-center gap-3 text-xs">
				<span class="top-case-num font-mono text-neutral-400">{sessionData?.caseData?.caseNumber ?? ''}</span>
				<span class="top-charge font-semibold text-neutral-100">{sessionData?.caseData?.charge ?? ''}</span>
				<span class="top-defendant text-neutral-400">v. {sessionData?.caseData?.defendantName ?? ''}</span>
			</div>
			<div class="top-phase font-mono text-xs text-[#ffcc66] tracking-wider">
				{#if scriptedMode}
					LOCAL STORY · {(scriptedStoryState?.phase ?? 'lobby').replace(/_/g, ' ').toUpperCase()} · TICK {scriptedStoryState?.tick ?? 0}
					{#if movementReceipt}
						<span class="movement-receipt text-[#80f3ce]" data-testid="movement-receipt"> · MOVE {movementReceipt.actorId.toUpperCase()} → {movementReceipt.station.toUpperCase()}: {movementReceipt.outcome.toUpperCase()}{movementReceipt.position ? ` @ ${movementReceipt.position.x.toFixed(1)},${movementReceipt.position.z.toFixed(1)}` : ''}</span>
					{/if}
				{:else}
					Phase {(sessionData?.currentPhase ?? 0) + 1}/{sessionData?.phases?.length ?? 0}:
					{currentPhaseName.replace(/_/g, ' ').toUpperCase()}
				{/if}
			</div>
			<div class="top-controls flex items-center gap-1.5">
				<button class="btn-icon flex items-center justify-center w-8.5 h-8.5 rounded border border-[#bad0ff]/20 bg-[#141d30]/75 text-[#c4d2e6] hover:text-[#8bdfff] hover:border-[#8bdfff]/70 hover:bg-[#1b2740]/90 transition {crtEnabled ? 'text-[#f3d471] border-[#f3d471] shadow-[0_0_10px_rgba(243,212,113,0.2)]' : ''}" onclick={() => (crtEnabled = !crtEnabled)} title="CRT filter [C]" aria-label="Toggle CRT filter">
					<Icon name="monitor" size={16} />
				</button>
				<button class="btn-icon flex items-center justify-center w-8.5 h-8.5 rounded border border-[#bad0ff]/20 bg-[#141d30]/75 text-[#c4d2e6] hover:text-[#8bdfff] hover:border-[#8bdfff]/70 hover:bg-[#1b2740]/90 transition {showEvidence ? 'text-[#f3d471] border-[#f3d471] shadow-[0_0_10px_rgba(243,212,113,0.2)]' : ''}" onclick={() => (showEvidence = !showEvidence)} title="Evidence [E]" aria-label="Toggle evidence panel">
					<Icon name="yorha-evidence" size={16} />
				</button>
				<button class="btn-icon flex items-center justify-center w-8.5 h-8.5 rounded border border-[#bad0ff]/20 bg-[#141d30]/75 text-[#c4d2e6] hover:text-[#8bdfff] hover:border-[#8bdfff]/70 hover:bg-[#1b2740]/90 transition {showLog ? 'text-[#f3d471] border-[#f3d471] shadow-[0_0_10px_rgba(243,212,113,0.2)]' : ''}" onclick={() => (showLog = !showLog)} title="Dialogue log [L]" aria-label="Toggle transcript">
					<Icon name="yorha-citation" size={16} />
				</button>
				<button class="btn-icon flex items-center justify-center w-8.5 h-8.5 rounded border border-[#bad0ff]/20 bg-[#141d30]/75 text-[#c4d2e6] hover:text-[#8bdfff] hover:border-[#8bdfff]/70 hover:bg-[#1b2740]/90 transition {showTimeline ? 'text-[#f3d471] border-[#f3d471] shadow-[0_0_10px_rgba(243,212,113,0.2)]' : ''}" onclick={() => (showTimeline = !showTimeline)} title="Timeline playback [P]" aria-label="Toggle timeline">
					<Icon name="yorha-timeline" size={16} />
				</button>
				{#if scene.modelsLoaded}
					<span class="badge-3d text-[0.6rem] px-1.5 py-0.5 bg-[#7c4dff] text-white rounded font-bold tracking-wider">3D</span>
				{/if}
				{#if sessionData?.status === 'completed'}
					<span class="badge-done text-[0.6rem] px-1.5 py-0.5 bg-emerald-600 text-white rounded font-bold tracking-wider">COMPLETED</span>
				{/if}
			</div>
		</div>

		<!-- ── Progress Bar ── -->
		{#if scriptedMode && scene.isReady}
			<CourtroomLevelPanel level={level1} onCamera={(view) => scene.setCameraView(view)} onMove={issueDemoMove} />
		{/if}
		{#if scriptedMode && showDemoTutorial}
			<CourtroomDemoTutorial
				phase={scriptedStoryState?.phase ?? 'lobby'}
				evidenceAdded={Boolean(scriptedStoryState?.evidence.includes('ledger-photo'))}
				onAddEvidence={submitScriptedEvidence}
				onAdvanceStory={advanceTutorialStory}
				onClose={() => (showDemoTutorial = false)}
			/>
		{/if}
		<CourtroomProgressOrbit
			progress={progress}
			phase={scriptedMode ? (scriptedStoryState?.phase ?? 'local preview').replace(/_/g, ' ') : currentPhaseName.replace(/_/g, ' ')}
			tick={scriptedMode ? (scriptedStoryState?.tick ?? 0) : null}
		/>

		<!-- ── Evidence Sidebar (left) ── -->
		{#if showEvidence && (sessionData || scriptedMode)}
			<div class="evidence-sidebar absolute top-[50px] left-0 bottom-12 w-[280px] bg-gradient-to-b from-slate-950/92 via-slate-900/85 to-slate-950/95 border-r border-[#8bdfff]/20 overflow-y-auto z-10 p-3.5 text-xs shadow-[6px_0_24px_rgba(0,0,0,0.35)]" data-testid="evidence-sidebar">
				<h3 class="text-xs font-semibold tracking-wider text-[#8bdfff] uppercase pb-1.5 mb-3 border-b border-[#8bdfff]/25">CASE BRIEF</h3>
				<CourtroomEvidenceSearch caseId={typeof sessionData?.caseId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionData.caseId) ? sessionData.caseId : undefined} localPreview={scriptedMode} />
				{#if sessionData?.charges?.length}
					<div class="evidence-group mb-3.5">
						<h4 class="text-[0.7rem] text-[#8fa5c4] uppercase tracking-wider my-2 pb-1 border-b border-white/10">CHARGES</h4>
						{#each sessionData.charges as charge}
							<div class="evidence-item p-2 bg-[#121929]/65 border border-[#bad0ff]/12 rounded mb-1.5 flex flex-col gap-0.5">
								<strong class="text-neutral-100">{charge.chargeName}</strong>
								{#if charge.statute}
									<span class="statute-ref font-mono text-[0.65rem] text-[#ffcc66]">{charge.statute}</span>
								{/if}
							</div>
						{/each}
					</div>
				{:else if scriptedMode}
					<div class="evidence-group mb-3.5">
						<h4 class="text-[0.7rem] text-[#8fa5c4] uppercase tracking-wider my-2 pb-1 border-b border-white/10">CHARGES</h4>
						<div class="evidence-item p-2 bg-[#121929]/65 border border-[#bad0ff]/12 rounded mb-1.5 flex flex-col gap-0.5">
							<strong class="text-neutral-100">Accounting Discrepancy & Conversion</strong>
							<span class="statute-ref font-mono text-[0.65rem] text-[#ffcc66]">Fictional Civil Code § 404</span>
						</div>
					</div>
				{/if}
				{#if sessionData?.actors?.length}
					<div class="evidence-group mb-3.5">
						<h4 class="text-[0.7rem] text-[#8fa5c4] uppercase tracking-wider my-2 pb-1 border-b border-white/10">PARTIES</h4>
						{#each sessionData.actors as actor}
							<div class="evidence-item p-2 bg-[#121929]/65 border border-[#bad0ff]/12 rounded mb-1.5 flex flex-col gap-0.5">
								<span class="actor-role text-[0.65rem] font-bold uppercase tracking-wider" style="color: {ROLE_COLORS[actor.role] ?? '#7c7c7c'}">{actor.role}</span>
								<span class="text-neutral-200">{actor.name}</span>
							</div>
						{/each}
					</div>
				{:else if scriptedMode}
					<div class="evidence-group mb-3.5">
						<h4 class="text-[0.7rem] text-[#8fa5c4] uppercase tracking-wider my-2 pb-1 border-b border-white/10">PARTIES</h4>
						{#each sampleStory.actors as actor}
							<div class="evidence-item p-2 bg-[#121929]/65 border border-[#bad0ff]/12 rounded mb-1.5 flex flex-col gap-0.5">
								<span class="actor-role text-[0.65rem] font-bold uppercase tracking-wider" style="color: {ROLE_COLORS[actor.role] ?? '#7c7c7c'}">{actor.role}</span>
								<span class="text-neutral-200">{actor.name}</span>
							</div>
						{/each}
					</div>
				{/if}
				{#if sessionData?.events?.length}
					<div class="evidence-group mb-3.5">
						<h4 class="text-[0.7rem] text-[#8fa5c4] uppercase tracking-wider my-2 pb-1 border-b border-white/10">TIMELINE</h4>
						{#each sessionData.events.slice(0, 8) as evt}
							<div class="evidence-item timeline p-2 bg-[#121929]/65 border border-[#bad0ff]/12 rounded mb-1.5 flex flex-col gap-0.5 text-[0.7rem]">
								<span class="evt-type text-[0.65rem] font-semibold text-[#ff80df] uppercase">{evt.eventType.replace(/_/g, ' ')}</span>
								<span class="evt-desc text-neutral-400">{evt.description.slice(0, 80)}...</span>
							</div>
						{/each}
					</div>
				{:else if scriptedMode}
					<div class="evidence-group mb-3.5">
						<h4 class="text-[0.7rem] text-[#8fa5c4] uppercase tracking-wider my-2 pb-1 border-b border-white/10">TIMELINE</h4>
						{#each sampleStory.cues.slice(0, 8) as cue}
							<div class="evidence-item timeline p-2 bg-[#121929]/65 border border-[#bad0ff]/12 rounded mb-1.5 flex flex-col gap-0.5 text-[0.7rem]">
								<span class="evt-type text-[0.65rem] font-semibold text-[#ff80df] uppercase">{cue.kind} (T{cue.tick})</span>
								<span class="evt-desc text-neutral-400">{cue.value.slice(0, 80)}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── Dialogue Log (scrollable history) ── -->
		{#if showLog}
			<div class="dialogue-log absolute top-[50px] right-0 bottom-12 w-[300px] bg-gradient-to-b from-slate-950/92 via-slate-900/85 to-slate-950/95 border-l border-[#8bdfff]/20 z-10 flex flex-col shadow-[-6px_0_24px_rgba(0,0,0,0.35)]" data-testid="dialogue-log">
				<div class="log-header flex items-center justify-between p-3 border-b border-[#8bdfff]/20">
					<h3 class="text-xs font-semibold tracking-wider text-[#8bdfff] uppercase m-0">TRANSCRIPT</h3>
					<span class="log-count font-mono text-[0.65rem] text-[#8fa5c4]">{dialogue.length} entries</span>
				</div>
				<div class="log-entries flex-1 overflow-y-auto p-2 flex flex-col gap-1" data-testid="log-entries">
					{#each dialogue as entry, i}
						<button class="log-entry flex items-baseline gap-1.5 p-2 bg-[#121929]/65 border border-[#bad0ff]/10 rounded cursor-pointer text-left font-inherit text-xs text-neutral-300 hover:bg-[#1c2842]/85 hover:border-[#8bdfff]/30 transition" onclick={() => handleDialogueEntryClick(entry)}>
							<span class="log-turn font-mono text-[0.6rem] text-[#7c4dff] whitespace-nowrap">T{entry.turn}</span>
							<span class="log-speaker text-[0.65rem] font-bold uppercase whitespace-nowrap" style="color: {roleColor(entry.role)}">{entry.speaker}</span>
							<span class="log-preview flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-neutral-400">{entry.content.slice(0, 80)}{entry.content.length > 80 ? '...' : ''}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- ── Strategy Wizard Panel ── -->
		{#if showStrategy && sessionId}
			<StrategyWizard
				{sessionId}
				onClose={() => (showStrategy = false)}
				onApply={(rec) => {
					advanceTurn('next_turn', { userInput: `[STRATEGY APPLIED: ${rec.role}] ${rec.what} — Reasoning: ${rec.why}` });
					showStrategy = false;
				}}
			/>
		{/if}

		<!-- ── Dialogue Box (Bottom — interactive) ── -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="dialogue-box absolute bottom-14 left-1/2 -translate-x-1/2 w-[min(720px,calc(100%-2rem))] bg-gradient-to-br from-[#141d30]/92 to-[#0a0d1b]/88 border border-[#8bdfff]/30 rounded-md px-5 py-3.5 z-20 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md cursor-pointer hover:border-[#8bdfff]/60 transition" bind:this={dialogueBoxEl} onclick={handleTextClick}>
			{#if currentSpeaker}
				<div class="speaker-plate inline-flex items-center gap-2 px-2.5 py-0.5 text-white font-bold tracking-wider uppercase mb-1.5 rounded-sm" style="background: {roleColor(currentRole)}">
					<span class="speaker-name text-xs">{currentSpeaker}</span>
					<span class="speaker-role text-[0.6rem] opacity-70">{currentRole}</span>
				</div>
			{/if}
			<div class="dialogue-text text-sm leading-relaxed text-neutral-100 font-mono whitespace-pre-wrap max-h-[90px] overflow-y-auto">
				{displayedText}
				{#if textAnimating}
					<span class="text-cursor animate-pulse text-[#8bdfff]">▌</span>
				{/if}
			</div>
			{#if !textAnimating && displayedText}
				<div class="dialogue-hint text-[0.6rem] text-[#9baac0] mt-1.5 tracking-wider">Select text to analyze | SPACE to continue</div>
			{/if}
			{#if scriptedMode}
				{#if dialogueProposalError}
					<div class="dialogue-proposal-status mt-1.5 text-[#f7d51d] text-xs" role="status">{dialogueProposalError}</div>
				{/if}
				{#if dialogueProposal}
					<div class="dialogue-proposal mt-2 border-l-2 border-lime-400 p-2 bg-emerald-950/30 font-mono text-xs" role="status">
						<strong class="text-lime-300 text-[0.6rem] tracking-wider block mb-0.5">AI PROPOSAL · NOT PART OF THE STORY</strong>
						<p class="my-1 text-neutral-100 text-xs">{dialogueProposal.text}</p>
						<small class="text-neutral-400 text-[0.6rem]">{dialogueProposal.intent} · {dialogueProposal.emotion ?? 'neutral'} · {dialogueProposal.modelRevision}</small>
						{#if dialogueProposalAccepted}
							<p class="dialogue-proposal-status mt-1 text-[#f7d51d] text-xs">Added to the local story transcript.</p>
						{:else}
							<button type="button" class="mt-1 px-2 py-0.5 bg-lime-700/50 hover:bg-lime-700 text-lime-200 rounded text-xs transition" onclick={acceptScriptedDialogueProposal}>Add suggestion to story</button>
						{/if}
					</div>
				{/if}
			{/if}
			{#if dialogue.length > 0}
				{@const latest = dialogue[dialogue.length - 1]}
				{#if latest.canonRefs?.length > 0}
					<div class="canon-refs flex flex-wrap gap-1 mt-1.5">
						{#each latest.canonRefs as ref}
							<span class="canon-tag text-[0.6rem] px-1.5 py-0.5 bg-[#ffcc66]/15 text-[#ffcc66] rounded-sm font-mono">{ref}</span>
						{/each}
					</div>
				{/if}
			{/if}

			<!-- Insight popup (click-to-analyze) -->
			{#if insight}
				<div class="insight-popup absolute w-[280px] bg-slate-950/95 border border-[#8bdfff] rounded-md p-3 z-30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]" style="left: {Math.min(insight.x, 300)}px; top: {Math.max(insight.y, 0)}px">
					<div class="insight-header flex items-center gap-1.5 mb-1.5 text-[#8bdfff] text-[0.65rem] uppercase tracking-wider">
						<Icon name="brain" size={12} />
						<span>LEGAL ANALYSIS</span>
						<button class="insight-close ml-auto text-neutral-400 hover:text-white text-base leading-none" onclick={() => (insight = null)}>×</button>
					</div>
					<div class="insight-quote italic text-neutral-400 text-xs p-1.5 bg-white/5 border-l-2 border-[#8bdfff] mb-1.5">"{insight.text}"</div>
					{#if insight.loading}
						<div class="insight-loading text-[#8bdfff] text-xs animate-pulse">Analyzing...</div>
					{:else}
						<div class="insight-body text-xs text-neutral-300 leading-relaxed max-h-[150px] overflow-y-auto">{insight.analysis}</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- ── User Input Bar ── -->
		{#if userInputMode}
			<div class="user-input-bar absolute bottom-12 inset-x-0 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#141d30]/90 to-[#0a0d1b]/85 backdrop-blur-md border-t border-[#c2aaff]/70 z-25">
				<span class="input-label text-[0.65rem] text-[#7c4dff] uppercase tracking-wider whitespace-nowrap">YOUR RESPONSE:</span>
				<input
					type="text"
					class="user-input flex-1 px-3 py-1.5 bg-white/5 border border-white/15 focus:border-[#8bdfff] focus:shadow-[0_0_10px_rgba(131,225,255,0.35)] rounded text-neutral-100 text-xs font-mono outline-none"
					placeholder="Type your argument, question, or objection..."
					bind:value={userInputText}
					onkeydown={(e) => { if (e.key === 'Enter') submitUserInput(); if (e.key === 'Escape') { userInputMode = false; } }}
				/>
				<button class="input-send px-3 py-1.5 bg-gradient-to-r from-[#b4a0ff] to-[#8cb7ff] text-[#0a0d1b] font-bold text-xs rounded hover:brightness-110 cursor-pointer tracking-wider" onclick={submitUserInput}>SUBMIT</button>
				<button class="input-cancel px-2.5 py-1.5 border border-white/20 text-neutral-400 rounded text-xs hover:text-white cursor-pointer" onclick={() => (userInputMode = false)}>ESC</button>
			</div>
		{/if}

		<!-- ── Timeline (bits-ui Slider + ToggleGroup) ── -->
		{#if showTimeline}
			<CourtroomTimelinePanel
				currentMs={timelineCurrentTime}
				durationMs={timelineDuration}
				playing={timelineState === 'playing'}
				loading={timelineLoading}
				speed={timeline.playbackSpeed}
				markers={timelineMarkers}
				activeMarker={timeline.currentKeyframeIndex}
				onToggle={() => timeline.toggle()}
				onStep={(direction) => (direction < 0 ? timeline.stepBackward() : timeline.stepForward())}
				onSeek={(ms) => timeline.seekTo(ms)}
				onSpeed={(next) => timeline.setSpeed(next)}
				onReset={() => timeline.reset()}
				onRegenerate={loadTimeline}
			/>
		{/if}

		<!-- ── Action bar (bits-ui Toolbar; rules live in courtroom-hud-v1) ── -->
		<CourtroomActionBar buttons={actionButtons} onAction={handleAction} />
		<CourtroomCastDialog bind:open={showCast} proposal={dialogueProposal} />
		{#if showCoords}
			<CourtroomCoordinateReadout getPosition={(role) => scene.getPosition(role)} />
		{/if}

		<!-- ── Misc overlays ── -->
		<div class="overlay-disclaimer">FICTIONAL SIMULATION</div>

		{#if scene.isReady}
			<div class="overlay-fps">
				N64 PROFILE · {scene.engineType.toUpperCase()} · {scene.fps} FPS · GEO {(scene.estimatedGeometryBytes / (1024 * 1024)).toFixed(2)}/{(scene.geometryBudgetBytes / (1024 * 1024)).toFixed(0)} MiB
				{#if scene.modelsLoaded}| 3D{/if}
			</div>
		{/if}

		{#if scene.loadingStage && (!scene.modelsLoaded || scene.loadingFailures.length > 0)}
			<div class="overlay-model-loading">
				{scene.modelsLoaded ? scene.loadingStage : `Loading ${scene.loadingStage} · ${scene.loadingProgress}%`}
			</div>
			<LoadingAssistant
				progress={scene.loadingProgress}
				brief={sessionData
					? { charges: sessionData.charges?.length ?? 0, parties: sessionData.actors?.length ?? 0, events: sessionData.events?.length ?? 0 }
					: null}
			/>
		{/if}

		{#if error}
			<div class="overlay-error">{error}</div>
		{/if}
	</div>
{/if}

<style>
	/* ═══ LOBBY ═══ */
	.lobby { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; }
	.lobby-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap; }
	.header-title { display: flex; align-items: center; gap: 0.75rem; }
	.lobby-header h1 { font-size: 1.5rem; font-weight: 700; color: var(--t-text); margin: 0; letter-spacing: 0.05em; }
	.disclaimer-tag { font-size: 0.7rem; color: var(--t-accent); padding: 0.25rem 0.75rem; border: 1px solid var(--t-accent); border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
	.section { margin-bottom: 2rem; }
	.scripted-preview-card { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; background: var(--t-panel); border: 1px solid var(--t-border); border-radius: 8px; }
	.scripted-preview-card p { margin: 0; color: var(--t-text-muted); font-size: 0.8rem; }
	.section-title { font-size: 0.85rem; color: var(--t-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.75rem; }
	.sessions-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.session-chip { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.6rem 1rem; background: var(--t-panel); border: 1px solid var(--t-border); border-radius: 6px; cursor: pointer; color: var(--t-text); font-family: inherit; text-align: left; transition: border-color 0.15s; }
	.session-chip:hover { border-color: var(--t-accent); }
	.chip-type { font-size: 0.65rem; text-transform: uppercase; color: var(--t-text-muted); letter-spacing: 0.04em; }
	.chip-charge { font-size: 0.8rem; font-weight: 600; }
	.chip-progress { font-size: 0.7rem; color: var(--t-accent); }
	.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
	.filters { display: flex; gap: 0.5rem; }
	.filters select, .filters input { padding: 0.4rem 0.75rem; border: 1px solid var(--t-border); border-radius: 6px; background: var(--t-panel); color: var(--t-text); font-size: 0.8rem; }
	.case-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
	.case-card { background: var(--t-panel); border: 1px solid var(--t-border); border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }
	.card-top { display: flex; justify-content: space-between; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; }
	.card-cat { color: var(--t-accent); font-weight: 600; }
	.card-jur { color: var(--t-text-muted); }
	.card-charge { font-size: 1rem; font-weight: 600; color: var(--t-text); margin: 0; }
	.card-meta { display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.8rem; color: var(--t-text-muted); }
	.card-statute { font-family: monospace; color: var(--t-accent); }
	.card-narrative { font-size: 0.78rem; color: var(--t-text-muted); line-height: 1.5; flex: 1; margin: 0; }
	.btn-prosecute { padding: 0.5rem 1rem; background: var(--t-accent); color: var(--t-bg); border: none; border-radius: 6px; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.06em; cursor: pointer; font-family: inherit; margin-top: 0.5rem; transition: opacity 0.15s; }
	.btn-prosecute:hover:not(:disabled) { opacity: 0.85; }
	.btn-prosecute:disabled { opacity: 0.5; cursor: not-allowed; }
	.error-msg { padding: 0.5rem 1rem; background: color-mix(in srgb, #e57373 15%, transparent); color: #e57373; border-radius: 6px; font-size: 0.8rem; margin-bottom: 1rem; }

	/* ═══ COURTROOM ═══ */
	.courtroom-wrapper { position: relative; width: 100%; height: calc(100vh - 60px); overflow: hidden; background: #0a0a0c; }
	.courtroom-canvas { width: 100%; height: 100%; display: block; }

	/* ── Misc ── */
	.overlay-disclaimer { position: absolute; top: 52px; left: 50%; transform: translateX(-50%); font-size: 0.55rem; color: rgba(255,204,102,0.4); letter-spacing: 0.1em; text-transform: uppercase; z-index: 10; pointer-events: none; }
	.overlay-fps { position: absolute; bottom: 52px; left: 4px; font-size: 0.6rem; color: rgba(255,255,255,0.3); font-family: monospace; z-index: 10; pointer-events: none; }
	.overlay-error { position: absolute; top: 55px; left: 50%; transform: translateX(-50%); padding: 0.4rem 1rem; background: rgba(248,56,0,0.85); color: #fff; font-size: 0.75rem; border-radius: 4px; z-index: 30; }
	.overlay-model-loading { position: absolute; top: 55px; right: 8px; font-size: 0.65rem; color: var(--t-accent); padding: 0.3rem 0.75rem; background: rgba(0,0,0,0.8); border: 1px solid var(--t-accent); border-radius: 4px; z-index: 10; }
	.badge-3d { font-size: 0.6rem; padding: 0.15rem 0.4rem; background: #7c4dff; color: #fff; border-radius: 3px; font-weight: 700; letter-spacing: 0.04em; }


	/* ── Misc ── */
	.overlay-disclaimer { position: absolute; top: 52px; left: 50%; transform: translateX(-50%); font-size: 0.55rem; color: rgba(255,204,102,0.4); letter-spacing: 0.1em; text-transform: uppercase; z-index: 10; pointer-events: none; }
	.overlay-fps { position: absolute; bottom: 52px; left: 4px; font-size: 0.6rem; color: rgba(255,255,255,0.3); font-family: monospace; z-index: 10; pointer-events: none; }
	.overlay-error { position: absolute; top: 55px; left: 50%; transform: translateX(-50%); padding: 0.4rem 1rem; background: rgba(248,56,0,0.85); color: #fff; font-size: 0.75rem; border-radius: 4px; z-index: 30; }
	.overlay-model-loading { position: absolute; top: 55px; right: 8px; font-size: 0.65rem; color: var(--t-accent); padding: 0.3rem 0.75rem; background: rgba(0,0,0,0.8); border: 1px solid var(--t-accent); border-radius: 4px; z-index: 10; }
	.badge-3d { font-size: 0.6rem; padding: 0.15rem 0.4rem; background: #7c4dff; color: #fff; border-radius: 3px; font-weight: 700; letter-spacing: 0.04em; }

	/* ── Timeline Panel ── */
</style>
