<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade } from 'svelte/transition';
	import Icon from '$lib/components/cases/CaseIcon.svelte';
	import { goto } from '$app/navigation';

	type CasePreview = {
		id: string;
		title?: string | null;
		caseNumber?: string | null;
		description?: string | null;
		status?: string | null;
		priority?: string | null;
		practiceArea?: string | null;
		jurisdiction?: string | null;
		court?: string | null;
		clientName?: string | null;
		opposingParty?: string | null;
		filingDate?: string | null;
		dueDate?: string | null;
		createdAt?: string | null;
		updatedAt?: string | null;
	};

	let {
		caseId,
		initialCase = null,
		open = $bindable(false),
		onClose = () => {},
		onEdit
	}: {
		caseId: string | null;
		initialCase?: CasePreview | null;
		open?: boolean;
		onClose?: () => void;
		onEdit?: (id: string) => void;
	} = $props();

	let detailedCase = $state<CasePreview | null>(null);
	let unavailable = $state(false);
	let caseData = $derived(
		unavailable ? null : detailedCase?.id === caseId ? detailedCase : initialCase?.id === caseId ? initialCase : null
	);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);

	function isUsableCaseId(value: unknown): value is string {
		return typeof value === 'string' && value.trim().length > 0 && !/^(null|undefined)$/i.test(value.trim());
	}

	$effect(() => {
		detailedCase = null;
		unavailable = false;
		loadError = null;
		isLoading = false;
		if (!open) return;
		if (!isUsableCaseId(caseId)) {
			loadError = 'This case does not have a valid record ID.';
			return;
		}
		const controller = new AbortController();
		void loadCase(caseId, controller.signal);
		return () => controller.abort();
	});

	async function loadCase(id: string, signal: AbortSignal) {
		isLoading = true;
		try {
			const res = await fetch(`/api/cases/${encodeURIComponent(id)}`, { signal, cache: 'no-store' });
			if (signal.aborted) return;
			if (res.status === 401 || res.status === 404) {
				unavailable = true;
				loadError = 'This case is no longer available.';
				return;
			}
			if (!res.ok) throw new Error(`${res.status}`);
			const body: { success?: boolean; data?: CasePreview } = await res.json();
			if (signal.aborted) return;
			if (body.success !== true || body.data?.id !== id) throw new Error('Invalid case response');
			detailedCase = body.data;
		} catch {
			if (!signal.aborted) loadError = 'Could not load additional case details.';
		} finally {
			if (!signal.aborted) isLoading = false;
		}
	}

	function handleOpenChange(nextOpen: boolean) {
		open = nextOpen;
		if (!nextOpen) onClose();
	}

	function openFullCase() {
		if (isUsableCaseId(caseId) && isUsableCaseId(caseData?.id)) {
			handleOpenChange(false);
			goto(`/cases/${caseId}`);
		}
	}

	function formatDate(val: string | null | undefined) {
		if (!val) return null;
		const d = new Date(val);
		if (isNaN(d.getTime())) return val;
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	const STATUS_COLOR: Record<string, string> = {
		open: '#53694f',
		in_progress: '#536887',
		pending_review: '#8a6841',
		closed: '#625d57',
		archived: '#756d64'
	};
	const PRIORITY_COLOR: Record<string, string> = {
		critical: '#741b17',
		urgent: '#96502d',
		high: '#8a6841',
		medium: '#536887',
		low: '#53694f'
	};
</script>

<Dialog.Root open={open} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay forceMount class="case-modal-backdrop">
			{#snippet child({ props, open: dialogOpen })}
				{#if dialogOpen}
					<div {...props} transition:fade={{ duration: 160 }}></div>
				{/if}
			{/snippet}
		</Dialog.Overlay>
		<Dialog.Content forceMount class="case-modal-panel">
			{#snippet child({ props, open: dialogOpen })}
				{#if dialogOpen}
					<div {...props} transition:fade={{ duration: 180 }}>
			<!-- Tactical HUD Corner Notches -->
			<div class="hud-notch-tl" aria-hidden="true"></div>
			<div class="hud-notch-tr" aria-hidden="true"></div>
			<div class="hud-notch-bl" aria-hidden="true"></div>
			<div class="hud-notch-br" aria-hidden="true"></div>

			<!-- Top accent line -->
			<div class="case-modal-top-line" aria-hidden="true"></div>

			<!-- Header -->
			<div class="case-modal-header">
				<div class="case-modal-title-row">
					<Icon name="briefcase" class="header-icon" />
					<div class="case-modal-title-text">
						<Dialog.Title class="case-title">{caseData?.title || 'Case Details'}</Dialog.Title>
						{#if caseData}
							{#if caseData.caseNumber}
								<span class="case-number">Case #{caseData.caseNumber}</span>
							{/if}
						{/if}
					</div>
				</div>
				<Dialog.Close class="modal-close" aria-label="Close">✕</Dialog.Close>
			</div>

			<!-- Body -->
			<div class="case-modal-body">
				{#if isLoading && !caseData}
					<div class="loading-state" role="status">
						<div class="spinner"></div>
						<span>Loading case details…</span>
					</div>
				{/if}
				{#if loadError}
					<div class="error-state" role="status">
						<Icon name="circle-alert" class="w-5 h-5" />
						{loadError}
					</div>
				{/if}
				{#if caseData}
					<!-- Status + Priority badges -->
					<div class="badge-row">
						{#if caseData.status}
							<span class="badge" style="border-color:{STATUS_COLOR[caseData.status] ?? '#94a3b8'}33; color:{STATUS_COLOR[caseData.status] ?? '#94a3b8'}; background:{STATUS_COLOR[caseData.status] ?? '#94a3b8'}18">
								{caseData.status.replace('_', ' ')}
							</span>
						{/if}
						{#if caseData.priority}
							<span class="badge" style="border-color:{PRIORITY_COLOR[caseData.priority] ?? '#94a3b8'}33; color:{PRIORITY_COLOR[caseData.priority] ?? '#94a3b8'}; background:{PRIORITY_COLOR[caseData.priority] ?? '#94a3b8'}18">
								{caseData.priority}
							</span>
						{/if}
					</div>

					<!-- Description -->
					{#if caseData.description}
						<p class="case-description">{caseData.description}</p>
					{/if}

					<!-- Details grid -->
					<div class="details-grid">
						{#if caseData.practiceArea}
							<div class="detail-item">
								<span class="detail-label">Practice Area</span>
								<span class="detail-value">{caseData.practiceArea}</span>
							</div>
						{/if}
						{#if caseData.jurisdiction}
							<div class="detail-item">
								<span class="detail-label">Jurisdiction</span>
								<span class="detail-value">{caseData.jurisdiction}</span>
							</div>
						{/if}
						{#if caseData.court}
							<div class="detail-item">
								<span class="detail-label">Court</span>
								<span class="detail-value">{caseData.court}</span>
							</div>
						{/if}
						{#if caseData.clientName}
							<div class="detail-item">
								<span class="detail-label">Client</span>
								<span class="detail-value">{caseData.clientName}</span>
							</div>
						{/if}
						{#if caseData.opposingParty}
							<div class="detail-item">
								<span class="detail-label">Opposing Party</span>
								<span class="detail-value">{caseData.opposingParty}</span>
							</div>
						{/if}
						{#if caseData.filingDate}
							<div class="detail-item">
								<span class="detail-label">Filing Date</span>
								<span class="detail-value">{formatDate(caseData.filingDate)}</span>
							</div>
						{/if}
						{#if caseData.dueDate}
							<div class="detail-item">
								<span class="detail-label">Due Date</span>
								<span class="detail-value due-date">{formatDate(caseData.dueDate)}</span>
							</div>
						{/if}
						{#if caseData.createdAt}
							<div class="detail-item">
								<span class="detail-label">Created</span>
								<span class="detail-value">{formatDate(caseData.createdAt)}</span>
							</div>
						{/if}
						{#if caseData.updatedAt}
							<div class="detail-item">
								<span class="detail-label">Last Updated</span>
								<span class="detail-value">{formatDate(caseData.updatedAt)}</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			{#if caseData}
				<div class="case-modal-footer">
					<button type="button" class="footer-btn ghost" onclick={() => handleOpenChange(false)}>Close</button>
					<div class="footer-actions">
						{#if onEdit}
							<button type="button" class="footer-btn secondary" onclick={() => { if (isUsableCaseId(caseData.id)) { onEdit?.(caseData.id); handleOpenChange(false); } }}>
								<Icon name="pencil" class="w-3.5 h-3.5" />
								Edit
							</button>
						{/if}
						<button type="button" class="footer-btn primary" onclick={openFullCase}>
							<Icon name="arrow-right" class="w-3.5 h-3.5" />
							Open Case
						</button>
					</div>
				</div>
			{/if}
					</div>
				{/if}
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.case-modal-backdrop) {
		position: fixed;
		inset: 0;
		z-index: 10000;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(34, 39, 48, 0.38);
		backdrop-filter: blur(12px) saturate(0.9);
		padding: 1rem;
	}

	:global(.case-modal-panel) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 10001;
		width: min(44rem, calc(100vw - 2rem));
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		background: linear-gradient(145deg, rgba(255, 253, 249, 0.96), rgba(247, 242, 234, 0.91));
		backdrop-filter: blur(20px) saturate(1.12);
		-webkit-backdrop-filter: blur(20px) saturate(1.12);
		border: 1px solid rgba(174, 145, 102, 0.62);
		border-radius: 14px;
		box-shadow:
			0 0 0 1px rgba(255, 252, 245, 0.9),
			0 24px 64px rgba(17, 24, 33, 0.34);
		overflow: hidden;
	}

	.case-modal-top-line {
		position: absolute;
		top: 0;
		left: 1.5rem;
		right: 1.5rem;
		height: 1px;
		background: linear-gradient(90deg, transparent, rgba(231, 201, 126, 0.92), rgba(180, 128, 87, 0.64), transparent);
		pointer-events: none;
		z-index: 2;
	}

	.hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
		position: absolute;
		width: 8px;
		height: 8px;
		pointer-events: none;
		z-index: 3;
	}
	.hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid #d8b968; border-left: 2px solid #d8b968; }
	.hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid #d8b968; border-right: 2px solid #d8b968; }
	.hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #bd8c6a; border-left: 2px solid #bd8c6a; }
	.hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid #bd8c6a; border-right: 2px solid #bd8c6a; }

	.case-modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid rgba(231, 201, 126, 0.4);
		background: linear-gradient(115deg, rgba(255, 253, 248, 0.88), rgba(238, 232, 220, 0.78));
		flex-shrink: 0;
		position: relative;
		z-index: 1;
	}
	.case-modal-title-row {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}
	:global(.header-icon) {
		width: 1.25rem;
		height: 1.25rem;
		color: #8a6427;
		flex-shrink: 0;
		margin-top: 3px;
	}
	.case-modal-title-text {
		flex: 1;
		min-width: 0;
	}
	:global(.case-title) {
		font-size: 1.125rem;
		font-weight: 700;
		color: #29251f;
		margin: 0 0 0.2rem;
		line-height: 1.3;
		word-break: break-word;
		letter-spacing: 0.05em;
	}
	.case-number {
		font-size: 0.75rem;
		color: #5b6573;
		font-family: var(--font-mono, monospace);
	}
	:global(.modal-close) {
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.62);
		border: 1px solid rgba(138, 100, 39, 0.32);
		color: #493b2e;
		cursor: pointer;
		font-size: 0.9375rem;
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.15s ease;
	}
	:global(.modal-close:focus-visible) {
		outline: 3px solid #8a6427;
		outline-offset: 3px;
	}
	:global(.modal-close:hover) {
		color: #fffdf8;
		background: #741f1b;
		border-color: #9a7837;
	}
	@supports not (backdrop-filter: blur(1px)) {
		:global(.case-modal-panel) { background: #fffdf8; }
	}

	.case-modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.case-modal-body::-webkit-scrollbar {
		width: 6px;
	}
	.case-modal-body::-webkit-scrollbar-thumb {
		background: #c8b28d;
		border-radius: 3px;
	}
	.loading-state {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: #53647b;
		font-size: 0.875rem;
		padding: 2rem 0;
	}
	.spinner {
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid #e7d8c2;
		border-top-color: #741b17;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.error-state {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #741b17;
		font-size: 0.875rem;
		background: rgba(116, 27, 23, 0.08);
		border: 1px solid rgba(116, 27, 23, 0.2);
		border-radius: 6px;
		padding: 0.75rem 1rem;
	}
	.badge-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		border: 1px solid;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.55rem;
	}
	.case-description {
		font-size: 0.875rem;
		color: #53647b;
		line-height: 1.6;
		margin: 0;
		white-space: pre-wrap;
	}
	.details-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem 1.25rem;
	}
	.detail-item {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.detail-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: #53647b;
		font-weight: 600;
	}
	.detail-value {
		font-size: 0.875rem;
		color: #292521;
	}
	.due-date { color: #741b17; }

	.case-modal-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-top: 1px solid rgba(174, 145, 102, 0.35);
		background: rgba(247, 242, 234, 0.62);
		flex-shrink: 0;
	}
	.footer-actions {
		display: flex;
		gap: 0.5rem;
	}
	.footer-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		border: 1px solid;
		border-radius: 5px;
		min-height: 2.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		padding: 0.45rem 0.9rem;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
		text-decoration: none;
	}
	.footer-btn:focus-visible {
		outline: 3px solid #8a6427;
		outline-offset: 3px;
	}
	.footer-btn.ghost {
		background: transparent;
		border-color: #bdac91;
		color: #5e5143;
	}
	.footer-btn.ghost:hover {
		background: #e9dfd1;
		color: #741b17;
	}
	.footer-btn.secondary {
		background: #eee5d8;
		border-color: #c8b28d;
		color: #332c27;
	}
	.footer-btn.secondary:hover {
		background: #e2d1b2;
	}
	.footer-btn.primary {
		background: #67140f;
		border-color: #67140f;
		color: #fff8ec;
	}
	.footer-btn.primary:hover {
		background: #4f100c;
		box-shadow: 0 4px 12px rgba(103, 20, 15, 0.24);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.case-modal-backdrop),
		:global(.case-modal-panel) { animation-duration: 0.01ms !important; }
		.spinner { animation: none; }
		:global(.modal-close),
		.footer-btn { transition: none; }
	}

	@media (max-width: 520px) {
		:global(.case-modal-backdrop) { padding: 0.625rem; }
		:global(.case-modal-panel) {
			width: calc(100vw - 1.25rem);
			max-height: min(92dvh, 48rem);
			border-radius: 12px;
		}
		.case-modal-header { padding: 1rem; gap: 0.625rem; }
		.case-modal-body { padding: 1rem; gap: 1rem; }
		.case-modal-footer {
			flex-wrap: wrap;
			gap: 0.75rem;
			padding: 0.875rem 1rem;
		}
		.footer-actions { flex-wrap: wrap; justify-content: flex-end; }
		.details-grid { grid-template-columns: minmax(0, 1fr); }
	}

</style>
