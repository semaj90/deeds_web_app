<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { CourtroomScene } from '$lib/courtroom/courtroom-scene.svelte.js';
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
	let crtEnabled = $state(false);
	let textAnimating = $state(false);
	let displayedText = $state('');
	let currentSpeaker = $state('');
	let currentRole = $state('');

	// ── Babylon Scene ──
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let scene = new CourtroomScene();

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
	});

	// Init Babylon when canvas appears
	$effect(() => {
		if (canvasEl && view === 'courtroom' && !scene.isReady) {
			scene.init(canvasEl);
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
		const speed = 18; // ms per character
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

	// ── API Functions ──
	async function loadActiveSessions() {
		try {
			const res = await fetch('/api/simulation');
			if (res.ok) {
				const d = await res.json();
				activeSessions = d.sessions ?? [];
			}
		} catch {
			/* optional */
		}
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
			if (!res.ok) {
				error = result.error ?? 'Failed to start simulation';
				return;
			}
			sessionId = result.sessionId;
			dialogue = result.dialogue ?? [];
			await loadSessionState(result.sessionId);
			view = 'courtroom';
		} catch {
			error = 'Network error starting simulation';
		} finally {
			isLoading = false;
		}
	}

	async function resumeSession(sid: string) {
		isLoading = true;
		error = '';
		try {
			sessionId = sid;
			await loadSessionState(sid);
			view = 'courtroom';
		} catch {
			error = 'Failed to resume session';
		} finally {
			isLoading = false;
		}
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
		if (textAnimating) {
			skipTypewriter();
			return;
		}
		isAdvancing = true;
		error = '';
		try {
			const res = await fetch(`/api/simulation/${sessionId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, ...extra }),
			});
			const result = await res.json();
			if (!res.ok) {
				error = result.error ?? 'Failed to advance';
				return;
			}

			// Trigger objection effects
			if (action === 'objection' && scene.isReady) {
				scene.triggerObjection();
			}

			await loadSessionState(sessionId);
			if (result.status === 'completed') {
				sessionData = { ...sessionData!, status: 'completed' };
			}
		} catch {
			error = 'Network error advancing simulation';
		} finally {
			isAdvancing = false;
		}
	}

	async function abandonSession() {
		if (!sessionId) return;
		try {
			await fetch(`/api/simulation/${sessionId}`, { method: 'DELETE' });
		} catch {
			/* best effort */
		}
		backToLobby();
	}

	function backToLobby() {
		scene.dispose();
		sessionId = null;
		sessionData = null;
		dialogue = [];
		displayedText = '';
		currentSpeaker = '';
		currentRole = '';
		view = 'lobby';
		loadActiveSessions();
	}

	function formatCategory(cat: string): string {
		return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
	<!-- ════════ COURTROOM (Phoenix Wright) ════════ -->
	<div class="courtroom-wrapper">
		<!-- 3D Canvas (full viewport) -->
		<canvas class="courtroom-canvas" bind:this={canvasEl}></canvas>

		<!-- ── Overlay: Top Bar ── -->
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
				<button class="btn-icon" class:active={crtEnabled} onclick={() => (crtEnabled = !crtEnabled)} title="CRT filter">
					<Icon name="monitor" size={16} />
				</button>
				<button class="btn-icon" class:active={showEvidence} onclick={() => (showEvidence = !showEvidence)} title="Evidence panel">
					<Icon name="file-text" size={16} />
				</button>
				{#if sessionData?.status === 'completed'}
					<span class="badge-done">COMPLETED</span>
				{/if}
			</div>
		</div>

		<!-- ── Overlay: Progress Bar ── -->
		<div class="overlay-progress">
			<div class="progress-track">
				<div class="progress-fill" style="width: {progress}%"></div>
			</div>
		</div>

		<!-- ── Overlay: Evidence Sidebar ── -->
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

		<!-- ── Overlay: Strategy Wizard Panel ── -->
		{#if showStrategy && sessionId}
			<StrategyWizard
				{sessionId}
				onClose={() => (showStrategy = false)}
				onApply={(rec) => {
					// Inject recommendation into next turn via userInput
					advanceTurn('next_turn', { userInput: `[STRATEGY APPLIED: ${rec.role}] ${rec.what} — Reasoning: ${rec.why}` });
					showStrategy = false;
				}}
			/>
		{/if}

		<!-- ── Overlay: Dialogue Box (Bottom — Phoenix Wright style) ── -->
		<div class="dialogue-box" onclick={skipTypewriter}>
			{#if currentSpeaker}
				<div class="speaker-plate" style="background: {ROLE_COLORS[currentRole] ?? '#7c7c7c'}">
					{currentSpeaker}
				</div>
			{/if}
			<div class="dialogue-text">
				{displayedText}
				{#if textAnimating}
					<span class="text-cursor">▌</span>
				{/if}
			</div>
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
		</div>

		<!-- ── Overlay: Action Buttons (Right side) ── -->
		<div class="action-panel">
			{#if sessionData?.status === 'completed'}
				<button class="btn-action done" onclick={backToLobby}>RETURN TO LOBBY</button>
			{:else}
				<button
					class="btn-action next"
					onclick={() => advanceTurn('next_turn')}
					disabled={isAdvancing}
				>
					{textAnimating ? 'SKIP ▶' : isAdvancing ? '...' : 'NEXT ▶'}
				</button>

				<button
					class="btn-action phase"
					onclick={() => advanceTurn('next_phase')}
					disabled={isAdvancing || textAnimating}
				>
					NEXT PHASE ▶▶
				</button>

				<button
					class="btn-action strategy"
					onclick={() => (showStrategy = !showStrategy)}
					disabled={isAdvancing || textAnimating}
				>
					STRATEGY
				</button>

				<div class="objection-divider"></div>

				<button
					class="btn-action objection"
					onclick={() => advanceTurn('objection', { objectionType: 'hearsay', objectionBasis: 'Rule 802' })}
					disabled={isAdvancing || textAnimating}
				>
					OBJECTION!
				</button>

				<button
					class="btn-action holdit"
					onclick={() => advanceTurn('objection', { objectionType: 'relevance', objectionBasis: 'Rule 401/403' })}
					disabled={isAdvancing || textAnimating}
				>
					HOLD IT!
				</button>

				<button
					class="btn-action takethat"
					onclick={() => advanceTurn('objection', { objectionType: 'foundation', objectionBasis: 'Insufficient foundation' })}
					disabled={isAdvancing || textAnimating}
				>
					TAKE THAT!
				</button>

				<div class="objection-divider"></div>

				<button class="btn-action abandon" onclick={abandonSession}>
					QUIT
				</button>
			{/if}
		</div>

		<!-- ── Overlay: Disclaimer ── -->
		<div class="overlay-disclaimer">FICTIONAL SIMULATION</div>

		<!-- ── Overlay: FPS/Engine ── -->
		{#if scene.isReady}
			<div class="overlay-fps">
				{scene.engineType.toUpperCase()} | {scene.fps} FPS
			</div>
		{/if}

		{#if error}
			<div class="overlay-error">{error}</div>
		{/if}
	</div>
{/if}

<style>
	/* ═══ LOBBY ═══ */
	.lobby {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	.lobby-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2rem;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.lobby-header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--t-text);
		margin: 0;
		letter-spacing: 0.05em;
	}

	.disclaimer-tag {
		font-size: 0.7rem;
		color: var(--t-accent);
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--t-accent);
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.section { margin-bottom: 2rem; }

	.section-title {
		font-size: 0.85rem;
		color: var(--t-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.75rem;
	}

	.sessions-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.session-chip {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.6rem 1rem;
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 6px;
		cursor: pointer;
		color: var(--t-text);
		font-family: inherit;
		text-align: left;
		transition: border-color 0.15s;
	}

	.session-chip:hover { border-color: var(--t-accent); }

	.chip-type {
		font-size: 0.65rem;
		text-transform: uppercase;
		color: var(--t-text-muted);
		letter-spacing: 0.04em;
	}

	.chip-charge {
		font-size: 0.8rem;
		font-weight: 600;
	}

	.chip-progress {
		font-size: 0.7rem;
		color: var(--t-accent);
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}

	.filters {
		display: flex;
		gap: 0.5rem;
	}

	.filters select,
	.filters input {
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--t-border);
		border-radius: 6px;
		background: var(--t-panel);
		color: var(--t-text);
		font-size: 0.8rem;
	}

	.case-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1rem;
	}

	.case-card {
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 8px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.card-top {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.card-cat { color: var(--t-accent); font-weight: 600; }
	.card-jur { color: var(--t-text-muted); }

	.card-charge {
		font-size: 1rem;
		font-weight: 600;
		color: var(--t-text);
		margin: 0;
	}

	.card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--t-text-muted);
	}

	.card-statute {
		font-family: monospace;
		color: var(--t-accent);
	}

	.card-narrative {
		font-size: 0.78rem;
		color: var(--t-text-muted);
		line-height: 1.5;
		flex: 1;
		margin: 0;
	}

	.btn-prosecute {
		padding: 0.5rem 1rem;
		background: var(--t-accent);
		color: var(--t-bg);
		border: none;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		cursor: pointer;
		font-family: inherit;
		margin-top: 0.5rem;
		transition: opacity 0.15s;
	}

	.btn-prosecute:hover:not(:disabled) { opacity: 0.85; }
	.btn-prosecute:disabled { opacity: 0.5; cursor: not-allowed; }

	.error-msg {
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, #e57373 15%, transparent);
		color: #e57373;
		border-radius: 6px;
		font-size: 0.8rem;
		margin-bottom: 1rem;
	}

	/* ═══ COURTROOM ═══ */
	.courtroom-wrapper {
		position: relative;
		width: 100%;
		height: calc(100vh - 60px);
		overflow: hidden;
		background: #0a0a0c;
	}

	.courtroom-canvas {
		width: 100%;
		height: 100%;
		display: block;
	}

	/* ── Top Bar ── */
	.overlay-top {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.85), transparent);
		z-index: 10;
	}

	.btn-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.4);
		color: #ccc;
		cursor: pointer;
		font-family: inherit;
	}

	.btn-icon:hover { color: #fff; border-color: rgba(255, 255, 255, 0.5); }
	.btn-icon.active { color: var(--t-accent); border-color: var(--t-accent); }

	.top-case-info {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.8rem;
	}

	.top-case-num { font-family: monospace; color: #888; }
	.top-charge { font-weight: 600; color: #eee; }
	.top-defendant { color: #999; }

	.top-phase {
		font-size: 0.75rem;
		color: var(--t-accent);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}

	.top-controls {
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}

	.badge-done {
		font-size: 0.65rem;
		padding: 0.2rem 0.5rem;
		background: var(--t-accent);
		color: #000;
		border-radius: 3px;
		font-weight: 700;
		letter-spacing: 0.04em;
	}

	/* ── Progress Bar ── */
	.overlay-progress {
		position: absolute;
		top: 44px;
		left: 0;
		right: 0;
		height: 3px;
		z-index: 10;
	}

	.progress-track {
		width: 100%;
		height: 100%;
		background: rgba(255, 255, 255, 0.1);
	}

	.progress-fill {
		height: 100%;
		background: var(--t-accent);
		transition: width 0.4s ease;
	}

	/* ── Evidence Sidebar ── */
	.evidence-sidebar {
		position: absolute;
		top: 50px;
		right: 0;
		width: 300px;
		max-height: calc(100% - 200px);
		overflow-y: auto;
		background: rgba(0, 0, 0, 0.85);
		border-left: 1px solid rgba(255, 255, 255, 0.1);
		padding: 1rem;
		z-index: 15;
	}

	.evidence-sidebar h3 {
		font-size: 0.8rem;
		color: var(--t-accent);
		letter-spacing: 0.06em;
		margin: 0 0 0.75rem;
	}

	.evidence-group {
		margin-bottom: 1rem;
	}

	.evidence-group h4 {
		font-size: 0.65rem;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 0.4rem;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.evidence-item {
		font-size: 0.75rem;
		color: #ccc;
		padding: 0.25rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.statute-ref {
		font-family: monospace;
		color: var(--t-accent);
		font-size: 0.7rem;
	}

	.actor-role {
		font-size: 0.65rem;
		text-transform: uppercase;
		font-weight: 600;
	}

	.evidence-item.timeline {
		border-left: 2px solid rgba(255, 255, 255, 0.1);
		padding-left: 0.5rem;
		margin-bottom: 0.3rem;
	}

	.evt-type {
		font-size: 0.65rem;
		color: var(--t-accent);
		text-transform: uppercase;
	}

	.evt-desc {
		font-size: 0.7rem;
		color: #999;
	}

	/* ── Dialogue Box (Phoenix Wright style) ── */
	.dialogue-box {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 80px;
		min-height: 120px;
		max-height: 180px;
		background: rgba(0, 0, 0, 0.88);
		border-top: 2px solid rgba(255, 255, 255, 0.15);
		padding: 1rem 1.5rem;
		z-index: 20;
		cursor: pointer;
	}

	.speaker-plate {
		display: inline-block;
		padding: 0.2rem 0.8rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: #000;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin-bottom: 0.5rem;
		border-radius: 2px;
	}

	.dialogue-text {
		font-size: 0.95rem;
		line-height: 1.6;
		color: #f0f0f0;
		font-family: 'Courier New', monospace;
		white-space: pre-wrap;
		max-height: 100px;
		overflow-y: auto;
	}

	.text-cursor {
		animation: blink 0.6s infinite;
		color: var(--t-accent);
	}

	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}

	.canon-refs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.4rem;
	}

	.canon-tag {
		font-size: 0.6rem;
		padding: 0.1rem 0.35rem;
		background: rgba(255, 204, 102, 0.15);
		color: #ffcc66;
		border-radius: 2px;
		font-family: monospace;
	}

	/* ── Action Panel (right side buttons) ── */
	.action-panel {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 80px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		z-index: 20;
	}

	.btn-action {
		padding: 0.5rem 0.25rem;
		border: none;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
		font-family: inherit;
		transition: filter 0.1s;
	}

	.btn-action:hover:not(:disabled) { filter: brightness(1.2); }
	.btn-action:disabled { opacity: 0.4; cursor: not-allowed; }

	.btn-action.next {
		background: #92cc41;
		color: #000;
		font-size: 0.7rem;
		padding: 0.7rem;
	}

	.btn-action.phase {
		background: #3cbcfc;
		color: #000;
	}

	.btn-action.strategy {
		background: #7c4dff;
		color: #fff;
		font-size: 0.6rem;
	}

	.btn-action.objection {
		background: #f83800;
		color: #fff;
		font-size: 0.7rem;
		padding: 0.6rem;
	}

	.btn-action.holdit {
		background: #f7d51d;
		color: #000;
	}

	.btn-action.takethat {
		background: #92cc41;
		color: #000;
	}

	.btn-action.abandon {
		background: rgba(255, 255, 255, 0.08);
		color: #888;
		font-size: 0.55rem;
	}

	.btn-action.done {
		background: var(--t-accent);
		color: #000;
		font-size: 0.65rem;
		padding: 0.8rem;
	}

	.objection-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
	}

	/* ── Misc Overlays ── */
	.overlay-disclaimer {
		position: absolute;
		top: 52px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.55rem;
		color: rgba(255, 204, 102, 0.4);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		z-index: 10;
		pointer-events: none;
	}

	.overlay-fps {
		position: absolute;
		bottom: 4px;
		left: 4px;
		font-size: 0.6rem;
		color: rgba(255, 255, 255, 0.3);
		font-family: monospace;
		z-index: 10;
		pointer-events: none;
	}

	.overlay-error {
		position: absolute;
		top: 55px;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.4rem 1rem;
		background: rgba(248, 56, 0, 0.85);
		color: #fff;
		font-size: 0.75rem;
		border-radius: 4px;
		z-index: 30;
	}
</style>
