<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import CaseSelector from '$lib/components/CaseSelector.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { CaseSelection, CaseLinkTarget } from './evidence-utils.js';

	let {
		open = $bindable(false),
		caseLinkTarget = null,
		linkedCaseTitle = '',
		activeCaseId = '',
		onSelect,
		onClose
	}: {
		open?: boolean;
		caseLinkTarget?: CaseLinkTarget | null;
		linkedCaseTitle?: string;
		activeCaseId?: string;
		onSelect?: (selection: CaseSelection) => void;
		onClose?: () => void;
	} = $props();

	let isLinkingCase = $state(false);
	let caseLinkError = $state<string | null>(null);
	let caseLinkSuccess = $state<string | null>(null);

	let caseLinkTargetLabel = $derived(caseLinkTarget?.label ?? 'selected evidence');

	async function handleCaseLinkSelection(selectedCase: CaseSelection) {
		caseLinkError = null;
		caseLinkSuccess = null;

		if (!caseLinkTarget?.id) {
			caseLinkSuccess = `New uploads will be associated with ${selectedCase.title}.`;
			onSelect?.(selectedCase);
			return;
		}

		isLinkingCase = true;

		try {
			const response = await fetch(`/api/evidence/${caseLinkTarget.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ caseId: selectedCase.id })
			});

			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to link evidence to case');
			}

			caseLinkSuccess = `Linked ${caseLinkTargetLabel} to ${selectedCase.title}.`;
			onSelect?.(selectedCase);
			await invalidateAll();
		} catch (error) {
			caseLinkError = error instanceof Error ? error.message : 'Failed to link evidence to case';
		} finally {
			isLinkingCase = false;
		}
	}

	function handleClose() {
		caseLinkError = null;
		caseLinkSuccess = null;
		open = false;
		onClose?.();
	}
</script>

<Dialog bind:open title="Link Evidence to Case" description="Associate evidence with a legal case for organized tracking.">
	<div class="link-body">
		{#if caseLinkTarget}
			<div class="link-context">
				<Icon name="link" class="w-4 h-4" />
				<span>Linking: <strong>{caseLinkTargetLabel}</strong></span>
			</div>
		{:else if activeCaseId}
			<div class="link-context info">
				<Icon name="info" class="w-4 h-4" />
				<span>New uploads will use case <strong>{linkedCaseTitle || activeCaseId}</strong></span>
			</div>
		{:else}
			<p class="link-hint">Choose a case for upcoming uploads, or select evidence first to link it.</p>
		{/if}

		<div class="link-selector">
			<CaseSelector
				placeholder="Search and select a case..."
				onselect={handleCaseLinkSelection}
			/>
		</div>

		{#if isLinkingCase}
			<div class="link-status">
				<div class="link-spinner"></div>
				<span>Linking evidence to case...</span>
			</div>
		{/if}

		{#if caseLinkError}
			<div class="link-message error">
				<Icon name="circle-alert" class="w-4 h-4" />
				{caseLinkError}
			</div>
		{/if}

		{#if caseLinkSuccess}
			<div class="link-message success">
				<Icon name="circle-check" class="w-4 h-4" />
				{caseLinkSuccess}
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<button type="button" class="link-close-btn" onclick={handleClose}>Close</button>
	{/snippet}
</Dialog>

<style>
	.link-body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.link-context {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(139, 92, 246, 0.06);
		border: 1px solid rgba(139, 92, 246, 0.15);
		border-radius: 8px;
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.7);
	}
	.link-context.info {
		background: rgba(96, 165, 250, 0.06);
		border-color: rgba(96, 165, 250, 0.15);
	}
	.link-context strong {
		color: rgba(212, 199, 163, 0.9);
	}
	.link-hint {
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.4);
		margin: 0;
	}
	.link-selector {
		max-width: 100%;
	}
	.link-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.5);
	}
	.link-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(96, 165, 250, 0.2);
		border-top-color: #60a5fa;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}
	.link-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		font-size: 0.78rem;
	}
	.link-message.error {
		background: rgba(239, 68, 68, 0.06);
		border: 1px solid rgba(239, 68, 68, 0.15);
		color: #f87171;
	}
	.link-message.success {
		background: rgba(34, 197, 94, 0.06);
		border: 1px solid rgba(34, 197, 94, 0.15);
		color: #4ade80;
	}
	.link-close-btn {
		padding: 0.5rem 1rem;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(212, 199, 163, 0.7);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.link-close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
