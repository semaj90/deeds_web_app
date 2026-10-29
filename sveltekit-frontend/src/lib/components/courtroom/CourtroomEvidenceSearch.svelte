<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { createCourtroomApi } from '$lib/courtroom/courtroom-api-client-v1.js';
	import { describeApiFailure, viewEvidenceSearch, type EvidenceSearchView } from '$lib/courtroom/courtroom-evidence-search-v1.js';

	let { caseId, localPreview = false }: { caseId?: string; localPreview?: boolean } = $props();

	const api = $derived(createCourtroomApi((input, init) => fetch(input, init), { localPreview }));

	let query = $state('');
	let loading = $state(false);
	let error = $state('');
	let view = $state<EvidenceSearchView | null>(null);

	async function run(event: SubmitEvent) {
		event.preventDefault();
		if (loading || !caseId) return;
		loading = true;
		error = '';
		view = null;
		const result = await api.searchEvidence({ query: query.trim(), caseId });
		loading = false;
		if ('reason' in result) {
			error = describeApiFailure({ reason: result.reason, status: 'status' in result ? result.status : undefined });
			return;
		}
		view = viewEvidenceSearch(result.data);
		if (view.kind === 'malformed') error = describeApiFailure({ reason: 'BAD_RESPONSE' });
	}
</script>

<section aria-label="Search case evidence" class="grid gap-2 text-[#e7efff]">
	{#if !caseId}
		<p class="rounded border border-[#bad0ff]/25 p-2 text-[0.7rem] text-[#a5b6cf]">
			Evidence search needs a real case. This simulation uses a fictional case, so search is off.
		</p>
	{/if}
	<form class="flex gap-1.5" onsubmit={run}>
		<input
			type="search"
			bind:value={query}
			maxlength="5000"
			placeholder="Search the case evidence"
			aria-label="Evidence search text"
			disabled={!caseId}
			class="min-w-0 flex-1 rounded border border-[#34435e] bg-[#1b2740] px-2 py-1 text-xs text-[#e7efff] placeholder:text-[#a5b6cf] focus-visible:outline-2 focus-visible:outline-[#8bdfff]"
		/>
		<button
			type="submit"
			disabled={loading || !caseId || !query.trim()}
			class="flex items-center gap-1 rounded border border-[#d4b96e] bg-[#3e3650] px-2 py-1 text-xs font-bold text-[#fff3c6] disabled:cursor-not-allowed disabled:opacity-40"
		>
			<Icon name="yorha-evidence" size={14} />{loading ? 'Searching...' : 'Search'}
		</button>
	</form>

	{#if error}
		<p role="alert" class="rounded border border-[#e0583a]/50 bg-[#e0583a]/15 p-2 text-[0.7rem] text-[#ff9a80]">{error}</p>
	{/if}

	{#if view?.kind === 'empty'}
		<p class="text-[0.7rem] text-[#a5b6cf]">No matching passages. An empty answer is not proof that no evidence exists.</p>
	{:else if view?.kind === 'rows'}
		<p class="text-[0.6rem] uppercase tracking-wider text-[#c2aaff]">Results are for reading only. They are not admitted exhibits.</p>
		<ul class="grid gap-1.5">
			{#each view.rows as row (row.key)}
				<li class="rounded border border-[#bad0ff]/25 bg-[#0a1526]/70 p-2 text-[0.7rem] leading-snug">
					<p class="text-[#e7efff]">{row.snippet}</p>
					<p class="mt-1 font-mono text-[0.55rem] text-[#a5b6cf]">{row.source ?? row.evidenceId} | score {row.score}</p>
				</li>
			{/each}
		</ul>
	{/if}
</section>
