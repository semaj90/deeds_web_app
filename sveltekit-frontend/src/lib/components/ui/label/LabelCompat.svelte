<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		for?: string;
		htmlFor?: string;
		class?: string;
		children?: Snippet;
		[key: string]: any;
	}

	let {
		for: forProp,
		htmlFor,
		class: className = '',
		children,
		...rest
	}: Props = $props();

	// Support both 'for' and 'htmlFor' for compatibility - use $derived for reactive
	let labelFor = $derived(htmlFor ?? forProp);
</script>

<label
	for={labelFor}
	class={`
		text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70
		${ className }
	`}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</label>


