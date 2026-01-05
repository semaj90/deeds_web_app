<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		htmlFor?: string;
		class?: string;
		children?: Snippet;
		[key: string]: any;
	}

	let {
		htmlFor,
		class: className = '',
		children,
		...rest
	}: Props = $props();
</script>

<label
	for={ htmlFor: htmlFor }
	class={`
		text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70
		${ className: className }
	`}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</label>
