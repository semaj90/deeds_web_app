<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		title: string;
		section?: string | null;
		jurisdiction?: string | null;
		category?: string | null;
		sourceUrl?: string | null;
		summaryLoading?: boolean;
		onAnalyze?: () => void;
		onExport?: () => void;
	}

	let {
		title,
		section = null,
		jurisdiction = null,
		category = null,
		sourceUrl = null,
		summaryLoading = false,
		onAnalyze,
		onExport,
	}: Props = $props();
</script>

<header class="flex items-start justify-between gap-4 flex-wrap mb-3">
	<div class="flex-1 min-w-0">
		<h1 class="text-xl font-semibold text-white/90 m-0 leading-snug flex items-center gap-2 flex-wrap">
			{title || 'Untitled Statute'}
			{#if section}
				<span class="glass-pill font-mono text-orange-300/90 bg-orange-400/10 border-orange-400/20">
					&sect; {section}
				</span>
			{/if}
		</h1>
		<div class="flex items-center gap-2 mt-1.5">
			{#if jurisdiction}
				<span class="glass-pill text-green-300/80 bg-green-400/8 border-green-400/15">
					<Icon name="landmark" size={10} />
					{jurisdiction}
				</span>
			{/if}
			{#if category}
				<span class="glass-pill">
					<Icon name="tag" size={10} />
					{category}
				</span>
			{/if}
		</div>
	</div>

	<div class="flex items-center gap-2 shrink-0">
		{#if onAnalyze}
			<button class="btn-orange gap-1.5" onclick={onAnalyze} disabled={summaryLoading}>
				<Icon name="sparkles" size={13} />
				{summaryLoading ? 'Analyzing...' : 'AI Analysis'}
			</button>
		{/if}
		{#if onExport}
			<button class="btn-ghost" onclick={onExport}>
				<Icon name="download" size={13} />
				Export
			</button>
		{/if}
		{#if sourceUrl}
			<a href={sourceUrl} target="_blank" rel="noopener noreferrer" class="btn-ghost no-underline">
				<Icon name="external-link" size={13} />
				Source
			</a>
		{/if}
	</div>
</header>
