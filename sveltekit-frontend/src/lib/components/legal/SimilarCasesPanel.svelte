<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		caseId: string;
		limit?: number;
		class?: string;
	}

	let { caseId, limit = 5, class: className = '' }: Props = $props();

	let loading = $state(true);
	let error = $state<string | null>(null);
	let similarCases = $state<any[]>([]);
	let timing = $state<any>(null);
	let aceContext = $state<any>(null);
	let showBreakdown = $state(false);
	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	// Load similar cases on mount
	$effect(() => {
		void loadSimilarCases();
	});

	async function loadSimilarCases() {
		if (!UUID_RE.test(caseId)) {
			similarCases = [];
			timing = null;
			aceContext = null;
			error = null;
			loading = false;
			return;
		}

		loading = true;
		error = null;

		try {
			const res = await fetch(`/api/cases/${caseId}/similar?limit=${limit}&triggerGraph=true`);

			if (!res.ok) {
				throw new Error(`Failed to load similar cases: ${res.status}`);
			}

			const data = await res.json();
			similarCases = data.results || [];
			timing = data.timing;
			aceContext = data.aceContext;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			console.error('[SimilarCases] Error:', err);
		} finally {
			loading = false;
		}
	}

	function getConfidenceColor(score: number): string {
		if (score > 0.8) return 'text-green-400';
		if (score > 0.6) return 'text-yellow-400';
		if (score > 0.4) return 'text-orange-400';
		return 'text-red-400';
	}

	function getConfidenceBadge(score: number): string {
		if (score > 0.8) return 'Very Similar';
		if (score > 0.6) return 'Similar';
		if (score > 0.4) return 'Somewhat Similar';
		return 'Loosely Related';
	}

	function formatMs(ms: number): string {
		return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
	}
</script>

<div class="flex flex-col gap-3 {className}">
	<!-- Header -->
	<div class="flex items-center justify-between px-3 py-2 border-b border-sand-dark">
		<div class="flex items-center gap-2">
			<Icon name="git-compare" size={16} />
			<span class="text-sm font-semibold">Similar Cases</span>
			{#if timing}
				<span class="text-xs opacity-40">({formatMs(timing.totalMs)})</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<button
				class="text-xs opacity-60 hover:opacity-100 cursor-pointer bg-transparent border-none transition-opacity"
				onclick={() => showBreakdown = !showBreakdown}
				title={showBreakdown ? 'Hide score breakdown' : 'Show score breakdown'}
			>
				<Icon name={showBreakdown ? 'eye-off' : 'eye'} size={14} />
			</button>
			<button
				class="text-xs opacity-60 hover:opacity-100 cursor-pointer bg-transparent border-none transition-opacity"
				onclick={loadSimilarCases}
				title="Refresh"
			>
				<Icon name="refresh-cw" size={14} />
			</button>
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 min-h-0 overflow-y-auto similar-cases-scroll p-3">
		{#if loading}
			<div class="flex items-center justify-center py-8 opacity-40">
				<Icon name="loader-circle" size={24} class="animate-spin" />
				<span class="ml-2 text-sm">Finding similar cases...</span>
			</div>
		{:else if error}
			<div class="flex items-center gap-2 p-3 rounded bg-red-950/40 border border-red-800/30 text-red-300 text-sm">
				<Icon name="triangle-alert" size={14} />
				<span>{error}</span>
			</div>
		{:else if similarCases.length === 0}
			<div class="flex flex-col items-center justify-center py-8 opacity-40 gap-2">
				<Icon name="folder-search" size={32} />
				<span class="text-sm">No similar cases found</span>
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each similarCases as similarCase, idx}
					<a
						href="/cases/{similarCase.caseId}"
						class="flex flex-col gap-2 p-3 rounded border border-sand-dark bg-panel hover:bg-panel-soft transition-colors cursor-pointer group no-underline text-inherit"
					>
						<!-- Header -->
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<span class="text-sm font-medium group-hover:text-accent transition-colors truncate">
										{similarCase.title || 'Untitled Case'}
									</span>
									<span class="text-[10px] px-1.5 py-px rounded bg-white/5 opacity-40 shrink-0">
										#{idx + 1}
									</span>
								</div>
								{#if similarCase.description}
									<p class="text-xs opacity-60 mt-1 line-clamp-2 mb-0">
										{similarCase.description}
									</p>
								{/if}
							</div>
							<div class="flex flex-col items-end gap-1 shrink-0">
								<span class="text-sm font-bold {getConfidenceColor(similarCase.similarity)}">
									{Math.round(similarCase.similarity * 100)}%
								</span>
								<span class="text-[10px] px-1.5 py-px rounded bg-white/5 opacity-60">
									{getConfidenceBadge(similarCase.similarity)}
								</span>
							</div>
						</div>

						<!-- Metadata -->
						<div class="flex flex-wrap gap-2 text-[10px]">
							{#if similarCase.status}
								<span class="px-1.5 py-px rounded bg-blue-900/30 text-blue-300 border border-blue-800/30">
									{similarCase.status}
								</span>
							{/if}
							{#if similarCase.priority}
								<span class="px-1.5 py-px rounded bg-orange-900/30 text-orange-300 border border-orange-800/30">
									{similarCase.priority}
								</span>
							{/if}
							{#if similarCase.jurisdiction}
								<span class="px-1.5 py-px rounded bg-purple-900/30 text-purple-300 border border-purple-800/30">
									{similarCase.jurisdiction}
								</span>
							{/if}
							{#if similarCase.practiceArea}
								<span class="px-1.5 py-px rounded bg-green-900/30 text-green-300 border border-green-800/30">
									{similarCase.practiceArea}
								</span>
							{/if}
						</div>

						<!-- Score Breakdown (conditional) -->
						{#if showBreakdown && similarCase.breakdown}
							<div class="flex flex-col gap-1 mt-1 pt-2 border-t border-sand-dark/50">
								<div class="text-[10px] font-semibold opacity-60 mb-0.5">Score Breakdown:</div>
								<div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
									<div class="flex justify-between">
										<span class="opacity-60">Vector:</span>
										<span>{Math.round(similarCase.breakdown.vector * 100)}%</span>
									</div>
									<div class="flex justify-between">
										<span class="opacity-60">Tags:</span>
										<span>{Math.round(similarCase.breakdown.tags * 100)}%</span>
									</div>
									<div class="flex justify-between">
										<span class="opacity-60">Topic:</span>
										<span>{Math.round(similarCase.breakdown.topic * 100)}%</span>
									</div>
									<div class="flex justify-between">
										<span class="opacity-60">Graph:</span>
										<span>{Math.round(similarCase.breakdown.centrality * 100)}%</span>
									</div>
									<div class="flex justify-between">
										<span class="opacity-60">Profile:</span>
										<span>{Math.round(similarCase.breakdown.userHistory * 100)}%</span>
									</div>
								</div>
							</div>
						{/if}

						<!-- Shared Tags -->
						{#if similarCase.sharedTags && similarCase.sharedTags.length > 0}
							<div class="flex flex-wrap gap-1 mt-1">
								{#each similarCase.sharedTags.slice(0, 3) as tag}
									<span class="text-[9px] px-1 py-px rounded bg-accent-soft/20 text-accent border border-accent/20">
										{tag}
									</span>
								{/each}
								{#if similarCase.sharedTags.length > 3}
									<span class="text-[9px] px-1 py-px rounded bg-white/5 opacity-40">
										+{similarCase.sharedTags.length - 3}
									</span>
								{/if}
							</div>
						{/if}
					</a>
				{/each}
			</div>

			<!-- ACE Context Summary (if available) -->
			{#if aceContext && (aceContext.caseContext || aceContext.ragChunks > 0)}
				<div class="mt-3 p-2 rounded bg-accent-soft/10 border border-accent/20 text-xs">
					<div class="font-semibold text-accent mb-1 flex items-center gap-1.5">
						<Icon name="brain" size={12} />
						<span>ACE Context Used:</span>
					</div>
					<div class="opacity-60 text-[10px]">
						{#if aceContext.caseContext}Case Context, {/if}
						{#if aceContext.ragChunks > 0}{aceContext.ragChunks} RAG Chunks, {/if}
						{#if aceContext.kagNeighbors > 0}{aceContext.kagNeighbors} Graph Links, {/if}
						{#if aceContext.entities > 0}{aceContext.entities} Entities{/if}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.similar-cases-scroll {
		scrollbar-width: thin;
		scrollbar-color: var(--sand-8) var(--sand-4);
	}
	.similar-cases-scroll::-webkit-scrollbar {
		width: 8px;
	}
	.similar-cases-scroll::-webkit-scrollbar-track {
		background: var(--sand-4);
	}
	.similar-cases-scroll::-webkit-scrollbar-thumb {
		background: var(--sand-8);
		border-radius: 4px;
	}
</style>
