<script lang="ts">
	/**
	 * AI Summary Mini Modal — Compact evidence summarization with ACE context
	 * Triggered from Evidence Board AI chat, can summarize any evidence item
	 * Bits UI v2 Dialog Primitives portaled to body (z-[9990+])
	 */
	import { Dialog } from 'bits-ui';
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
					caseId,
					evidenceId,
					content: evidenceContent,
					type: 'compact'
				})
			});

			if (!response.ok) {
				throw new Error(`Failed to generate summary: ${response.statusText}`);
			}

			const data = await response.json();
			summary = data.summary;
			keyInsights = data.keyInsights || [];
			confidence = data.confidence || 0.85;
			aceContext = data.aceContext;
			summaryState = 'ready';
		} catch (err: any) {
			console.error('AI summary error:', err);
			error = err.message || 'Failed to generate summary';
			summaryState = 'error';
		}
	}

	function handleClose() {
		open = false;
		onClose?.();
	}

	function retry() {
		generateSummary();
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) handleClose();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="summary-dialog-backdrop" />
		<Dialog.Content class="summary-dialog-panel">
			<!-- Tactical Corner Notches -->
			<span class="hud-notch-tl" aria-hidden="true"></span>
			<span class="hud-notch-tr" aria-hidden="true"></span>
			<span class="hud-notch-bl" aria-hidden="true"></span>
			<span class="hud-notch-br" aria-hidden="true"></span>

			<!-- Gold Top Line Accent -->
			<div class="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471] to-transparent opacity-80" aria-hidden="true"></div>

			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-sand/20 bg-black/40">
				<div class="flex items-center gap-3">
					<div class="p-2 bg-info/10 border border-info/20 rounded-lg">
						<Icon name="brain" class="w-5 h-5 text-info" />
					</div>
					<div>
						<Dialog.Title class="text-base font-semibold text-white tracking-wide">
							AI Evidence Summary
						</Dialog.Title>
						{#if evidenceTitle}
							<Dialog.Description class="text-xs text-sand/60 font-mono mt-0.5">
								{evidenceTitle}
							</Dialog.Description>
						{/if}
					</div>
				</div>
				<div class="flex items-center gap-2">
					{#if confidence > 0}
						<div class="px-2.5 py-0.5 bg-accent/15 border border-accent/30 text-accent rounded-full text-xs font-mono">
							{Math.round(confidence * 100)}% confidence
						</div>
					{/if}
					<Dialog.Close
						class="p-1.5 text-sand/40 hover:text-white hover:bg-white/10 rounded transition-colors cursor-pointer"
						onclick={handleClose}
						aria-label="Close"
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
							<div class="w-8 h-8 border-3 border-info/20 border-t-info rounded-full animate-spin"></div>
							<p class="text-xs font-mono text-sand/60">Generating AI summary with ACE context...</p>
						</div>
					</div>
				{:else if summaryState === 'error'}
					<div class="p-4 bg-danger/10 border border-danger/30 rounded-lg">
						<div class="flex items-center gap-3 mb-3">
							<div class="text-danger text-lg font-bold">!</div>
							<div>
								<h4 class="font-medium text-danger text-sm">Error</h4>
								<p class="text-danger/80 text-xs">{error}</p>
							</div>
						</div>
						<button
							onclick={retry}
							class="px-3 py-1.5 bg-danger/20 hover:bg-danger/30 text-danger text-xs rounded transition-colors font-mono cursor-pointer"
						>
							Retry
						</button>
					</div>
				{:else if summaryState === 'ready'}
					<div class="space-y-4">
						<!-- Summary Text -->
						<div>
							<h3 class="text-xs font-mono uppercase tracking-wider text-[#f3d471] mb-2">Summary</h3>
							<p class="text-sm text-sand/90 leading-relaxed bg-black/30 p-3 rounded-lg border border-sand/10">
								{summary}
							</p>
						</div>

						<!-- Key Insights -->
						{#if keyInsights.length > 0}
							<div>
								<h3 class="text-xs font-mono uppercase tracking-wider text-[#7ee7ff] mb-2">Key Insights</h3>
								<ul class="space-y-2">
									{#each keyInsights as insight}
										<li class="flex items-start gap-2 text-xs text-sand/80">
											<span class="text-info mt-0.5">•</span>
											<span>{insight}</span>
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						<!-- ACE Context Indicators -->
						{#if aceContext}
							<div class="pt-4 border-t border-sand/10">
								<h3 class="text-[10px] font-mono uppercase tracking-widest text-sand/50 mb-2">Context Sources</h3>
								<div class="flex flex-wrap gap-2">
									{#if aceContext.usedRAG}
										<span class="px-2 py-0.5 bg-info/10 text-info text-[11px] rounded font-mono border border-info/20">RAG Knowledge</span>
									{/if}
									{#if aceContext.usedGraph}
										<span class="px-2 py-0.5 bg-accent/10 text-accent text-[11px] rounded font-mono border border-accent/20">Case Graph</span>
									{/if}
									{#if aceContext.cached}
										<span class="px-2 py-0.5 bg-sand/10 text-sand/60 text-[11px] rounded font-mono border border-sand/20">Cached Result</span>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-between p-4 border-t border-sand/20 bg-black/30">
				<div class="text-[11px] text-sand/50 font-mono">
					Powered by ACE Context Engine
				</div>
				<div class="flex gap-2">
					<button
						onclick={handleClose}
						class="px-4 py-2 border border-sand/20 rounded-md hover:bg-white/5 transition-colors text-xs font-mono text-sand/80 cursor-pointer"
					>
						Close
					</button>
					{#if summaryState === 'ready'}
						<button
							onclick={retry}
							class="px-4 py-2 bg-[#f3d471] hover:bg-[#ffe180] text-black font-bold rounded-md transition-colors text-xs font-mono flex items-center gap-1.5 cursor-pointer"
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

<style>
	:global(.summary-dialog-backdrop) {
		position: fixed;
		inset: 0;
		z-index: 9990;
		background: rgba(4, 6, 12, 0.78);
		backdrop-filter: blur(14px) saturate(1.1);
	}

	:global(.summary-dialog-panel) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 9991;
		width: min(42rem, calc(100vw - 2rem));
		background: linear-gradient(180deg, rgba(19, 27, 42, 0.98) 0%, rgba(8, 12, 20, 0.99) 100%);
		border: 1px solid rgba(212, 199, 163, 0.28);
		border-radius: 14px;
		box-shadow:
			0 0 0 1px rgba(126, 231, 255, 0.05),
			0 28px 60px -18px rgba(0, 0, 0, 0.85),
			0 0 45px rgba(243, 212, 113, 0.1);
		backdrop-filter: blur(20px);
		overflow: hidden;
	}
</style>
