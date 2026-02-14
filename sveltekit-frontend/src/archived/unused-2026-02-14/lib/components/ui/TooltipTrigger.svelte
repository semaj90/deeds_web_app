<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		asChild?: boolean;
		children?: Snippet;
	}

	let { asChild = false, children, ...restProps }: Props = $props();
</script>

{#if asChild}
	{#if children}
		{@render children()}
	{/if}
{:else}
	<button type="button" {...restProps}>
		{#if children}
			{@render children()}
		{/if}
	</button>
{/if}
