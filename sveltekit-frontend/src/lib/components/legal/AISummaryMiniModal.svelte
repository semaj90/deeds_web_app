<script lang="ts">
	/**
	 * AI Summary Mini Modal — Compact evidence summarization with ACE context
	 * Triggered from Evidence Board AI chat, can summarize any evidence item
	 */
	import Icon from '$lib/components/ui/Icon.svelte';
	import { Dialog } from 'bits-ui';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		open?: boolean;
		caseId?: string;
		evidenceId?: string;
		evidenceTitle?: string;
		evidenceContent?: string;
		onClose?: () => void;
	}

	let { open = $bindable(false), caseId, evidenceId, evidenceTitle, evidenceContent, onClose }: Props = $props();

	type SummaryState = 'idle' | 'loading' | 'ready' | 'error';
	let summaryState: SummaryState = $state('idle');
	let summary: string | null = $state(null);
	let keyInsights: string[] = $state([]);
	let confidence = $state(0);
	let error: string | null = $state(null);
	let aceContext: any = $state(null);

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
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
			transition={fade}
			transitionConfig={{ duration: 150 }}
		/>
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2
				bg-white rounded-lg shadow-xl border border-sand/20"
			transition={fly}
			transitionConfig={{ y: 20, duration: 200 }}
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-sand/20">
				<div class="flex items-center gap-3">
					<div class="p-2 bg-info/10 rounded-lg">
						<Icon name="brain" class="w-5 h-5 text-info" />
					</div>
					<div>
						<Dialog.Title class="text-lg font-semibold">AI Evidence Summary</Dialog.Title>
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
					<Dialog.Close
						class="p-2 hover:bg-sand/10 rounded-md text-sand/60 hover:text-sand transition-colors"
						onclick={handleClose}
					>
						<Icon name="x" class="w-4 h-4" />
					</Dialog.Close>
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
					<div class="bg-danger/5 border border-danger/20 rounded-lg p-4" in:fade>
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
							<div class="bg-info/5 border border-info/20 rounded-lg p-4" in:fly={{ y: 20, duration: 300 }}>
								<h4 class="font-medium text-info mb-2 flex items-center gap-2">
									<Icon name="file-text" class="w-4 h-4" />
									Summary
								</h4>
								<p class="text-sand/80 leading-relaxed">{summary}</p>
							</div>
						{/if}

						<!-- Key Insights -->
						{#if keyInsights.length > 0}
							<div class="bg-accent/5 border border-accent/20 rounded-lg p-4" in:fly={{ y: 20, duration: 300, delay: 100 }}>
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
							<div class="bg-sand/5 border border-sand/20 rounded-lg p-4" in:fly={{ y: 20, duration: 300, delay: 200 }}>
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
			<div class="flex items-center justify-between p-4 border-t border-sand/20 bg-sand/5">
				<div class="text-xs text-sand/60">
					Powered by ACE Context Engine
				</div>
				<div class="flex gap-2">
					<button
						onclick={handleClose}
						class="px-4 py-2 border border-sand/20 rounded-md hover:bg-sand/10 transition-colors text-sm"
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
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
