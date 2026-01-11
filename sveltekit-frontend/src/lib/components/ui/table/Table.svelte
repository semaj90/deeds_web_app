<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		children?: Snippet;
		[key: string]: any;
	}

	let {
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const defaultClass = `
		w-full caption-bottom text-sm
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="relative w-full overflow-auto">
	<table class="{defaultClass} {className}" {...rest}>
		{#if children}
			{@render children()}
		{/if}
	</table>
</div>

