<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';

	let { data }: { data: PageData } = $props();

	type Source = (typeof data.sources)[number];

	let filter = $state<'all' | 'complete' | 'in_progress' | 'failed' | 'not_started'>('all');
	let searchQ = $state('');
	let bulkRunning = $state(false);
	let bulkMessage = $state<string | null>(null);
	let perStateRunning = $state(new Set<string>());

	const filtered = $derived.by(() => {
		let list = data.sources;
		if (filter !== 'all') {
			list = list.filter((s) => {
				if (filter === 'complete') return s.processingStatus === 'complete';
				if (filter === 'failed') return s.processingStatus === 'failed';
				if (filter === 'not_started') return s.processingStatus === 'not_started';
				if (filter === 'in_progress')
					return !['complete', 'failed', 'not_started'].includes(s.processingStatus ?? '');
				return true;
			});
		}
		if (searchQ.trim()) {
			const q = searchQ.toLowerCase();
			list = list.filter(
				(s) => s.stateName.toLowerCase().includes(q) || s.stateCode.includes(q)
			);
		}
		return list;
	});

	function statusColor(status: string | null) {
		switch (status) {
			case 'complete':   return 'text-green-400 bg-green-950/50';
			case 'failed':     return 'text-red-400 bg-red-950/50';
			case 'extracting':
			case 'structuring':
			case 'chunking':
			case 'embedding':
			case 'graphing':   return 'text-blue-400 bg-blue-950/50';
			case 'queued':     return 'text-yellow-400 bg-yellow-950/50';
			default:           return 'text-sand/30 bg-sand/5';
		}
	}

	function confidenceDot(confidence: string) {
		if (confidence === 'high') return 'bg-green-400';
		if (confidence === 'medium') return 'bg-yellow-400';
		return 'bg-red-400';
	}

	function formatDate(iso: string | null) {
		if (!iso) return null;
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	async function ingestState(src: Source) {
		perStateRunning = new Set([...perStateRunning, src.stateCode]);
		try {
			const res = await fetch('/api/library/corpus/constitutions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stateCode: src.stateCode }),
			});
			if (!res.ok) {
				const d = await res.json();
				alert(`Failed to start ${src.stateName}: ${d.error}`);
			}
		} finally {
			perStateRunning = new Set([...perStateRunning].filter((c) => c !== src.stateCode));
		}
	}

	async function ingestAll() {
		if (!confirm('Start ingestion for all 50 states? This will run sequentially in the background and may take several hours.')) return;
		bulkRunning = true;
		bulkMessage = null;
		try {
			const res = await fetch('/api/library/corpus/constitutions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ all: true }),
			});
			const d = await res.json();
			bulkMessage = res.ok
				? `Started ingestion for ${d.count} states. Running in background.`
				: `Error: ${d.error}`;
		} finally {
			bulkRunning = false;
		}
	}
</script>

<svelte:head><title>State Constitution Corpus — Legal Library</title></svelte:head>

<div class="min-h-screen bg-app-bg text-sand p-6">
	<!-- Header -->
	<header class="mb-6 flex items-start justify-between gap-4">
		<div>
			<div class="flex items-center gap-2 mb-1">
				<a href="/library" class="text-sand/40 hover:text-sand/70 text-sm">← Library</a>
				<span class="text-sand/20">/</span>
				<span class="text-sm text-sand/60">State Constitutions</span>
			</div>
			<h1 class="text-2xl font-bold text-sand">50-State Constitution Corpus</h1>
			<p class="text-sand/50 text-sm mt-0.5">
				Official state legislature sources · LII discovery layer · Qdrant + pgvector mirrored
			</p>
		</div>
		<button
			onclick={ingestAll}
			disabled={bulkRunning}
			class="px-4 py-2 rounded bg-accent/20 text-accent text-sm font-medium hover:bg-accent/30 disabled:opacity-50 transition-colors shrink-0"
		>
			{#if bulkRunning}
				<span class="animate-pulse">Running…</span>
			{:else}
				Ingest All States
			{/if}
		</button>
	</header>

	{#if bulkMessage}
		<div class="mb-4 p-3 rounded bg-blue-950/40 border border-blue-800/30 text-blue-300 text-sm">
			{bulkMessage}
		</div>
	{/if}

	<!-- Stats bar -->
	<div class="grid grid-cols-5 gap-3 mb-6">
		{#each [
			{ label: 'Total States', value: data.stats.total, color: 'text-sand/70' },
			{ label: 'Complete', value: data.stats.complete, color: 'text-green-400' },
			{ label: 'In Progress', value: data.stats.inProgress, color: 'text-blue-400' },
			{ label: 'Failed', value: data.stats.failed, color: 'text-red-400' },
			{ label: 'Not Started', value: data.stats.notStarted, color: 'text-sand/30' },
		] as stat}
			<div class="panel rounded-lg border border-sand/10 p-3 text-center">
				<div class="text-2xl font-bold {stat.color}">{stat.value}</div>
				<div class="text-[11px] text-sand/40 mt-0.5">{stat.label}</div>
			</div>
		{/each}
	</div>

	<!-- Filter + Search -->
	<div class="flex items-center gap-3 mb-4">
		<input
			bind:value={searchQ}
			type="search"
			placeholder="Search states…"
			class="flex-1 max-w-xs bg-sand/5 border border-sand/10 rounded px-3 py-1.5 text-sm text-sand placeholder:text-sand/30 focus:outline-none focus:border-accent/40"
		/>
		<div class="flex gap-1">
			{#each [
				{ key: 'all', label: 'All' },
				{ key: 'complete', label: 'Complete' },
				{ key: 'in_progress', label: 'Running' },
				{ key: 'failed', label: 'Failed' },
				{ key: 'not_started', label: 'Pending' },
			] as tab}
				<button
					onclick={() => (filter = tab.key as typeof filter)}
					class="px-3 py-1.5 rounded text-xs font-medium transition-colors
						{filter === tab.key
							? 'bg-accent/20 text-accent'
							: 'bg-sand/5 text-sand/40 hover:text-sand/70'}"
				>
					{tab.label}
				</button>
			{/each}
		</div>
		<span class="text-xs text-sand/30 ml-auto">{filtered.length} states</span>
	</div>

	<!-- State grid -->
	<div class="grid grid-cols-1 gap-2">
		{#each filtered as src}
			<div class="panel rounded-lg border border-sand/8 p-4 flex items-center gap-4 hover:border-sand/15 transition-colors">
				<!-- State badge -->
				<div class="w-10 h-10 rounded bg-accent/10 flex items-center justify-center shrink-0">
					<span class="text-sm font-bold text-accent/80 uppercase">{src.stateCode}</span>
				</div>

				<!-- Name + metadata -->
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2 mb-0.5">
						<span class="text-sm font-medium text-sand">{src.stateName}</span>
						{#if src.isOfficial}
							<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-950/50 text-green-400 font-mono">official</span>
						{:else}
							<span class="text-[10px] px-1.5 py-0.5 rounded bg-sand/8 text-sand/30">scraped</span>
						{/if}
						<!-- Source confidence dot -->
						<span class="w-1.5 h-1.5 rounded-full {confidenceDot(src.sourceConfidence)}" title="Source confidence: {src.sourceConfidence}"></span>
						<span class="text-[10px] text-sand/30 font-mono">{src.format.toUpperCase()}</span>
					</div>
					<div class="flex items-center gap-3 text-[11px] text-sand/40">
						{#if src.wordCount}
							<span>{src.wordCount.toLocaleString()} words</span>
						{/if}
						{#if src.nodeCount}
							<span>{src.nodeCount} nodes</span>
						{/if}
						{#if src.chunkCount}
							<span>{src.chunkCount} chunks</span>
						{/if}
						{#if src.lastFetchedAt}
							<span>Fetched {formatDate(src.lastFetchedAt)}</span>
						{/if}
						{#if src.notes}
							<span class="text-yellow-500/60 truncate max-w-xs" title={src.notes}>⚠ {src.notes}</span>
						{/if}
					</div>

					<!-- Progress bar when in progress -->
					{#if src.stage && src.processingStatus !== 'complete' && src.processingStatus !== 'failed'}
						<div class="mt-2 flex items-center gap-2">
							<div class="flex-1 h-1 bg-sand/10 rounded-full overflow-hidden">
								<div
									class="h-full bg-accent rounded-full transition-all duration-500"
									style:width="{src.progress}%"
								></div>
							</div>
							<span class="text-[10px] text-sand/40">{src.stage} {src.progress}%</span>
						</div>
					{/if}

					{#if src.errorText && src.processingStatus === 'failed'}
						<p class="mt-1 text-[10px] text-red-400/70 truncate" title={src.errorText}>{src.errorText}</p>
					{/if}
				</div>

				<!-- Status badge -->
				<div class="shrink-0">
					<span class="text-[10px] px-2 py-0.5 rounded font-mono {statusColor(src.processingStatus)}">
						{src.processingStatus ?? 'pending'}
					</span>
				</div>

				<!-- Actions -->
				<div class="shrink-0 flex items-center gap-2">
					{#if src.documentId}
						<a
							href="/library/{src.documentId}"
							class="text-xs px-2 py-1 rounded bg-sand/5 text-sand/50 hover:text-accent hover:bg-accent/10 transition-colors"
						>
							View
						</a>
					{/if}
					<button
						onclick={() => ingestState(src)}
						disabled={perStateRunning.has(src.stateCode)}
						class="text-xs px-2 py-1 rounded bg-sand/5 text-sand/50 hover:text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors"
						title={src.processingStatus === 'complete' ? 'Re-fetch (checks hash, skips if unchanged)' : 'Start ingestion'}
					>
						{#if perStateRunning.has(src.stateCode)}
							<span class="animate-pulse">…</span>
						{:else if src.processingStatus === 'complete'}
							↺ Refresh
						{:else}
							▶ Ingest
						{/if}
					</button>
					<a
						href={src.sourceUrl ?? src.discoveryUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="text-xs text-sand/25 hover:text-accent/60 transition-colors"
						title="View source"
					>
						↗
					</a>
				</div>
			</div>
		{/each}
	</div>
</div>
