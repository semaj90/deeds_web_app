<script lang="ts">
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
		} catch (e) {
			loadError = 'Failed to load case.';
		} finally {
			isLoading = false;
		}
	}

	function close() {
		open = false;
		onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
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

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<div
		class="case-modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Case details"
		onclick={(e) => { if (e.target === e.currentTarget) close(); }}
	>
		<div class="case-modal-panel">
			<!-- Header -->
			<div class="case-modal-header">
				<div class="case-modal-title-row">
					<Icon name="briefcase" class="header-icon" />
					<div class="case-modal-title-text">
						{#if isLoading}
							<span class="loading-text">Loading case...</span>
						{:else if caseData}
							<h2 class="case-title">{caseData.title}</h2>
							{#if caseData.caseNumber}
								<span class="case-number">Case #{caseData.caseNumber}</span>
							{/if}
						{:else}
							<span class="loading-text">Case Details</span>
						{/if}
					</div>
				</div>
				<button type="button" class="modal-close" onclick={close} aria-label="Close">✕</button>
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
						<Icon name="alert-circle" class="w-5 h-5" />
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
		</div>
	</div>
{/if}

<style>
	.case-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(4px);
		padding: 1rem;
	}
	.case-modal-panel {
		width: 100%;
		max-width: 640px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		background: #131519;
		border: 1px solid rgba(212, 199, 163, 0.12);
		border-radius: 10px;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
		overflow: hidden;
	}
	.case-modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.1);
		background: rgba(255, 255, 255, 0.02);
		flex-shrink: 0;
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
		color: rgba(212, 199, 163, 0.7);
		flex-shrink: 0;
		margin-top: 3px;
	}
	.case-modal-title-text {
		flex: 1;
		min-width: 0;
	}
	.case-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0 0 0.2rem;
		line-height: 1.3;
		word-break: break-word;
	}
	.case-number {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.45);
	}
	.loading-text {
		font-size: 1rem;
		color: rgba(212, 199, 163, 0.5);
	}
	.modal-close {
		flex-shrink: 0;
		background: none;
		border: none;
		color: rgba(212, 199, 163, 0.4);
		cursor: pointer;
		font-size: 1rem;
		padding: 0.25rem;
		line-height: 1;
		border-radius: 4px;
		transition: color 0.15s;
	}
	.modal-close:hover { color: rgba(212, 199, 163, 0.9); }

	.case-modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
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
		border: 2px solid rgba(212, 199, 163, 0.15);
		border-top-color: rgba(212, 199, 163, 0.6);
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
		color: rgba(212, 199, 163, 0.7);
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
		color: rgba(212, 199, 163, 0.4);
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
		border-top: 1px solid rgba(212, 199, 163, 0.1);
		background: rgba(255, 255, 255, 0.02);
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
		border-color: rgba(212, 199, 163, 0.2);
		color: rgba(212, 199, 163, 0.55);
	}
	.footer-btn.ghost:hover {
		background: rgba(212, 199, 163, 0.06);
		color: rgba(212, 199, 163, 0.85);
	}
	.footer-btn.secondary {
		background: rgba(212, 199, 163, 0.07);
		border-color: rgba(212, 199, 163, 0.25);
		color: rgba(212, 199, 163, 0.8);
	}
	.footer-btn.secondary:hover {
		background: rgba(212, 199, 163, 0.14);
	}
	.footer-btn.primary {
		background: rgba(52, 211, 153, 0.15);
		border-color: rgba(52, 211, 153, 0.4);
		color: #6ee7b7;
	}
	.footer-btn.primary:hover {
		background: rgba(52, 211, 153, 0.25);
	}
</style>
