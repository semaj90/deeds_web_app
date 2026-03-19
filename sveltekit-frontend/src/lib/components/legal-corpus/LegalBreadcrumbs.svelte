<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	let { crumbs = [] as string[] }: { crumbs?: string[] } = $props();
</script>

<nav class="flex items-center gap-1.5 text-xs text-white/40 py-2" aria-label="Breadcrumb">
	<a href="/legal-corpus" class="inline-flex items-center gap-1 text-orange-400/80 hover:text-orange-300 no-underline">
		<Icon name="book-open" size={13} />
		<span>Legal Corpus</span>
	</a>
	{#each crumbs as crumb, i}
		<span class="text-white/15">/</span>
		{#if i < crumbs.length - 1}
			<span class="text-white/50">{crumb}</span>
		{:else}
			<span class="text-white/80 font-medium">{crumb}</span>
		{/if}
	{/each}
</nav>
