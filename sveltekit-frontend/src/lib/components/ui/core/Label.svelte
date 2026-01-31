<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		forId = undefined,
		className = '',
		text = ''
	}: {
		children?: Snippet;
		forId?: string;
		className?: string;
		text?: string;
	} = $props();
</script>

<label {...(forId ? { for: forId } : {})} class={className}>
	{#if text}
		{text}
	{:else if children}
		{@render children()}
	{/if}
</label>
