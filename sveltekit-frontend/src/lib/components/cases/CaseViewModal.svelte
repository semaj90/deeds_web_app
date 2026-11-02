<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { goto } from '$app/navigation';

	let {
		caseId,
		open = $bindable(false),
		onClose = () => {},
		onEdit
	}: {
		caseId: string | null;
		open?: boolean;
		onClose?: () => void;
		onEdit?: (id: string) => void;
	} = $props();

	let caseData = $state<any>(null);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);

	$effect(() => {
		if (open && caseId) {
			loadCase(caseId);
		} else if (!open) {
			setTimeout(() => { caseData = null; loadError = null; }, 200);
		}
	});

	async function loadCase(id: string) {
		isLoading = true;
		loadError = null;
		try {
			const res = await fetch(`/api/cases/${id}`);
			if (!res.ok) throw new Error(`${res.status}`);
			const body = await res.json();
			// API returns { success: true, data: {...} }
			caseData = body.data ?? body;
		} catch {
			loadError = 'Failed to load case.';
		} finally {
			isLoading = false;
		}
	}

	function close() {
		open = false;
		onClose();
	}

	function openFullCase() {
		if (caseId) {
			close();
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
		open: '#34d399',
		in_progress: '#60a5fa',
		pending_review: '#fbbf24',
		closed: '#94a3b8',
		archived: '#64748b'
	};
	const PRIORITY_COLOR: Record<string, string> = {
		critical: '#f87171',
		urgent: '#fb923c',
		high: '#facc15',
		medium: '#60a5fa',
		low: '#4ade80'
	};
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) close(); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="case-modal-backdrop" />
		<Dialog.Content class="case-modal-panel">
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
						{#if isLoading}
							<span class="loading-text">Loading case...</span>
						{:else if caseData}
							<Dialog.Title class="case-title">{caseData.title}</Dialog.Title>
							{#if caseData.caseNumber}
								<span class="case-number">Case #{caseData.caseNumber}</span>
							{/if}
						{:else}
							<Dialog.Title class="loading-text">Case Details</Dialog.Title>
						{/if}
					</div>
				</div>
				<Dialog.Close class="modal-close" onclick={close} aria-label="Close">✕</Dialog.Close>
			</div>

			<!-- Body -->
			<div class="case-modal-body">
				{#if isLoading}
					<div class="loading-state">
						<div class="spinner"></div>
						<span>Loading case details…</span>
					</div>
				{:else if loadError}
					<div class="error-state">
						<Icon name="circle-alert" class="w-5 h-5" />
						{loadError}
					</div>
				{:else if caseData}
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
			{#if caseData && !isLoading}
				<div class="case-modal-footer">
					<button type="button" class="footer-btn ghost" onclick={close}>Close</button>
					<div class="footer-actions">
						{#if onEdit}
							<button type="button" class="footer-btn secondary" onclick={() => { onEdit?.(caseData.id); close(); }}>
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
		background: rgba(3, 6, 12, 0.85);
		backdrop-filter: blur(12px) saturate(1.15);
		padding: 1rem;
		animation: caseModalFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
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
		background: linear-gradient(180deg, rgba(19, 27, 42, 0.98) 0%, rgba(8, 12, 20, 0.99) 100%);
		border: 1px solid rgba(243, 212, 113, 0.3);
		border-radius: 10px;
		box-shadow:
			0 0 0 1px rgba(243, 212, 113, 0.08),
			0 24px 64px rgba(0, 0, 0, 0.85),
			0 0 35px rgba(243, 212, 113, 0.1);
		overflow: hidden;
		animation: caseModalScale 0.22s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.case-modal-top-line {
		position: absolute;
		top: 0;
		left: 1.5rem;
		right: 1.5rem;
		height: 1px;
		background: linear-gradient(90deg, transparent, rgba(243, 212, 113, 0.9), rgba(126, 231, 255, 0.6), transparent);
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
	.hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid #f3d471; border-left: 2px solid #f3d471; }
	.hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid #f3d471; border-right: 2px solid #f3d471; }
	.hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #f3d471; border-left: 2px solid #f3d471; }
	.hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid #f3d471; border-right: 2px solid #f3d471; }

	.case-modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid rgba(243, 212, 113, 0.2);
		background: rgba(0, 0, 0, 0.35);
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
		color: #f3d471;
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
		color: #f3d471;
		margin: 0 0 0.2rem;
		line-height: 1.3;
		word-break: break-word;
		letter-spacing: 0.05em;
	}
	.case-number {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.6);
		font-family: var(--font-mono, monospace);
	}
	.loading-text {
		font-size: 1rem;
		color: rgba(212, 199, 163, 0.5);
	}
	:global(.modal-close) {
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(243, 212, 113, 0.25);
		color: rgba(212, 199, 163, 0.6);
		cursor: pointer;
		font-size: 0.875rem;
		width: 1.875rem;
		height: 1.875rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.15s ease;
	}
	:global(.modal-close:hover) {
		color: #f3d471;
		background: rgba(243, 212, 113, 0.15);
		border-color: rgba(243, 212, 113, 0.5);
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
		background: rgba(243, 212, 113, 0.18);
		border-radius: 3px;
	}
	.loading-state {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: rgba(212, 199, 163, 0.5);
		font-size: 0.875rem;
		padding: 2rem 0;
	}
	.spinner {
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid rgba(243, 212, 113, 0.2);
		border-top-color: #f3d471;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.error-state {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #f87171;
		font-size: 0.875rem;
		background: rgba(248, 113, 113, 0.08);
		border: 1px solid rgba(248, 113, 113, 0.2);
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
		color: rgba(212, 199, 163, 0.8);
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
		color: rgba(212, 199, 163, 0.45);
		font-weight: 600;
	}
	.detail-value {
		font-size: 0.875rem;
		color: rgba(212, 199, 163, 0.85);
	}
	.due-date { color: #fbbf24; }

	.case-modal-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-top: 1px solid rgba(243, 212, 113, 0.15);
		background: rgba(0, 0, 0, 0.35);
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
		font-size: 0.8rem;
		font-weight: 600;
		padding: 0.45rem 0.9rem;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
		text-decoration: none;
	}
	.footer-btn.ghost {
		background: transparent;
		border-color: rgba(212, 199, 163, 0.25);
		color: rgba(212, 199, 163, 0.7);
	}
	.footer-btn.ghost:hover {
		background: rgba(212, 199, 163, 0.1);
		color: #f3d471;
	}
	.footer-btn.secondary {
		background: rgba(212, 199, 163, 0.08);
		border-color: rgba(212, 199, 163, 0.3);
		color: rgba(212, 199, 163, 0.9);
	}
	.footer-btn.secondary:hover {
		background: rgba(212, 199, 163, 0.16);
	}
	.footer-btn.primary {
		background: rgba(243, 212, 113, 0.15);
		border-color: rgba(243, 212, 113, 0.5);
		color: #f3d471;
	}
	.footer-btn.primary:hover {
		background: rgba(243, 212, 113, 0.25);
		box-shadow: 0 0 12px rgba(243, 212, 113, 0.2);
	}

	@keyframes caseModalFade {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes caseModalScale {
		from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
		to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
	}
</style>
