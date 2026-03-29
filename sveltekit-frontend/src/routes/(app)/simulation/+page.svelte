<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import Icon from '$lib/components/ui/Icon.svelte';
	import CourtroomHUD from '$lib/components/courtroom/CourtroomHUD.svelte';

	let { data } = $props();

	// --- Code Review Mode (from codebase-graph "Prosecute Code") ---
	let codeReviewMode = $state(false);
	let codeReviewFile = $state('');
	let codeReviewCharge = $state('');
	let codeReviewActive = $state(false);
	let codeReviewDialogue = $state<DialogueEntry[]>([]);
	let codeReviewLoading = $state(false);

	// --- Types ---
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

	// --- State ---
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
	let dialogueContainer = $state<HTMLElement | null>(null);
	let showCaseBrief = $state(false);

	// --- Derived ---
	let filteredCases = $derived.by(() => {
		let cases = data.fictionalCases;
		if (selectedCategory !== 'all') {
			cases = cases.filter((c) => c.category === selectedCategory);
		}
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			cases = cases.filter(
				(c) =>
					c.charge.toLowerCase().includes(q) ||
					c.defendantName.toLowerCase().includes(q) ||
					c.category.toLowerCase().includes(q) ||
					(c.jurisdiction ?? '').toLowerCase().includes(q)
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
		sessionData ? ((sessionData.currentPhase + 1) / (sessionData.phases?.length ?? 1)) * 100 : 0
	);

	// --- Lifecycle ---
	onMount(() => {
		loadActiveSessions();

		// Check for code-review mode from query params
		const params = new URLSearchParams(window.location.search);
		if (params.get('mode') === 'code-review') {
			codeReviewMode = true;
			codeReviewFile = params.get('file') || '';
			codeReviewCharge = decodeURIComponent(params.get('charge') || '');
			if (codeReviewFile && codeReviewCharge) {
				startCodeReview();
			}
		}
	});

	$effect(() => {
		if (dialogueContainer && dialogue.length > 0) {
			requestAnimationFrame(() => {
				dialogueContainer?.scrollTo({ top: dialogueContainer.scrollHeight, behavior: 'smooth' });
			});
		}
	});

	// --- API Functions ---
	async function loadActiveSessions() {
		try {
			const res = await fetch('/api/simulation');
			if (res.ok) {
				const data = await res.json();
				activeSessions = data.sessions ?? [];
			}
		} catch {
			// Ignore — sessions list is optional
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
		} catch (e) {
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
		sessionData = result.session;
		dialogue = result.session?.dialogueHistory ?? [];
	}

	async function advanceTurn(action: string, extra?: Record<string, string>) {
		if (!sessionId || isAdvancing) return;
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
			// Reload full state to sync
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
			sessionId = null;
			sessionData = null;
			dialogue = [];
			view = 'lobby';
			await loadActiveSessions();
		} catch {
			error = 'Failed to abandon session';
		}
	}

	function backToLobby() {
		sessionId = null;
		sessionData = null;
		dialogue = [];
		view = 'lobby';
		codeReviewActive = false;
		codeReviewMode = false;
		// Clear query params
		window.history.replaceState({}, '', window.location.pathname);
		loadActiveSessions();
	}

	// --- Code Review Functions ---
	async function startCodeReview() {
		codeReviewLoading = true;
		codeReviewActive = true;
		view = 'courtroom';
		error = '';

		// Build initial prosecution dialogue from LLM
		const fileName = codeReviewFile.split('/').pop() || codeReviewFile;
		codeReviewDialogue = [
			{
				phase: 'opening_statements',
				turn: 0,
				speaker: 'Judge',
				role: 'judge',
				content: `Court is now in session for Code Review Case: ${fileName}. The prosecution may present their charges.`,
				canonRefs: [],
				timestamp: new Date().toISOString(),
			},
			{
				phase: 'opening_statements',
				turn: 1,
				speaker: 'Prosecutor',
				role: 'prosecutor',
				content: `Your Honor, the prosecution brings the following charges against file "${fileName}":\n\n${codeReviewCharge}`,
				canonRefs: [],
				timestamp: new Date().toISOString(),
			},
		];
		dialogue = codeReviewDialogue;

		// Build a mock session for the HUD
		sessionData = {
			caseData: {
				caseNumber: `CR-${Date.now().toString(36).toUpperCase()}`,
				charge: `Code Quality Violations: ${fileName}`,
				defendantName: fileName,
			},
			currentPhase: 0,
			phases: ['opening_statements', 'evidence_presentation', 'cross_examination', 'closing_arguments', 'verdict'],
			status: 'active',
		};

		// Call LLM for analysis verdict
		try {
			const res = await fetch('/api/codebase-index/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filePath: codeReviewFile }),
			});
			if (res.ok) {
				const data = await res.json();
				const analysis = data.analysis;
				const grade = analysis?.healthGrade || 'C';
				const risks = (analysis?.risks || []).map((r: string) => `  - ${r}`).join('\n');
				const suggestions = (analysis?.suggestions || []).map((s: string) => `  - ${s}`).join('\n');

				codeReviewDialogue = [
					...codeReviewDialogue,
					{
						phase: 'evidence_presentation',
						turn: 2,
						speaker: 'Expert Witness (AI Analyzer)',
						role: 'witness',
						content: `Your Honor, I have completed my analysis.\n\nHealth Grade: ${grade}\nComplexity Score: ${analysis?.complexityScore ?? 'N/A'}/10\nCoupling Score: ${analysis?.couplingScore ?? 'N/A'}/10\n\nSummary: ${analysis?.summary || 'Analysis complete.'}\n\nIdentified Risks:\n${risks || '  (none)'}`,
						canonRefs: [],
						timestamp: new Date().toISOString(),
					},
					{
						phase: 'closing_arguments',
						turn: 3,
						speaker: 'Prosecutor',
						role: 'prosecutor',
						content: `Based on the evidence presented, the prosecution recommends the following remediation:\n\n${suggestions || '  No specific suggestions.'}`,
						canonRefs: [],
						timestamp: new Date().toISOString(),
					},
					{
						phase: 'verdict',
						turn: 4,
						speaker: 'Judge',
						role: 'judge',
						content: `The court renders its verdict: Grade ${grade}.\n\n${grade === 'A' || grade === 'B' ? 'This file is found NOT GUILTY of significant code quality violations. The defendant is acquitted.' : grade === 'C' ? 'The court finds MINOR VIOLATIONS. The defendant is sentenced to refactoring review.' : 'The court finds GUILTY of code quality violations. Immediate refactoring is ORDERED.'}`,
						canonRefs: [],
						timestamp: new Date().toISOString(),
					},
				];
				dialogue = codeReviewDialogue;
				sessionData = { ...sessionData!, currentPhase: 4, status: 'completed' };
			}
		} catch {
			error = 'Failed to analyze code for review';
		} finally {
			codeReviewLoading = false;
		}
	}

	function roleIcon(role: string): string {
		switch (role) {
			case 'prosecutor':
				return 'scale';
			case 'defense':
				return 'shield';
			case 'judge':
				return 'gavel';
			case 'witness':
				return 'user';
			case 'narrator':
				return 'book-open';
			default:
				return 'message-square';
		}
	}

	function roleColor(role: string): string {
		switch (role) {
			case 'prosecutor':
				return 'var(--t-accent)';
			case 'defense':
				return '#e57373';
			case 'judge':
				return '#ffd54f';
			case 'witness':
				return '#81c784';
			case 'narrator':
				return 'var(--t-text-muted)';
			default:
				return 'var(--t-text)';
		}
	}

	function formatCategory(cat: string): string {
		return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
</script>

<svelte:head>
	<title>Courtroom Simulation — Deeds</title>
</svelte:head>

{#if view === 'lobby'}
	<!-- ====== LOBBY VIEW ====== -->
	<div class="sim-page">
		<header class="sim-header">
			<div class="header-left">
				<Icon name="scale" size={24} />
				<h1>Courtroom Simulation</h1>
			</div>
			<p class="disclaimer">FICTIONAL TRAINING SCENARIO — Not legal advice</p>
		</header>

		<!-- Active Sessions -->
		{#if activeSessions.length > 0}
			<section class="sessions-section">
				<h2>Active Sessions</h2>
				<div class="sessions-grid">
					{#each activeSessions as sess}
						<button class="session-card" onclick={() => resumeSession(sess.sessionId)}>
							<div class="session-meta">
								<span class="session-type">{sess.procedureType}</span>
								<span class="session-phase">
									Phase {sess.currentPhase + 1}/{sess.totalPhases}
								</span>
							</div>
							<div class="session-charge">{sess.charge}</div>
							<div class="session-defendant">v. {sess.defendant}</div>
							<div class="session-case">{sess.caseNumber}</div>
						</button>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Case Selection -->
		<section class="cases-section">
			<div class="cases-toolbar">
				<h2>Select a Case ({filteredCases.length})</h2>
				<div class="filters">
					<select bind:value={selectedCategory}>
						{#each categories as cat}
							<option value={cat}>{cat === 'all' ? 'All Categories' : formatCategory(cat)}</option>
						{/each}
					</select>
					<input
						type="text"
						placeholder="Search cases..."
						bind:value={searchQuery}
					/>
				</div>
			</div>

			{#if error}
				<div class="error-banner">{error}</div>
			{/if}

			<div class="cases-grid">
				{#each filteredCases as fc}
					<div class="case-card">
						<div class="case-card-header">
							<span class="case-category">{formatCategory(fc.category)}</span>
							<span class="case-jurisdiction">{fc.jurisdiction ?? 'US-FED'}</span>
						</div>
						<h3 class="case-charge">{fc.charge}</h3>
						<div class="case-details">
							<span>v. <strong>{fc.defendantName}</strong></span>
							{#if fc.jurisdictionCity}
								<span>{fc.jurisdictionCity}</span>
							{/if}
							{#if fc.primaryStatute}
								<span class="case-statute">{fc.primaryStatute}</span>
							{/if}
						</div>
						<p class="case-narrative">{fc.narrative.slice(0, 180)}{fc.narrative.length > 180 ? '...' : ''}</p>
						<button
							class="btn-start"
							onclick={() => startSimulation(fc.id)}
							disabled={isLoading}
						>
							{#if isLoading}
								Starting...
							{:else}
								<Icon name="play" size={14} /> Begin Prosecution
							{/if}
						</button>
					</div>
				{/each}
			</div>

			{#if filteredCases.length === 0}
				<div class="empty-state">
					<Icon name="search" size={32} />
					<p>No cases match your filters.</p>
				</div>
			{/if}
		</section>
	</div>

{:else}
	<!-- ====== COURTROOM VIEW ====== -->
	<div class="courtroom">
		<!-- Top Bar -->
		<header class="courtroom-header">
			<button class="btn-back" onclick={backToLobby}>
				<Icon name="arrow-left" size={16} /> Back
			</button>
			<div class="courtroom-info">
				<span class="court-case">
					{sessionData?.caseData?.caseNumber ?? ''}
				</span>
				<span class="court-charge">
					{sessionData?.caseData?.charge ?? ''}
				</span>
				<span class="court-defendant">
					v. {sessionData?.caseData?.defendantName ?? ''}
				</span>
			</div>
			<div class="courtroom-status">
				{#if sessionData?.status === 'completed'}
					<span class="badge-completed">COMPLETED</span>
				{:else}
					<span class="badge-active">ACTIVE</span>
				{/if}
			</div>
		</header>

		<!-- Phase Progress -->
		<div class="phase-bar">
			<div class="phase-label">
				<Icon name="flag" size={14} />
				Phase {(sessionData?.currentPhase ?? 0) + 1}/{sessionData?.phases?.length ?? 0}:
				<strong>{currentPhaseName.replace(/_/g, ' ').toUpperCase()}</strong>
			</div>
			<div class="progress-track">
				<div class="progress-fill" style="width: {progress}%"></div>
			</div>
		</div>

		<!-- Disclaimer -->
		<div class="courtroom-disclaimer">
			FICTIONAL TRAINING SCENARIO — All persons, events, and legal proceedings are entirely fictional.
			This is not legal advice.
		</div>

		<!-- Dialogue Transcript (scrollable history) -->
		<div class="dialogue-area" bind:this={dialogueContainer}>
			{#each dialogue.slice(0, -1) as entry, i}
				<div class="dialogue-entry" style="--role-color: {roleColor(entry.role)}">
					<div class="dialogue-speaker">
						<Icon name={roleIcon(entry.role)} size={16} />
						<span class="speaker-name">{entry.speaker}</span>
						<span class="speaker-role">{entry.role}</span>
						{#if entry.phase}
							<span class="speaker-phase">{entry.phase.replace(/_/g, ' ')}</span>
						{/if}
					</div>
					<div class="dialogue-content">{entry.content}</div>
					{#if entry.canonRefs && entry.canonRefs.length > 0}
						<div class="canon-refs">
							{#each entry.canonRefs as ref}
								<span class="canon-tag">{ref}</span>
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			{#if dialogue.length === 0 && !isLoading}
				<div class="empty-dialogue">
					<Icon name="message-square" size={32} />
					<p>Simulation ready. Advance to begin proceedings.</p>
				</div>
			{/if}
		</div>

		<!-- Error -->
		{#if error}
			<div class="error-banner">{error}</div>
		{/if}

		<!-- Code Review banner -->
		{#if codeReviewActive}
			<div class="code-review-banner">
				<Icon name="code" size={14} />
				<span>CODE REVIEW MODE — File: <strong>{codeReviewFile.split('/').pop()}</strong></span>
				{#if codeReviewLoading}
					<span class="cr-loading">Analyzing...</span>
				{/if}
			</div>
		{/if}

		<!-- Game-style HUD (Phoenix Wright mode) -->
		<CourtroomHUD
			currentEntry={dialogue.length > 0 ? dialogue[dialogue.length - 1] : null}
			{sessionData}
			isAdvancing={codeReviewActive ? false : isAdvancing}
			status={sessionData?.status ?? 'active'}
			onAction={codeReviewActive ? () => {} : advanceTurn}
			onAbandon={codeReviewActive ? backToLobby : abandonSession}
		/>
	</div>
{/if}

<style>
	/* ===== LAYOUT ===== */
	.sim-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	.courtroom {
		display: flex;
		flex-direction: column;
		height: calc(100vh - 60px);
		background: var(--t-bg);
	}

	/* ===== HEADER ===== */
	.sim-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2rem;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.sim-header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--t-text);
		margin: 0;
	}

	.disclaimer {
		font-size: 0.75rem;
		color: var(--t-accent);
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--t-accent);
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* ===== SESSIONS ===== */
	.sessions-section {
		margin-bottom: 2rem;
	}

	.sessions-section h2 {
		font-size: 1rem;
		color: var(--t-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.75rem;
	}

	.sessions-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 0.75rem;
	}

	.session-card {
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 8px;
		padding: 1rem;
		cursor: pointer;
		text-align: left;
		transition: border-color 0.15s;
		font-family: inherit;
		color: var(--t-text);
	}

	.session-card:hover {
		border-color: var(--t-accent);
	}

	.session-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--t-text-muted);
		margin-bottom: 0.5rem;
	}

	.session-type {
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.session-charge {
		font-weight: 600;
		font-size: 0.9rem;
		margin-bottom: 0.25rem;
	}

	.session-defendant {
		font-size: 0.85rem;
		color: var(--t-text-muted);
	}

	.session-case {
		font-size: 0.75rem;
		color: var(--t-text-muted);
		margin-top: 0.5rem;
		font-family: monospace;
	}

	/* ===== CASES ===== */
	.cases-section h2 {
		font-size: 1rem;
		color: var(--t-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.cases-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
		gap: 1rem;
		flex-wrap: wrap;
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
		font-size: 0.85rem;
	}

	.filters input {
		min-width: 200px;
	}

	.cases-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
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

	.case-card-header {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.case-category {
		color: var(--t-accent);
		font-weight: 600;
	}

	.case-jurisdiction {
		color: var(--t-text-muted);
	}

	.case-charge {
		font-size: 1rem;
		font-weight: 600;
		color: var(--t-text);
		margin: 0;
	}

	.case-details {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--t-text-muted);
	}

	.case-statute {
		font-family: monospace;
		color: var(--t-accent);
	}

	.case-narrative {
		font-size: 0.8rem;
		color: var(--t-text-muted);
		line-height: 1.5;
		flex: 1;
		margin: 0;
	}

	.btn-start {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--t-accent);
		color: var(--t-bg);
		border: none;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		margin-top: 0.5rem;
		transition: opacity 0.15s;
		font-family: inherit;
	}

	.btn-start:hover:not(:disabled) {
		opacity: 0.85;
	}

	.btn-start:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ===== COURTROOM HEADER ===== */
	.courtroom-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1.5rem;
		background: var(--t-panel);
		border-bottom: 1px solid var(--t-border);
	}

	.btn-back {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.35rem 0.75rem;
		background: transparent;
		border: 1px solid var(--t-border);
		border-radius: 6px;
		color: var(--t-text-muted);
		cursor: pointer;
		font-size: 0.8rem;
		font-family: inherit;
	}

	.btn-back:hover {
		color: var(--t-text);
		border-color: var(--t-text-muted);
	}

	.courtroom-info {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.85rem;
	}

	.court-case {
		font-family: monospace;
		color: var(--t-text-muted);
	}

	.court-charge {
		font-weight: 600;
		color: var(--t-text);
	}

	.court-defendant {
		color: var(--t-text-muted);
	}

	.badge-active {
		font-size: 0.7rem;
		padding: 0.2rem 0.6rem;
		border-radius: 4px;
		background: var(--t-accent);
		color: var(--t-bg);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	.badge-completed {
		font-size: 0.7rem;
		padding: 0.2rem 0.6rem;
		border-radius: 4px;
		background: var(--t-text-muted);
		color: var(--t-bg);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	/* ===== PHASE BAR ===== */
	.phase-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1.5rem;
		background: var(--t-panel);
		border-bottom: 1px solid var(--t-border);
	}

	.phase-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--t-text-muted);
		white-space: nowrap;
	}

	.progress-track {
		flex: 1;
		height: 6px;
		background: var(--t-border);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--t-accent);
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	/* ===== DISCLAIMER ===== */
	.courtroom-disclaimer {
		padding: 0.4rem 1.5rem;
		font-size: 0.7rem;
		text-align: center;
		color: var(--t-accent);
		background: color-mix(in srgb, var(--t-accent) 8%, transparent);
		border-bottom: 1px solid var(--t-border);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	/* ===== DIALOGUE ===== */
	.dialogue-area {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.dialogue-entry {
		border-left: 3px solid var(--role-color, var(--t-border));
		padding: 0.75rem 1rem;
		background: var(--t-panel);
		border-radius: 0 6px 6px 0;
	}

	.dialogue-speaker {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
		color: var(--role-color, var(--t-text));
	}

	.speaker-name {
		font-weight: 600;
		font-size: 0.85rem;
	}

	.speaker-role {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.7;
	}

	.speaker-phase {
		font-size: 0.65rem;
		color: var(--t-text-muted);
		margin-left: auto;
		text-transform: uppercase;
	}

	.dialogue-content {
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--t-text);
		white-space: pre-wrap;
	}

	.canon-refs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.5rem;
	}

	.canon-tag {
		font-size: 0.65rem;
		padding: 0.1rem 0.4rem;
		background: color-mix(in srgb, var(--t-accent) 15%, transparent);
		color: var(--t-accent);
		border-radius: 3px;
		font-family: monospace;
	}

	/* Typing indicator */
	.typing-indicator {
		display: flex;
		gap: 4px;
		padding: 0.5rem 0;
	}

	.typing-indicator span {
		width: 6px;
		height: 6px;
		background: var(--t-text-muted);
		border-radius: 50%;
		animation: typing 1.2s infinite ease-in-out;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing {
		0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
		30% { opacity: 1; transform: translateY(-3px); }
	}

	.empty-dialogue {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		flex: 1;
		color: var(--t-text-muted);
		opacity: 0.6;
	}

	/* ===== ACTION BAR ===== */
	.action-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: var(--t-panel);
		border-top: 1px solid var(--t-border);
		flex-wrap: wrap;
	}

	.btn-action {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--t-border);
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
		background: transparent;
		color: var(--t-text);
	}

	.btn-action.primary {
		background: var(--t-accent);
		color: var(--t-bg);
		border-color: var(--t-accent);
	}

	.btn-action.primary:hover:not(:disabled) {
		opacity: 0.85;
	}

	.btn-action.secondary:hover:not(:disabled) {
		border-color: var(--t-accent);
		color: var(--t-accent);
	}

	.btn-action.objection {
		font-size: 0.75rem;
		color: #e57373;
		border-color: #e57373;
	}

	.btn-action.objection:hover:not(:disabled) {
		background: #e57373;
		color: var(--t-bg);
	}

	.btn-action.danger {
		color: #e57373;
		border-color: transparent;
		margin-left: auto;
	}

	.btn-action.danger:hover {
		border-color: #e57373;
	}

	.btn-action:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.objection-group {
		display: flex;
		gap: 0.35rem;
		margin-left: 0.5rem;
		padding-left: 0.5rem;
		border-left: 1px solid var(--t-border);
	}

	.completed-msg {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--t-accent);
		font-size: 0.85rem;
		font-weight: 500;
	}

	/* ===== ERROR ===== */
	.error-banner {
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, #e57373 15%, transparent);
		color: #e57373;
		border-radius: 6px;
		font-size: 0.85rem;
		margin: 0.5rem 1.5rem;
	}

	/* ===== EMPTY STATE ===== */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 3rem;
		color: var(--t-text-muted);
		opacity: 0.6;
	}

	.courtroom-status {
		flex-shrink: 0;
	}

	/* ===== CODE REVIEW MODE ===== */
	.code-review-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 1.5rem;
		font-size: 0.75rem;
		text-align: center;
		color: var(--t-accent);
		background: color-mix(in srgb, var(--t-accent) 8%, transparent);
		border-bottom: 1px solid var(--t-border);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.cr-loading {
		margin-left: auto;
		opacity: 0.7;
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 1; }
	}
</style>