<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface DialogueEntry {
		phase?: string;
		turn?: number;
		speaker: string;
		role: string;
		content: string;
		canonRefs?: string[];
		timestamp?: string;
	}

	interface SessionData {
		caseData?: { caseNumber?: string; charge?: string; defendantName?: string };
		currentPhase?: number;
		phases?: string[];
		status?: string;
	}

	let {
		currentEntry = null,
		sessionData = null,
		isAdvancing = false,
		status = 'active',
		onAction,
		onAbandon,
	}: {
		currentEntry?: DialogueEntry | null;
		sessionData?: SessionData | null;
		isAdvancing?: boolean;
		status?: string;
		onAction: (action: string, extra?: Record<string, string>) => void;
		onAbandon?: () => void;
	} = $props();

	// ── Typewriter ─────────────────────────────────────────────
	let displayedText = $state('');
	let typewriterDone = $state(true);
	let typewriterIndex = $state(0);
	let typewriterTimer: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		const target = currentEntry?.content ?? '';
		if (!target) { displayedText = ''; return; }
		if (typewriterTimer) clearInterval(typewriterTimer);
		displayedText = '';
		typewriterDone = false;
		typewriterIndex = 0;
		let i = 0;
		typewriterTimer = setInterval(() => {
			if (i < target.length) {
				displayedText = target.slice(0, i + 1);
				i++;
				typewriterIndex = i;
			} else {
				typewriterDone = true;
				if (typewriterTimer) clearInterval(typewriterTimer);
			}
		}, 16);
		return () => { if (typewriterTimer) clearInterval(typewriterTimer); };
	});

	function skipTypewriter() {
		if (!typewriterDone && currentEntry) {
			if (typewriterTimer) clearInterval(typewriterTimer);
			displayedText = currentEntry.content;
			typewriterDone = true;
		}
	}

	// ── OBJECTION flash ─────────────────────────────────────────
	let objectionActive = $state(false);
	let objectionTimer: ReturnType<typeof setTimeout> | null = null;

	function triggerObjection(type: string, basis: string) {
		objectionActive = true;
		if (objectionTimer) clearTimeout(objectionTimer);
		objectionTimer = setTimeout(() => { objectionActive = false; }, 1600);
		onAction('objection', { objectionType: type, objectionBasis: basis });
	}

	// ── Evidence panel ──────────────────────────────────────────
	let showEvidencePanel = $state(false);
	let showObjectionMenu = $state(false);

	// ── Keyboard shortcuts ──────────────────────────────────────
	function handleKeyboard(e: KeyboardEvent) {
		// Don't capture when typing in inputs
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
		if (status === 'completed') return;

		switch (e.key) {
			case 'Enter':
			case ' ':
				e.preventDefault();
				if (!typewriterDone) {
					skipTypewriter();
				} else if (!isAdvancing) {
					onAction('next_turn');
				}
				break;
			case 'o':
			case 'O':
				if (!isAdvancing) {
					e.preventDefault();
					showObjectionMenu = !showObjectionMenu;
					showEvidencePanel = false;
				}
				break;
			case 'p':
			case 'P':
				if (!isAdvancing) {
					e.preventDefault();
					onAction('cross_examine');
				}
				break;
			case 'e':
			case 'E':
				if (!isAdvancing) {
					e.preventDefault();
					showEvidencePanel = !showEvidencePanel;
					showObjectionMenu = false;
				}
				break;
			case 'n':
			case 'N':
				if (!isAdvancing) {
					e.preventDefault();
					onAction('next_phase');
				}
				break;
			case 'Escape':
				showObjectionMenu = false;
				showEvidencePanel = false;
				break;
			case '1': case '2': case '3': case '4':
				if (showObjectionMenu) {
					e.preventDefault();
					const objections = [
						{ type: 'hearsay', basis: 'Rule 802 - Hearsay' },
						{ type: 'relevance', basis: 'Rule 401/403 - Relevance' },
						{ type: 'foundation', basis: 'Insufficient Foundation' },
						{ type: 'speculation', basis: 'Rule 701 - Speculation' },
					];
					const idx = parseInt(e.key) - 1;
					triggerObjection(objections[idx].type, objections[idx].basis);
					showObjectionMenu = false;
				}
				break;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeyboard);
		return () => window.removeEventListener('keydown', handleKeyboard);
	});

	// ── Role helpers ────────────────────────────────────────────
	function roleColor(role: string): string {
		const map: Record<string, string> = {
			prosecutor: '#ff5555',
			defense:    '#4499ff',
			judge:      '#ffd700',
			witness:    '#44cc88',
			narrator:   '#888888',
		};
		return map[role?.toLowerCase()] ?? '#aaaaaa';
	}

	function roleIcon(role: string): string {
		const map: Record<string, string> = {
			prosecutor: 'scale',
			defense:    'shield',
			judge:      'gavel',
			witness:    'user',
			narrator:   'book-open',
		};
		return map[role?.toLowerCase()] ?? 'message-square';
	}

	// ── Derived ─────────────────────────────────────────────────
	let currentPhaseName = $derived(
		(sessionData?.phases?.[sessionData?.currentPhase ?? 0] ?? 'PROCEEDINGS')
			.replace(/_/g, ' ')
			.toUpperCase()
	);

	let phaseCount = $derived(sessionData?.phases?.length ?? 0);
	let phaseIndex = $derived(sessionData?.currentPhase ?? 0);
</script>

<!-- OBJECTION fullscreen flash -->
{#if objectionActive}
	<div class="objection-overlay" aria-hidden="true">
		<span class="objection-text">OBJECTION!</span>
	</div>
{/if}

<!-- Evidence locker slide-up -->
{#if showEvidencePanel}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="evidence-panel" onclick={(e) => e.stopPropagation()}>
		<div class="evidence-panel-header">
			<span class="evidence-panel-title">◈ EVIDENCE LOCKER</span>
			<button class="evidence-close" onclick={() => showEvidencePanel = false}>✕</button>
		</div>
		<div class="evidence-panel-body">
			{#each ['Exhibit A — Police Report', 'Exhibit B — Surveillance Footage', 'Exhibit C — DNA Analysis', 'Exhibit D — Witness Statement', 'Exhibit E — Financial Records'] as item}
				<button
					class="evidence-item"
					onclick={() => { onAction('present_evidence', { exhibit: item }); showEvidencePanel = false; }}
				>
					<Icon name="file-text" size={13} />
					{item}
				</button>
			{/each}
		</div>
	</div>
{/if}

<!-- Objection type menu -->
{#if showObjectionMenu}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="objection-menu" onclick={(e) => e.stopPropagation()}>
		<div class="objection-menu-title">⚖ SELECT GROUNDS</div>
		<button onclick={() => { triggerObjection('hearsay', 'Rule 802 - Hearsay'); showObjectionMenu = false; }}>
			<span class="obj-num">1</span> Hearsay <span class="rule-tag">FRE 802</span>
		</button>
		<button onclick={() => { triggerObjection('relevance', 'Rule 401/403 - Relevance'); showObjectionMenu = false; }}>
			<span class="obj-num">2</span> Relevance <span class="rule-tag">FRE 401</span>
		</button>
		<button onclick={() => { triggerObjection('foundation', 'Insufficient Foundation'); showObjectionMenu = false; }}>
			<span class="obj-num">3</span> Foundation <span class="rule-tag">FRE 602</span>
		</button>
		<button onclick={() => { triggerObjection('speculation', 'Rule 701 - Speculation'); showObjectionMenu = false; }}>
			<span class="obj-num">4</span> Speculation <span class="rule-tag">FRE 701</span>
		</button>
		<button class="cancel-btn" onclick={() => showObjectionMenu = false}>ESC TO CANCEL</button>
	</div>
{/if}

<div class="hud-root" class:objecting={objectionActive}>
	<!-- scanline texture -->
	<div class="hud-scanlines" aria-hidden="true"></div>

	<!-- ── Case banner ── -->
	<div class="case-banner">
		<span class="case-num">CASE {sessionData?.caseData?.caseNumber ?? '#----'}</span>
		<span class="case-sep">│</span>
		<span class="case-phase">PHASE: {currentPhaseName}</span>
		<span class="case-sep">│</span>
		<span class="case-charge">{sessionData?.caseData?.charge ?? ''}</span>

		<div class="phase-pips" aria-label="Progress: phase {phaseIndex + 1} of {phaseCount}">
			{#each { length: phaseCount } as _, i}
				<span class="pip" class:pip-done={i <= phaseIndex}></span>
			{/each}
		</div>
	</div>

	<!-- ── Main HUD ── -->
	<div class="hud-panels">

		<!-- Speaker panel -->
		<div class="hud-speaker" style="--role-col: {roleColor(currentEntry?.role ?? 'narrator')}">
			<div class="speaker-ring">
				<Icon name={roleIcon(currentEntry?.role ?? 'narrator')} size={26} />
			</div>
			<span class="speaker-name">{currentEntry?.speaker ?? '—'}</span>
			<span class="speaker-badge">{(currentEntry?.role ?? '').toUpperCase().replace(/_/g, ' ')}</span>
			{#if isAdvancing}
				<div class="thinking-dots">
					<span></span><span></span><span></span>
				</div>
			{/if}
		</div>

		<!-- Dialogue / typewriter -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="hud-dialogue" onclick={skipTypewriter}>
			{#if currentEntry}
				<p class="dialogue-text">
					{displayedText}<span class="cursor" class:blink={!typewriterDone}>▋</span>
				</p>
				{#if currentEntry.canonRefs && currentEntry.canonRefs.length > 0}
					<div class="canon-refs">
						{#each currentEntry.canonRefs as ref}
							<span class="canon-tag">{ref}</span>
						{/each}
					</div>
				{/if}
			{:else}
				<p class="dialogue-empty">Simulation ready. Press <kbd>ENTER</kbd> to begin proceedings.</p>
			{/if}
			{#if !typewriterDone}
				<span class="skip-hint">ENTER / CLICK TO SKIP ▶</span>
			{/if}
		</div>

		<!-- Actions panel -->
		<div class="hud-actions">
			{#if status === 'completed'}
				<div class="hud-completed">
					<Icon name="check-circle" size={22} />
					<span>CONCLUDED</span>
				</div>
			{:else}
				<button
					class="hud-btn btn-next"
					onclick={() => onAction('next_turn')}
					disabled={isAdvancing || !typewriterDone}
					title="Advance to next turn (Enter)"
				>
					<Icon name="chevron-right" size={14} /> NEXT <kbd class="key-hint">⏎</kbd>
				</button>

				<button
					class="hud-btn btn-press"
					onclick={() => onAction('cross_examine')}
					disabled={isAdvancing}
					title="Press the witness (P)"
				>
					<Icon name="message-square" size={14} /> PRESS <kbd class="key-hint">P</kbd>
				</button>

				<button
					class="hud-btn btn-object"
					onclick={() => showObjectionMenu = !showObjectionMenu}
					disabled={isAdvancing}
					title="Object to statement (O)"
				>
					<Icon name="zap" size={14} /> OBJECTION <kbd class="key-hint">O</kbd>
				</button>

				<button
					class="hud-btn btn-present"
					onclick={() => showEvidencePanel = !showEvidencePanel}
					disabled={isAdvancing}
					title="Present evidence (E)"
				>
					<Icon name="paperclip" size={14} /> PRESENT <kbd class="key-hint">E</kbd>
				</button>

				<button
					class="hud-btn btn-phase"
					onclick={() => onAction('next_phase')}
					disabled={isAdvancing}
					title="Advance to next phase (N)"
				>
					<Icon name="skip-forward" size={12} /> PHASE+ <kbd class="key-hint">N</kbd>
				</button>

				{#if onAbandon}
					<button
						class="hud-btn btn-abandon"
						onclick={onAbandon}
						title="Abandon simulation"
					>
						<Icon name="x" size={12} /> ABANDON
					</button>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	/* ══ ROOT ════════════════════════════════════════════════════ */
	.hud-root {
		position: relative;
		background: rgba(4, 6, 10, 0.97);
		border-top: 2px solid var(--t-accent, rgba(255, 212, 70, 0.6));
		overflow: visible;
		user-select: none;
		flex-shrink: 0;
	}

	.hud-scanlines {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			0deg,
			transparent,
			transparent 2px,
			rgba(255, 255, 255, 0.011) 2px,
			rgba(255, 255, 255, 0.011) 4px
		);
		pointer-events: none;
		z-index: 0;
	}

	@keyframes hud-shake {
		0%, 100% { transform: translateX(0); }
		15%  { transform: translateX(-7px) rotate(-0.4deg); }
		30%  { transform: translateX(7px)  rotate(0.4deg); }
		45%  { transform: translateX(-4px); }
		60%  { transform: translateX(4px); }
		75%  { transform: translateX(-2px); }
		90%  { transform: translateX(2px); }
	}

	.hud-root.objecting {
		animation: hud-shake 0.45s ease;
	}

	/* ══ OBJECTION OVERLAY ═══════════════════════════════════════ */
	.objection-overlay {
		position: fixed;
		inset: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(200, 20, 20, 0.22);
		animation: obj-fade 1.6s forwards;
		pointer-events: none;
	}

	@keyframes obj-fade {
		0%   { opacity: 1; }
		50%  { opacity: 1; }
		100% { opacity: 0; }
	}

	.objection-text {
		font-family: 'Impact', 'Arial Black', sans-serif;
		font-size: clamp(4rem, 13vw, 9rem);
		font-weight: 900;
		font-style: italic;
		color: #fff;
		text-shadow:
			0 0 40px rgba(255, 50, 50, 0.9),
			0 0 80px rgba(255, 50, 50, 0.5),
			5px 5px 0 rgba(160, 0, 0, 0.9),
			10px 10px 0 rgba(80, 0, 0, 0.5);
		letter-spacing: 0.04em;
		animation: obj-pop 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}

	@keyframes obj-pop {
		0%   { transform: scale(0.2) rotate(-10deg); opacity: 0; }
		70%  { transform: scale(1.1) rotate(1.5deg); opacity: 1; }
		100% { transform: scale(1) rotate(0deg); }
	}

	/* ══ OBJECTION MENU (floating) ═══════════════════════════════ */
	.objection-menu {
		position: absolute;
		bottom: calc(100% + 4px);
		right: 0;
		width: 240px;
		background: rgba(8, 10, 16, 0.98);
		border: 1px solid rgba(255, 80, 80, 0.35);
		border-radius: 3px 3px 0 0;
		font-family: 'JetBrains Mono', monospace;
		overflow: hidden;
		z-index: 20;
	}

	.objection-menu-title {
		padding: 0.45rem 0.75rem;
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: rgba(255, 80, 80, 0.8);
		background: rgba(255, 80, 80, 0.07);
		border-bottom: 1px solid rgba(255, 80, 80, 0.15);
		font-weight: 700;
	}

	.objection-menu button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.65rem;
		color: rgba(220, 240, 255, 0.8);
		background: none;
		border: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		cursor: pointer;
		text-align: left;
		font-family: 'JetBrains Mono', monospace;
		transition: background 0.1s;
		letter-spacing: 0.04em;
	}

	.objection-menu button:hover {
		background: rgba(255, 80, 80, 0.1);
		color: rgba(255, 120, 120, 0.95);
	}

	.objection-menu button:last-child {
		border-bottom: none;
	}

	.obj-num {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border: 1px solid rgba(255, 80, 80, 0.35);
		border-radius: 2px;
		font-size: 0.5rem;
		color: rgba(255, 80, 80, 0.6);
		flex-shrink: 0;
	}

	.rule-tag {
		font-size: 0.5rem;
		padding: 0.1rem 0.35rem;
		border: 1px solid rgba(255, 80, 80, 0.25);
		border-radius: 2px;
		color: rgba(255, 80, 80, 0.65);
		background: rgba(255, 80, 80, 0.06);
		margin-left: auto;
	}

	.cancel-btn {
		color: rgba(255, 255, 255, 0.3) !important;
		font-size: 0.55rem !important;
		letter-spacing: 0.12em !important;
		justify-content: center !important;
	}

	/* ══ EVIDENCE PANEL ══════════════════════════════════════════ */
	.evidence-panel {
		position: absolute;
		bottom: calc(100% + 4px);
		right: 0;
		width: 270px;
		background: rgba(6, 10, 18, 0.98);
		border: 1px solid rgba(255, 212, 70, 0.25);
		border-radius: 3px 3px 0 0;
		font-family: 'JetBrains Mono', monospace;
		overflow: hidden;
		z-index: 20;
	}

	.evidence-panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.45rem 0.75rem;
		background: rgba(255, 212, 70, 0.07);
		border-bottom: 1px solid rgba(255, 212, 70, 0.14);
	}

	.evidence-panel-title {
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: rgba(255, 212, 70, 0.8);
		font-weight: 700;
	}

	.evidence-close {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.4);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color 0.15s;
	}

	.evidence-close:hover { color: rgba(255, 255, 255, 0.85); }

	.evidence-panel-body {
		display: flex;
		flex-direction: column;
		max-height: 200px;
		overflow-y: auto;
	}

	.evidence-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.65rem;
		color: rgba(220, 240, 255, 0.75);
		background: none;
		border: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		cursor: pointer;
		text-align: left;
		font-family: 'JetBrains Mono', monospace;
		transition: background 0.1s;
		letter-spacing: 0.03em;
	}

	.evidence-item:hover {
		background: rgba(255, 212, 70, 0.07);
		color: rgba(255, 212, 70, 0.9);
	}

	.evidence-item:last-child { border-bottom: none; }

	/* ══ CASE BANNER ═════════════════════════════════════════════ */
	.case-banner {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.3rem 1.25rem;
		background: rgba(0, 0, 0, 0.55);
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.58rem;
		letter-spacing: 0.1em;
		flex-wrap: wrap;
	}

	.case-num  { color: var(--t-accent, #ffd700); font-weight: 700; }
	.case-sep  { color: rgba(255, 255, 255, 0.18); }
	.case-phase  { color: rgba(255, 255, 255, 0.7); text-transform: uppercase; }
	.case-charge {
		color: rgba(255, 255, 255, 0.36);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 28ch;
	}

	.phase-pips {
		display: flex;
		gap: 3px;
		margin-left: auto;
	}

	.pip {
		width: 14px;
		height: 3px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		transition: background 0.3s;
	}

	.pip.pip-done {
		background: var(--t-accent, #ffd700);
		box-shadow: 0 0 5px var(--t-accent, #ffd700);
	}

	/* ══ PANEL GRID ══════════════════════════════════════════════ */
	.hud-panels {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: 190px 1fr 168px;
		min-height: 148px;
	}

	@media (max-width: 800px) {
		.hud-panels { grid-template-columns: 130px 1fr 130px; }
	}

	/* ══ SPEAKER ═════════════════════════════════════════════════ */
	.hud-speaker {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.875rem 0.625rem;
		border-right: 1px solid rgba(255, 255, 255, 0.05);
		background: rgba(0, 0, 0, 0.28);
	}

	.speaker-ring {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		border: 2px solid var(--role-col, #888);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--role-col, #888);
		box-shadow: 0 0 14px color-mix(in srgb, var(--role-col, #888) 35%, transparent);
		transition: all 0.3s;
	}

	.speaker-name {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.88);
		text-align: center;
		letter-spacing: 0.05em;
		max-width: 9rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.speaker-badge {
		font-size: 0.52rem;
		padding: 0.12rem 0.45rem;
		border-radius: 2px;
		border: 1px solid var(--role-col, #888);
		color: var(--role-col, #888);
		letter-spacing: 0.1em;
		font-family: 'JetBrains Mono', monospace;
	}

	/* thinking dots */
	.thinking-dots { display: flex; gap: 3px; margin-top: 0.2rem; }
	.thinking-dots span {
		width: 5px; height: 5px; border-radius: 50%;
		background: var(--role-col, #888);
		animation: think 1.1s ease-in-out infinite;
	}
	.thinking-dots span:nth-child(2) { animation-delay: 0.18s; }
	.thinking-dots span:nth-child(3) { animation-delay: 0.36s; }
	@keyframes think {
		0%, 80%, 100% { transform: scale(0.55); opacity: 0.35; }
		40%            { transform: scale(1);    opacity: 1; }
	}

	/* ══ DIALOGUE ════════════════════════════════════════════════ */
	.hud-dialogue {
		display: flex;
		flex-direction: column;
		padding: 1.1rem 1.375rem;
		cursor: pointer;
		position: relative;
	}

	.dialogue-text {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.875rem;
		line-height: 1.7;
		color: rgba(220, 238, 255, 0.92);
		letter-spacing: 0.018em;
		margin: 0;
		flex: 1;
		min-height: 3.5em;
	}

	.dialogue-empty {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.25);
		margin: 0;
		min-height: 3.5em;
		display: flex;
		align-items: center;
		font-style: italic;
		gap: 0.3rem;
	}

	.dialogue-empty kbd {
		font-size: 0.6rem;
		padding: 0.08rem 0.35rem;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.06);
		font-style: normal;
	}

	.cursor {
		display: inline-block;
		color: var(--t-accent, #ffd700);
		font-weight: 700;
		opacity: 0;
	}
	.cursor.blink {
		opacity: 1;
		animation: blink 0.55s step-end infinite;
	}
	@keyframes blink { 50% { opacity: 0; } }

	.canon-refs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.5rem;
	}
	.canon-tag {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.52rem;
		padding: 0.12rem 0.4rem;
		border: 1px solid rgba(255, 212, 70, 0.22);
		border-radius: 2px;
		color: rgba(255, 212, 70, 0.65);
		letter-spacing: 0.08em;
		background: rgba(255, 212, 70, 0.04);
	}

	.skip-hint {
		position: absolute;
		bottom: 0.45rem;
		right: 1rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.48rem;
		color: rgba(255, 255, 255, 0.22);
		letter-spacing: 0.1em;
		animation: skip-pulse 1.6s ease-in-out infinite;
		pointer-events: none;
	}
	@keyframes skip-pulse {
		0%, 100% { opacity: 0.25; }
		50%       { opacity: 0.7; }
	}

	/* ══ ACTIONS ═════════════════════════════════════════════════ */
	.hud-actions {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.75rem 0.625rem;
		border-left: 1px solid rgba(255, 255, 255, 0.05);
		background: rgba(0, 0, 0, 0.28);
		justify-content: center;
	}

	.hud-btn {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.42rem 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.585rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		border-radius: 2px;
		cursor: pointer;
		transition: all 0.12s ease;
		white-space: nowrap;
	}
	.hud-btn:disabled { opacity: 0.28; cursor: not-allowed; }

	.key-hint {
		font-size: 0.45rem;
		padding: 0.05rem 0.25rem;
		border: 1px solid currentColor;
		border-radius: 2px;
		opacity: 0.45;
		margin-left: auto;
		font-weight: 400;
	}

	/* NEXT — green */
	.btn-next {
		color: rgba(74, 222, 128, 0.9);
		border: 1px solid rgba(74, 222, 128, 0.28);
		background: rgba(74, 222, 128, 0.06);
	}
	.btn-next:hover:not(:disabled) {
		background: rgba(74, 222, 128, 0.14);
		border-color: rgba(74, 222, 128, 0.6);
		box-shadow: 0 0 10px rgba(74, 222, 128, 0.18);
	}

	/* PRESS — blue */
	.btn-press {
		color: rgba(96, 165, 250, 0.9);
		border: 1px solid rgba(96, 165, 250, 0.22);
		background: rgba(96, 165, 250, 0.05);
	}
	.btn-press:hover:not(:disabled) {
		background: rgba(96, 165, 250, 0.12);
		border-color: rgba(96, 165, 250, 0.55);
		box-shadow: 0 0 10px rgba(96, 165, 250, 0.18);
	}

	/* OBJECTION — red */
	.btn-object {
		color: rgba(255, 80, 80, 0.95);
		border: 1px solid rgba(255, 80, 80, 0.38);
		background: rgba(255, 80, 80, 0.07);
		font-size: 0.62rem;
	}
	.btn-object:hover:not(:disabled) {
		background: rgba(255, 80, 80, 0.16);
		border-color: rgba(255, 80, 80, 0.7);
		box-shadow: 0 0 14px rgba(255, 80, 80, 0.3);
		transform: scale(1.02);
	}
	.btn-object:active:not(:disabled) { transform: scale(0.97); }

	/* PRESENT — gold */
	.btn-present {
		color: rgba(255, 212, 70, 0.9);
		border: 1px solid rgba(255, 212, 70, 0.28);
		background: rgba(255, 212, 70, 0.05);
	}
	.btn-present:hover:not(:disabled) {
		background: rgba(255, 212, 70, 0.12);
		border-color: rgba(255, 212, 70, 0.6);
		box-shadow: 0 0 10px rgba(255, 212, 70, 0.18);
	}

	/* PHASE — muted */
	.btn-phase {
		color: rgba(255, 255, 255, 0.38);
		border: 1px solid rgba(255, 255, 255, 0.09);
		background: transparent;
		font-size: 0.52rem;
		margin-top: 0.15rem;
	}
	.btn-phase:hover:not(:disabled) {
		color: rgba(255, 255, 255, 0.68);
		border-color: rgba(255, 255, 255, 0.22);
		background: rgba(255, 255, 255, 0.04);
	}

	/* ABANDON — danger/muted */
	.btn-abandon {
		color: rgba(239, 68, 68, 0.5);
		border: 1px solid rgba(239, 68, 68, 0.12);
		background: transparent;
		font-size: 0.5rem;
		margin-top: auto;
	}
	.btn-abandon:hover:not(:disabled) {
		color: rgba(239, 68, 68, 0.85);
		border-color: rgba(239, 68, 68, 0.35);
		background: rgba(239, 68, 68, 0.06);
	}

	/* Completed state */
	.hud-completed {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.45rem;
		color: rgba(74, 222, 128, 0.8);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		padding: 1rem 0.5rem;
		text-align: center;
	}
</style>
