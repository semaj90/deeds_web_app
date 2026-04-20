<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { CourtroomScene } from '$lib/courtroom/courtroom-scene.svelte.js';
	import type { ModelDef } from '$lib/courtroom/courtroom-scene.svelte.js';
	import { TimelineEngine } from '$lib/courtroom/timeline-engine.svelte.js';
	import type { TimelineKeyframe } from '$lib/courtroom/timeline-engine.svelte.js';
	import { ROLE_COLORS } from '$lib/courtroom/courtroom-types.js';
	import StrategyWizard from '$lib/components/courtroom/StrategyWizard.svelte';

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

	interface SessionSummary {
		sessionId: string;
		caseNumber: string;
		status: string;
		currentPhase: number;
		totalPhases: number;
		procedureType: string;
		charge: string;
		defendant: string;
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
	let userInputMode = $state(false);
	let userInputText = $state('');

	// ── Babylon Scene ──
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let scene = new CourtroomScene();
	let dialogueBoxEl = $state<HTMLDivElement | null>(null);

	// ── Timeline Engine ──
	let timeline = new TimelineEngine();
	let showTimeline = $state(false);
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
		return ['all', ...Array.from(cats).sort()];
	});

	let currentPhaseName = $derived(sessionData?.phases?.[sessionData?.currentPhase] ?? '');
	let progress = $derived(
		sessionData ? ((sessionData.currentPhase + 1) / (sessionData.phases?.length ?? 1)) * 100 : 0,
	);

	// ── Lifecycle ──
	onMount(() => {
		loadActiveSessions();
		loadModels();

		// Wire timeline engine → courtroom scene
		timeline.onKeyframeReached((kf) => {
			if (scene.isReady) {
				scene.executeKeyframe(kf);
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
			if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advanceTurn('next_turn'); }
			if (e.key === 'o' || e.key === 'O') advanceTurn('objection', { objectionType: 'hearsay', objectionBasis: 'Rule 802' });
			if (e.key === 'h' || e.key === 'H') advanceTurn('objection', { objectionType: 'relevance', objectionBasis: 'Rule 401/403' });
			if (e.key === 't' || e.key === 'T') advanceTurn('objection', { objectionType: 'foundation', objectionBasis: 'Insufficient foundation' });
			if (e.key === 's' || e.key === 'S') showStrategy = !showStrategy;
			if (e.key === 'e' || e.key === 'E') showEvidence = !showEvidence;
			if (e.key === 'l' || e.key === 'L') showLog = !showLog;
			if (e.key === 'n' || e.key === 'N') advanceTurn('next_phase');
			if (e.key === 'p' || e.key === 'P') { showTimeline = !showTimeline; }
			if (e.key === 'Escape') { insight = null; showStrategy = false; showLog = false; }
			if (e.key === 'r' || e.key === 'R') { userInputMode = true; }
		};
		window.addEventListener('keydown', handler);
		return () => {
			window.removeEventListener('keydown', handler);
			timeline.dispose();
		};
	});

	// Init Babylon when canvas appears, then load models + timeline
	$effect(() => {
		if (canvasEl && view === 'courtroom' && !scene.isReady) {
			scene.init(canvasEl).then(() => {
				loadModels();
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
			if (!res.ok) return;
			const data = await res.json();
			if (data.models?.length > 0 && scene.isReady) {
				const modelDefs: ModelDef[] = data.models.map((m: any) => ({
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
			}
		} catch { /* models are optional — procedural fallback works */ }
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

	function backToLobby() {
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
						<button class="session-chip" onclick={() => resumeSession(sess.sessionId)}>
							<span class="chip-type">{sess.procedureType}</span>
							<span class="chip-charge">{sess.charge}</span>
							<span class="chip-progress">Phase {sess.currentPhase + 1}/{sess.totalPhases}</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}

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
	<div class="courtroom-wrapper">
		<canvas class="courtroom-canvas" bind:this={canvasEl}></canvas>

		<!-- ── Top Bar ── -->
		<div class="overlay-top">
			<button class="btn-icon" onclick={backToLobby} title="Back to lobby">
				<Icon name="arrow-left" size={16} />
			</button>
			<div class="top-case-info">
				<span class="top-case-num">{sessionData?.caseData?.caseNumber ?? ''}</span>
				<span class="top-charge">{sessionData?.caseData?.charge ?? ''}</span>
				<span class="top-defendant">v. {sessionData?.caseData?.defendantName ?? ''}</span>
			</div>
			<div class="top-phase">
				Phase {(sessionData?.currentPhase ?? 0) + 1}/{sessionData?.phases?.length ?? 0}:
				{currentPhaseName.replace(/_/g, ' ').toUpperCase()}
			</div>
			<div class="top-controls">
				<button class="btn-icon" class:active={crtEnabled} onclick={() => (crtEnabled = !crtEnabled)} title="CRT filter [C]">
					<Icon name="monitor" size={16} />
				</button>
				<button class="btn-icon" class:active={showEvidence} onclick={() => (showEvidence = !showEvidence)} title="Evidence [E]">
					<Icon name="file-text" size={16} />
				</button>
				<button class="btn-icon" class:active={showLog} onclick={() => (showLog = !showLog)} title="Dialogue log [L]">
					<Icon name="scroll-text" size={16} />
				</button>
				<button class="btn-icon" class:active={showTimeline} onclick={() => (showTimeline = !showTimeline)} title="Timeline playback [P]">
					<Icon name="clock" size={16} />
				</button>
				{#if scene.modelsLoaded}
					<span class="badge-3d">3D</span>
				{/if}
				{#if sessionData?.status === 'completed'}
					<span class="badge-done">COMPLETED</span>
				{/if}
			</div>
		</div>

		<!-- ── Progress Bar ── -->
		<div class="overlay-progress">
			<div class="progress-track">
				<div class="progress-fill" style="width: {progress}%"></div>
			</div>
		</div>

		<!-- ── Evidence Sidebar (left) ── -->
		{#if showEvidence && sessionData}
			<div class="evidence-sidebar">
				<h3>CASE BRIEF</h3>
				{#if sessionData.charges?.length}
					<div class="evidence-group">
						<h4>CHARGES</h4>
						{#each sessionData.charges as charge}
							<div class="evidence-item">
								<strong>{charge.chargeName}</strong>
								{#if charge.statute}
									<span class="statute-ref">{charge.statute}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
				{#if sessionData.actors?.length}
					<div class="evidence-group">
						<h4>PARTIES</h4>
						{#each sessionData.actors as actor}
							<div class="evidence-item">
								<span class="actor-role" style="color: {ROLE_COLORS[actor.role] ?? '#7c7c7c'}">{actor.role}</span>
								<span>{actor.name}</span>
							</div>
						{/each}
					</div>
				{/if}
				{#if sessionData.events?.length}
					<div class="evidence-group">
						<h4>TIMELINE</h4>
						{#each sessionData.events.slice(0, 8) as evt}
							<div class="evidence-item timeline">
								<span class="evt-type">{evt.eventType.replace(/_/g, ' ')}</span>
								<span class="evt-desc">{evt.description.slice(0, 80)}...</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── Dialogue Log (scrollable history) ── -->
		{#if showLog}
			<div class="dialogue-log">
				<div class="log-header">
					<h3>TRANSCRIPT</h3>
					<span class="log-count">{dialogue.length} entries</span>
				</div>
				<div class="log-entries">
					{#each dialogue as entry, i}
						<button class="log-entry" onclick={() => handleDialogueEntryClick(entry)}>
							<span class="log-turn">T{entry.turn}</span>
							<span class="log-speaker" style="color: {roleColor(entry.role)}">{entry.speaker}</span>
							<span class="log-preview">{entry.content.slice(0, 80)}{entry.content.length > 80 ? '...' : ''}</span>
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
		<div class="dialogue-box" bind:this={dialogueBoxEl} onclick={handleTextClick}>
			{#if currentSpeaker}
				<div class="speaker-plate" style="background: {roleColor(currentRole)}">
					<span class="speaker-name">{currentSpeaker}</span>
					<span class="speaker-role">{currentRole}</span>
				</div>
			{/if}
			<div class="dialogue-text">
				{displayedText}
				{#if textAnimating}
					<span class="text-cursor">▌</span>
				{/if}
			</div>
			{#if !textAnimating && displayedText}
				<div class="dialogue-hint">Select text to analyze | SPACE to continue</div>
			{/if}
			{#if dialogue.length > 0}
				{@const latest = dialogue[dialogue.length - 1]}
				{#if latest.canonRefs?.length > 0}
					<div class="canon-refs">
						{#each latest.canonRefs as ref}
							<span class="canon-tag">{ref}</span>
						{/each}
					</div>
				{/if}
			{/if}

			<!-- Insight popup (click-to-analyze) -->
			{#if insight}
				<div class="insight-popup" style="left: {Math.min(insight.x, 300)}px; top: {Math.max(insight.y, 0)}px">
					<div class="insight-header">
						<Icon name="brain" size={12} />
						<span>LEGAL ANALYSIS</span>
						<button class="insight-close" onclick={() => (insight = null)}>×</button>
					</div>
					<div class="insight-quote">"{insight.text}"</div>
					{#if insight.loading}
						<div class="insight-loading">Analyzing...</div>
					{:else}
						<div class="insight-body">{insight.analysis}</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- ── User Input Bar ── -->
		{#if userInputMode}
			<div class="user-input-bar">
				<span class="input-label">YOUR RESPONSE:</span>
				<input
					type="text"
					class="user-input"
					placeholder="Type your argument, question, or objection..."
					bind:value={userInputText}
					onkeydown={(e) => { if (e.key === 'Enter') submitUserInput(); if (e.key === 'Escape') { userInputMode = false; } }}
				/>
				<button class="input-send" onclick={submitUserInput}>SUBMIT</button>
				<button class="input-cancel" onclick={() => (userInputMode = false)}>ESC</button>
			</div>
		{/if}

		<!-- ── Timeline Controls ── -->
		{#if showTimeline}
			<div class="timeline-panel">
				<div class="timeline-header">
					<Icon name="clock" size={14} />
					<span class="timeline-title">3D TIMELINE</span>
					<span class="timeline-time">{formatTime(timelineCurrentTime)} / {formatTime(timelineDuration)}</span>
					{#if timelineLoading}
						<span class="timeline-loading">Loading...</span>
					{/if}
				</div>
				<div class="timeline-controls">
					<button class="tl-btn" onclick={() => timeline.stepBackward()} title="Previous keyframe">
						<Icon name="skip-back" size={14} />
					</button>
					<button class="tl-btn tl-play" onclick={() => timeline.toggle()}>
						{#if timelineState === 'playing'}
							<Icon name="pause" size={16} />
						{:else}
							<Icon name="play" size={16} />
						{/if}
					</button>
					<button class="tl-btn" onclick={() => timeline.stepForward()} title="Next keyframe">
						<Icon name="skip-forward" size={14} />
					</button>
					<div class="tl-scrubber">
						<input
							type="range"
							min="0"
							max={timelineDuration}
							value={timelineCurrentTime}
							oninput={(e) => timeline.seekTo(Number((e.target as HTMLInputElement).value))}
						/>
						<div class="tl-progress" style="width: {timelineProgress}%"></div>
					</div>
					<div class="tl-speed">
						<button class="tl-speed-btn" class:active={timeline.playbackSpeed === 0.5} onclick={() => timeline.setSpeed(0.5)}>0.5x</button>
						<button class="tl-speed-btn" class:active={timeline.playbackSpeed === 1} onclick={() => timeline.setSpeed(1)}>1x</button>
						<button class="tl-speed-btn" class:active={timeline.playbackSpeed === 2} onclick={() => timeline.setSpeed(2)}>2x</button>
					</div>
					<button class="tl-btn" onclick={() => timeline.reset()} title="Reset">
						<Icon name="rotate-ccw" size={14} />
					</button>
					<button class="tl-btn" onclick={loadTimeline} title="Regenerate timeline" disabled={timelineLoading}>
						<Icon name="refresh-cw" size={14} />
					</button>
				</div>
				<!-- Keyframe markers -->
				{#if timelineDuration > 0}
					<div class="tl-markers">
						{#each timeline.keyframes ?? [] as kf, i}
							{@const left = (kf.timeMs / timelineDuration) * 100}
							<button
								class="tl-marker"
								class:active={timeline.currentKeyframeIndex === i}
								style="left: {left}%"
								onclick={() => timeline.seekTo(kf.timeMs)}
								title="{kf.characterRole}: {kf.animType} @ {formatTime(kf.timeMs)}"
							></button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── Action Bar (bottom horizontal) ── -->
		<div class="action-bar">
			{#if sessionData?.status === 'completed'}
				<button class="ab-btn ab-done" onclick={backToLobby}>
					<span class="ab-label">RETURN TO LOBBY</span>
				</button>
			{:else}
				<button class="ab-btn ab-next" onclick={() => advanceTurn('next_turn')} disabled={isAdvancing}>
					<span class="ab-key">SPACE</span>
					<span class="ab-label">{textAnimating ? 'SKIP' : isAdvancing ? '...' : 'NEXT'}</span>
				</button>

				<button class="ab-btn ab-phase" onclick={() => advanceTurn('next_phase')} disabled={isAdvancing || textAnimating}>
					<span class="ab-key">N</span>
					<span class="ab-label">PHASE</span>
				</button>

				<button class="ab-btn ab-respond" onclick={() => (userInputMode = !userInputMode)} disabled={isAdvancing || textAnimating}>
					<span class="ab-key">R</span>
					<span class="ab-label">RESPOND</span>
				</button>

				<button class="ab-btn ab-strategy" onclick={() => (showStrategy = !showStrategy)} disabled={isAdvancing || textAnimating}>
					<span class="ab-key">S</span>
					<span class="ab-label">STRATEGY</span>
				</button>

				<div class="ab-divider"></div>

				<button class="ab-btn ab-objection" onclick={() => advanceTurn('objection', { objectionType: 'hearsay', objectionBasis: 'Rule 802' })} disabled={isAdvancing || textAnimating}>
					<span class="ab-key">O</span>
					<span class="ab-label">OBJECTION!</span>
				</button>

				<button class="ab-btn ab-holdit" onclick={() => advanceTurn('objection', { objectionType: 'relevance', objectionBasis: 'Rule 401/403' })} disabled={isAdvancing || textAnimating}>
					<span class="ab-key">H</span>
					<span class="ab-label">HOLD IT!</span>
				</button>

				<button class="ab-btn ab-takethat" onclick={() => advanceTurn('objection', { objectionType: 'foundation', objectionBasis: 'Insufficient foundation' })} disabled={isAdvancing || textAnimating}>
					<span class="ab-key">T</span>
					<span class="ab-label">TAKE THAT!</span>
				</button>

				<div class="ab-divider"></div>

				<button class="ab-btn ab-quit" onclick={abandonSession}>
					<span class="ab-label">QUIT</span>
				</button>
			{/if}
		</div>

		<!-- ── Misc overlays ── -->
		<div class="overlay-disclaimer">FICTIONAL SIMULATION</div>

		{#if scene.isReady}
			<div class="overlay-fps">
				{scene.engineType.toUpperCase()} | {scene.fps} FPS
				{#if scene.modelsLoaded}| 3D{/if}
			</div>
		{/if}

		{#if scene.loadingProgress > 0 && scene.loadingProgress < 100}
			<div class="overlay-model-loading">
				Loading 3D models... {scene.loadingProgress}%
			</div>
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

	/* ── Top Bar ── */
	.overlay-top { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 1rem; background: linear-gradient(to bottom, rgba(0,0,0,0.85), transparent); z-index: 10; }
	.btn-icon { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; background: rgba(0,0,0,0.4); color: #ccc; cursor: pointer; font-family: inherit; }
	.btn-icon:hover { color: #fff; border-color: rgba(255,255,255,0.5); }
	.btn-icon.active { color: var(--t-accent); border-color: var(--t-accent); }
	.top-case-info { flex: 1; display: flex; align-items: center; gap: 0.75rem; font-size: 0.8rem; }
	.top-case-num { font-family: monospace; color: #888; }
	.top-charge { font-weight: 600; color: #eee; }
	.top-defendant { color: #999; }
	.top-phase { font-size: 0.75rem; color: var(--t-accent); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
	.top-controls { display: flex; gap: 0.35rem; align-items: center; }
	.badge-done { font-size: 0.65rem; padding: 0.2rem 0.5rem; background: var(--t-accent); color: #000; border-radius: 3px; font-weight: 700; letter-spacing: 0.04em; }

	/* ── Progress ── */
	.overlay-progress { position: absolute; top: 44px; left: 0; right: 0; height: 3px; z-index: 10; }
	.progress-track { width: 100%; height: 100%; background: rgba(255,255,255,0.1); }
	.progress-fill { height: 100%; background: var(--t-accent); transition: width 0.4s ease; }

	/* ── Evidence Sidebar (left) ── */
	.evidence-sidebar { position: absolute; top: 50px; left: 0; width: 280px; max-height: calc(100% - 200px); overflow-y: auto; background: rgba(0,0,0,0.9); border-right: 1px solid rgba(255,255,255,0.1); padding: 1rem; z-index: 15; }
	.evidence-sidebar h3 { font-size: 0.8rem; color: var(--t-accent); letter-spacing: 0.06em; margin: 0 0 0.75rem; }
	.evidence-group { margin-bottom: 1rem; }
	.evidence-group h4 { font-size: 0.65rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.4rem; padding-bottom: 0.3rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
	.evidence-item { font-size: 0.75rem; color: #ccc; padding: 0.25rem 0; display: flex; flex-direction: column; gap: 0.1rem; }
	.statute-ref { font-family: monospace; color: var(--t-accent); font-size: 0.7rem; }
	.actor-role { font-size: 0.65rem; text-transform: uppercase; font-weight: 600; }
	.evidence-item.timeline { border-left: 2px solid rgba(255,255,255,0.1); padding-left: 0.5rem; margin-bottom: 0.3rem; }
	.evt-type { font-size: 0.65rem; color: var(--t-accent); text-transform: uppercase; }
	.evt-desc { font-size: 0.7rem; color: #999; }

	/* ── Dialogue Log (right overlay) ── */
	.dialogue-log { position: absolute; top: 50px; right: 0; width: 320px; max-height: calc(100% - 200px); background: rgba(0,0,0,0.9); border-left: 1px solid rgba(255,255,255,0.1); z-index: 15; display: flex; flex-direction: column; }
	.log-header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
	.log-header h3 { font-size: 0.8rem; color: var(--t-accent); letter-spacing: 0.06em; margin: 0; }
	.log-count { font-size: 0.65rem; color: #666; }
	.log-entries { flex: 1; overflow-y: auto; padding: 0.5rem; }
	.log-entry { display: flex; gap: 0.5rem; align-items: baseline; width: 100%; padding: 0.4rem 0.5rem; background: none; border: none; border-bottom: 1px solid rgba(255,255,255,0.04); color: #ccc; font-family: inherit; font-size: 0.72rem; text-align: left; cursor: pointer; }
	.log-entry:hover { background: rgba(255,255,255,0.05); }
	.log-turn { font-size: 0.6rem; color: #555; min-width: 24px; font-family: monospace; }
	.log-speaker { font-size: 0.65rem; font-weight: 600; min-width: 60px; text-transform: uppercase; }
	.log-preview { color: #999; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	/* ── Dialogue Box ── */
	.dialogue-box { position: absolute; bottom: 48px; left: 0; right: 0; min-height: 120px; max-height: 200px; background: rgba(0,0,0,0.92); border-top: 2px solid rgba(255,255,255,0.15); padding: 0.75rem 1.5rem; z-index: 20; cursor: text; user-select: text; }
	.speaker-plate { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.2rem 0.8rem; font-size: 0.75rem; font-weight: 700; color: #000; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 0.4rem; border-radius: 2px; }
	.speaker-name { font-size: 0.75rem; }
	.speaker-role { font-size: 0.6rem; opacity: 0.7; }
	.dialogue-text { font-size: 0.92rem; line-height: 1.55; color: #f0f0f0; font-family: 'Courier New', monospace; white-space: pre-wrap; max-height: 90px; overflow-y: auto; }
	.dialogue-text::selection { background: rgba(146, 204, 65, 0.4); color: #fff; }
	.text-cursor { animation: blink 0.6s infinite; color: var(--t-accent); }
	@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
	.dialogue-hint { font-size: 0.6rem; color: #555; margin-top: 0.3rem; letter-spacing: 0.04em; }
	.canon-refs { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.3rem; }
	.canon-tag { font-size: 0.6rem; padding: 0.1rem 0.35rem; background: rgba(255,204,102,0.15); color: #ffcc66; border-radius: 2px; font-family: monospace; }

	/* ── Insight Popup ── */
	.insight-popup { position: absolute; width: 280px; background: rgba(10,15,25,0.97); border: 1px solid var(--t-accent); border-radius: 6px; padding: 0.75rem; z-index: 30; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
	.insight-header { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; color: var(--t-accent); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; }
	.insight-close { margin-left: auto; background: none; border: none; color: #888; font-size: 1rem; cursor: pointer; padding: 0; line-height: 1; }
	.insight-close:hover { color: #fff; }
	.insight-quote { font-style: italic; color: #aaa; font-size: 0.75rem; padding: 0.3rem 0.5rem; background: rgba(255,255,255,0.04); border-left: 2px solid var(--t-accent); margin-bottom: 0.4rem; }
	.insight-loading { color: var(--t-accent); font-size: 0.7rem; animation: pulse-text 1s infinite; }
	@keyframes pulse-text { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
	.insight-body { font-size: 0.72rem; color: #ccc; line-height: 1.5; max-height: 150px; overflow-y: auto; }

	/* ── User Input Bar ── */
	.user-input-bar { position: absolute; bottom: 48px; left: 0; right: 0; display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem; background: rgba(15,15,30,0.97); border-top: 2px solid #7c4dff; z-index: 25; }
	.input-label { font-size: 0.65rem; color: #7c4dff; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
	.user-input { flex: 1; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: #f0f0f0; font-size: 0.85rem; font-family: 'Courier New', monospace; outline: none; }
	.user-input:focus { border-color: #7c4dff; }
	.input-send { padding: 0.45rem 1rem; background: #7c4dff; color: #fff; border: none; border-radius: 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; font-family: inherit; letter-spacing: 0.04em; }
	.input-send:hover { background: #9c6fff; }
	.input-cancel { padding: 0.45rem 0.75rem; background: none; border: 1px solid rgba(255,255,255,0.2); color: #888; border-radius: 4px; font-size: 0.7rem; cursor: pointer; font-family: inherit; }

	/* ── Action Bar (horizontal bottom) ── */
	.action-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 48px; display: flex; align-items: stretch; background: rgba(0,0,0,0.95); border-top: 1px solid rgba(255,255,255,0.1); z-index: 20; }
	.ab-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 0 0.6rem; border: none; cursor: pointer; font-family: inherit; transition: filter 0.1s; min-width: 60px; }
	.ab-btn:hover:not(:disabled) { filter: brightness(1.3); }
	.ab-btn:disabled { opacity: 0.35; cursor: not-allowed; }
	.ab-key { font-size: 0.5rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.06em; padding: 0 0.25rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 2px; line-height: 1.4; }
	.ab-label { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
	.ab-divider { width: 1px; background: rgba(255,255,255,0.1); margin: 8px 0; }

	.ab-next { background: #1a3a0a; color: #92cc41; flex: 1; }
	.ab-phase { background: #0a2a3a; color: #3cbcfc; }
	.ab-respond { background: #1a0a3a; color: #b388ff; }
	.ab-strategy { background: #2a0a3a; color: #ce93d8; }
	.ab-objection { background: #3a0a0a; color: #f83800; }
	.ab-holdit { background: #3a2a0a; color: #f7d51d; }
	.ab-takethat { background: #0a3a15; color: #92cc41; }
	.ab-quit { background: rgba(255,255,255,0.03); color: #555; }
	.ab-done { background: var(--t-accent); color: #000; flex: 1; }

	/* ── Misc ── */
	.overlay-disclaimer { position: absolute; top: 52px; left: 50%; transform: translateX(-50%); font-size: 0.55rem; color: rgba(255,204,102,0.4); letter-spacing: 0.1em; text-transform: uppercase; z-index: 10; pointer-events: none; }
	.overlay-fps { position: absolute; bottom: 52px; left: 4px; font-size: 0.6rem; color: rgba(255,255,255,0.3); font-family: monospace; z-index: 10; pointer-events: none; }
	.overlay-error { position: absolute; top: 55px; left: 50%; transform: translateX(-50%); padding: 0.4rem 1rem; background: rgba(248,56,0,0.85); color: #fff; font-size: 0.75rem; border-radius: 4px; z-index: 30; }
	.overlay-model-loading { position: absolute; top: 55px; right: 8px; font-size: 0.65rem; color: var(--t-accent); padding: 0.3rem 0.75rem; background: rgba(0,0,0,0.8); border: 1px solid var(--t-accent); border-radius: 4px; z-index: 10; }
	.badge-3d { font-size: 0.6rem; padding: 0.15rem 0.4rem; background: #7c4dff; color: #fff; border-radius: 3px; font-weight: 700; letter-spacing: 0.04em; }

	/* ── Timeline Panel ── */
	.timeline-panel { position: absolute; bottom: 48px; left: 0; right: 0; background: rgba(0,0,0,0.94); border-top: 2px solid rgba(124,77,255,0.6); padding: 0.5rem 1rem; z-index: 22; }
	.timeline-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; color: #b388ff; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; }
	.timeline-title { font-weight: 700; }
	.timeline-time { margin-left: auto; font-family: monospace; color: #999; font-size: 0.7rem; }
	.timeline-loading { color: var(--t-accent); animation: pulse-text 1s infinite; font-size: 0.65rem; }
	.timeline-controls { display: flex; align-items: center; gap: 0.4rem; }
	.tl-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: #ccc; cursor: pointer; font-family: inherit; }
	.tl-btn:hover { color: #fff; border-color: rgba(255,255,255,0.3); }
	.tl-btn:disabled { opacity: 0.3; cursor: not-allowed; }
	.tl-play { width: 36px; height: 36px; background: rgba(124,77,255,0.2); border-color: #7c4dff; color: #b388ff; }
	.tl-play:hover { background: rgba(124,77,255,0.4); color: #fff; }
	.tl-scrubber { flex: 1; position: relative; height: 28px; display: flex; align-items: center; }
	.tl-scrubber input[type="range"] { width: 100%; height: 4px; -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.1); border-radius: 2px; outline: none; cursor: pointer; position: relative; z-index: 2; }
	.tl-scrubber input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; background: #b388ff; border-radius: 50%; cursor: pointer; }
	.tl-progress { position: absolute; left: 0; top: 50%; transform: translateY(-50%); height: 4px; background: #7c4dff; border-radius: 2px; pointer-events: none; z-index: 1; }
	.tl-speed { display: flex; gap: 0.15rem; }
	.tl-speed-btn { padding: 0.2rem 0.35rem; font-size: 0.55rem; background: none; border: 1px solid rgba(255,255,255,0.12); border-radius: 3px; color: #888; cursor: pointer; font-family: inherit; }
	.tl-speed-btn:hover { color: #ccc; }
	.tl-speed-btn.active { color: #b388ff; border-color: #7c4dff; background: rgba(124,77,255,0.15); }
	.tl-markers { position: relative; height: 8px; margin-top: 0.3rem; }
	.tl-marker { position: absolute; width: 4px; height: 8px; background: rgba(255,255,255,0.2); border: none; cursor: pointer; padding: 0; transform: translateX(-50%); }
	.tl-marker:hover { background: rgba(255,255,255,0.5); }
	.tl-marker.active { background: #b388ff; box-shadow: 0 0 6px rgba(124,77,255,0.6); }
</style>