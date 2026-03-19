<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		jurisdiction?: string | null;
		category?: string | null;
		citation?: string;
		status?: string;
		effectiveDate?: string | null;
		updatedAt?: string | null;
		sourceUrl?: string | null;
	}

	let {
		jurisdiction = null,
		category = null,
		citation = '',
		status = 'Unknown',
		effectiveDate = null,
		updatedAt = null,
		sourceUrl = null,
	}: Props = $props();

	function fmtDate(d: string | null): string {
		if (!d) return 'N/A';
		return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<div class="flex items-center gap-3 flex-wrap glass-soft px-4 py-2.5 mb-3">
	{#if jurisdiction}
		<div class="flex flex-col gap-0.5">
			<span class="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Jurisdiction</span>
			<span class="text-xs text-green-300/80 font-medium">{jurisdiction}</span>
		</div>
		<div class="w-px h-5 bg-white/8"></div>
	{/if}

	{#if category}
		<div class="flex flex-col gap-0.5">
			<span class="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Corpus</span>
			<span class="text-xs text-white/70">{category}</span>
		</div>
		<div class="w-px h-5 bg-white/8"></div>
	{/if}

	{#if citation}
		<div class="flex flex-col gap-0.5">
			<span class="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Citation</span>
			<span class="text-xs text-white/70 font-mono">{citation}</span>
		</div>
		<div class="w-px h-5 bg-white/8"></div>
	{/if}

	<div class="flex flex-col gap-0.5">
		<span class="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Status</span>
		{#if status === 'Current'}
			<span class="text-xs font-medium text-green-300">{status}</span>
		{:else if status === 'Pending'}
			<span class="text-xs font-medium text-yellow-300">{status}</span>
		{:else}
			<span class="text-xs font-medium text-white/60">{status}</span>
		{/if}
	</div>
	<div class="w-px h-5 bg-white/8"></div>

	<div class="flex flex-col gap-0.5">
		<span class="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Effective</span>
		<span class="text-xs text-white/60">{fmtDate(effectiveDate)}</span>
	</div>

	{#if updatedAt}
		<div class="w-px h-5 bg-white/8"></div>
		<div class="flex flex-col gap-0.5">
			<span class="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Updated</span>
			<span class="text-xs text-white/60">{fmtDate(updatedAt)}</span>
		</div>
	{/if}

	{#if sourceUrl}
		<div class="ml-auto flex items-center gap-1 text-[11px] text-yellow-400/70 bg-yellow-400/6 border border-yellow-400/12 rounded px-2 py-0.5">
			<Icon name="shield-check" size={11} />
			AI-generated — verify with official sources
		</div>
	{/if}
</div>
