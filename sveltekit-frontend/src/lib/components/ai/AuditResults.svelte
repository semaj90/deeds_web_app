<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface ErrorSummary {
		file_path: string;
		error_count: number;
		latest_error?: string;
	}

	let results = $state<ErrorSummary[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	$effect(() => {
		fetchResults();
	});

	async function fetchResults() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/errors/summary', {
				signal: AbortSignal.timeout(5000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			results = data.errors ?? data ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load audit results';
			results = [];
		} finally {
			loading = false;
		}
	}

	let totalErrors = $derived(results.reduce((sum, r) => sum + r.error_count, 0));
</script>

<div class="p-3 border border-sand-dark rounded-lg bg-panel-soft">
	<div class="flex items-center gap-2 mb-3">
		<Icon name="alert-triangle" size={16} />
		<h3 class="flex-1 text-sm font-semibold m-0">Pipeline Audit Results</h3>
		<Button variant="ghost" size="sm" onclick={fetchResults} disabled={loading}>
			{loading ? 'Loading...' : 'Refresh'}
		</Button>
	</div>

	{#if loading}
		<p class="text-[13px] m-0">Loading audit results...</p>
	{:else if error}
		<p class="text-[13px] text-danger m-0">{error}</p>
	{:else if results.length === 0}
		<div class="flex items-center gap-2 text-[13px] opacity-60">
			<Icon name="check-circle" size={20} />
			<span>No errors found</span>
		</div>
	{:else}
		<div class="flex items-center gap-2 mb-2 text-xs">
			<span class="font-semibold text-danger">{totalErrors} errors</span>
			<span class="opacity-60">across {results.length} files</span>
		</div>
		<ul class="list-none p-0 m-0 flex flex-col gap-1.5">
			{#each results as item}
				<li class="p-2 rounded bg-white/3">
					<div class="flex items-center gap-1.5 text-[13px]">
						<Icon name="file" size={12} />
						<span class="flex-1 font-mono overflow-hidden text-ellipsis whitespace-nowrap">{item.file_path}</span>
						<span class="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-danger">{item.error_count}</span>
					</div>
					{#if item.latest_error}
						<p class="text-xs opacity-60 mt-1 ml-5 m-0 overflow-hidden text-ellipsis whitespace-nowrap">{item.latest_error}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
