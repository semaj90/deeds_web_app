<script lang="ts">
	/**
	 * AI Summary Mini Modal — Compact evidence summarization with ACE context
	 * Triggered from Evidence Board AI chat, can summarize any evidence item
	 * Native <dialog> replaces bits-ui Dialog to avoid $props() TDZ in Svelte 5.46.0
	 */
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		open?: boolean;
		caseId?: string;
		evidenceId?: string;
		evidenceTitle?: string;
		evidenceContent?: string;
		onClose?: () => void;
	}

	let { open = $bindable(false), caseId, evidenceId, evidenceTitle, evidenceContent, onClose }: Props = $props();

	let dialogEl: HTMLDialogElement | undefined = $state(undefined);

	type SummaryState = 'idle' | 'loading' | 'ready' | 'error';
	let summaryState: SummaryState = $state('idle');
	let summary: string | null = $state(null);
	let keyInsights: string[] = $state([]);
	let confidence = $state(0);
	let error: string | null = $state(null);
	let aceContext: any = $state(null);

	// Sync open prop with native dialog
	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) dialogEl.showModal();
		else if (!open && dialogEl.open) dialogEl.close();
	});

	// Auto-generate summary when modal opens
	$effect(() => {
		if (open && (evidenceId || evidenceContent) && summaryState === 'idle') {
			generateSummary();
		}
	});

	async function generateSummary() {
		summaryState = 'loading';
		error = null;

		try {
			const response = await fetch('/api/ace/summarize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					evidenceId,
					caseId,
					content: evidenceContent,
					title: evidenceTitle
				})
			});

			if (!response.ok) throw new Error('Summarization failed');

			const data = await response.json();
			summary = data.summary || null;
			keyInsights = data.keyInsights || [];
			confidence = data.confidence || 0;
			aceContext = data.aceContext || null;
			summaryState = 'ready';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to generate summary';
			summaryState = 'error';
		}
	}

	function handleClose() {
		summaryState = 'idle';
		summary = null;
		keyInsights = [];
		confidence = 0;
		error = null;
		aceContext = null;
		open = false;
		onClose?.();
	}

	function retry() {
		summaryState = 'idle';
		generateSummary();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === dialogEl) handleClose();
	}
</script>

{#if open}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogEl}
	class="summary-dialog"
	onclick={handleBackdropClick}
	oncancel={(e) => { e.preventDefault(); handleClose(); }}
>
	<div class="dialog-panel">
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b border-sand/20">
			<div class="flex items-center gap-3">
				<div class="p-2 bg-info/10 rounded-lg">
					<Icon name="brain" class="w-5 h-5 text-info" />
				</div>
				<div>
					<h2 class="text-lg font-semibold text-white">AI Evidence Summary</h2>
					{#if evidenceTitle}
						<p class="text-sm text-sand/60">{evidenceTitle}</p>
					{/if}
				</div>
			</div>
			<div class="flex items-center gap-2">
				{#if confidence > 0}
					<div class="px-3 py-1 bg-accent/10 text-accent rounded-full text-sm">
						{Math.round(confidence * 100)}% confidence
					</div>
				{/if}
				<button
					type="button"
					class="p-2 hover:bg-panelSoft rounded-md text-sand/60 hover:text-white transition-colors"
					onclick={handleClose}
					aria-label="Close"
				>
					<Icon name="x" class="w-4 h-4" />
				</button>
			</div>
		</div>

		<!-- Content -->
		<div class="p-6 max-h-[60vh] overflow-y-auto">
			{#if summaryState === 'loading'}
				<div class="flex items-center justify-center py-12">
					<div class="flex flex-col items-center gap-4">
						<div class="w-8 h-8 border-4 border-info/20 border-t-info rounded-full animate-spin"></div>
						<p class="text-sand/60">Generating AI summary with ACE context...</p>
					</div>
				</div>
			{:else if summaryState === 'error'}
				<div class="p-4 bg-danger/10 border border-danger/30 rounded-lg">
					<div class="flex items-center gap-3 mb-3">
						<div class="text-danger text-xl">!</div>
						<div>
							<h4 class="font-medium text-danger">Error</h4>
							<p class="text-danger/80 text-sm">{error}</p>
						</div>
					</div>
					<button
						onclick={retry}
						class="px-4 py-2 bg-danger text-white rounded-md hover:bg-danger/80 transition-colors text-sm"
					>
						Retry
					</button>
				</div>
			{:else if summaryState === 'ready'}
				<div class="space-y-4">
					<!-- Executive Summary -->
					{#if summary}
						<div class="p-4 bg-info/5 border border-info/20 rounded-lg">
							<h4 class="font-medium text-info mb-2 flex items-center gap-2">
								<Icon name="file-text" class="w-4 h-4" />
								Summary
							</h4>
							<p class="text-sand/80 leading-relaxed">{summary}</p>
						</div>
					{/if}

					<!-- Key Insights -->
					{#if keyInsights.length > 0}
						<div class="p-4 bg-accent/5 border border-accent/20 rounded-lg">
							<h4 class="font-medium text-accent mb-3 flex items-center gap-2">
								<Icon name="zap" class="w-4 h-4" />
								Key Insights
							</h4>
							<ul class="space-y-2">
								{#each keyInsights as insight}
									<li class="flex items-start gap-2">
										<div class="w-1.5 h-1.5 bg-accent rounded-full mt-2 flex-shrink-0"></div>
										<span class="text-sand/80">{insight}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<!-- ACE Context Metadata -->
					{#if aceContext}
						<div class="p-4 bg-sand/5 border border-sand/20 rounded-lg">
							<h4 class="font-medium text-sand mb-3 flex items-center gap-2">
								<Icon name="database" class="w-4 h-4" />
								Context Sources
							</h4>
							<div class="grid grid-cols-2 gap-3 text-sm">
								{#if aceContext.caseContext}
									<div class="flex items-center gap-2">
										<Icon name="briefcase" class="w-3.5 h-3.5 text-info" />
										<span class="text-sand/70">Case Context</span>
									</div>
								{/if}
								{#if aceContext.ragChunks > 0}
									<div class="flex items-center gap-2">
										<Icon name="search" class="w-3.5 h-3.5 text-info" />
										<span class="text-sand/70">{aceContext.ragChunks} RAG Chunks</span>
									</div>
								{/if}
								{#if aceContext.kagNeighbors > 0}
									<div class="flex items-center gap-2">
										<Icon name="git-branch" class="w-3.5 h-3.5 text-info" />
										<span class="text-sand/70">{aceContext.kagNeighbors} Graph Links</span>
									</div>
								{/if}
								{#if aceContext.entities > 0}
									<div class="flex items-center gap-2">
										<Icon name="tag" class="w-3.5 h-3.5 text-info" />
										<span class="text-sand/70">{aceContext.entities} Entities</span>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<!-- Idle state (should not display) -->
				<div class="text-center py-12">
					<div class="w-16 h-16 mx-auto bg-sand/10 rounded-lg flex items-center justify-center mb-4">
						<Icon name="file-text" class="w-8 h-8 text-sand/40" />
					</div>
					<h4 class="text-lg font-medium text-sand">Ready to Summarize</h4>
				</div>
			{/if}
		</div>

		<!-- Footer Actions -->
		<div class="flex items-center justify-between p-4 border-t border-sand/20">
			<div class="text-xs text-sand/60">
				Powered by ACE Context Engine
			</div>
			<div class="flex gap-2">
				<button
					onclick={handleClose}
					class="px-4 py-2 border border-sand/20 rounded-md hover:bg-panelSoft transition-colors text-sm text-sand/80"
				>
					Close
				</button>
				{#if summaryState === 'ready'}
					<button
						onclick={retry}
						class="px-4 py-2 bg-info text-white rounded-md hover:bg-info/80 transition-colors text-sm flex items-center gap-2"
					>
						<Icon name="refresh-cw" class="w-3.5 h-3.5" />
						Regenerate
					</button>
				{/if}
			</div>
		</div>
	</div>
</dialog>
{/if}

<style>
	.summary-dialog {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		max-width: 100vw;
		max-height: 100vh;
		background: transparent;
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
	}
	.summary-dialog::backdrop {
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(2px);
	}
	.dialog-panel {
		width: 100%;
		max-width: 42rem;
		background: var(--panel, #1c1917);
		border: 1px solid var(--sand-dark, rgba(168, 162, 158, 0.2));
		border-radius: 0.5rem;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		max-height: 90vh;
		overflow-y: auto;
	}
</style>
