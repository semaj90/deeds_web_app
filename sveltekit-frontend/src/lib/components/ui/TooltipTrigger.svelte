<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		children?: Snippet;
		child?: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { children, child, ...restProps }: Props = $props();
</script>

{#if child}
	{@render child({ props: restProps })}
{:else}
	<button type="button" {...restProps}>
		{#if children}
			{@render children()}
		{/if}
	</button>
{/if}
