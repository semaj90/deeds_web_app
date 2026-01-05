<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SelectGroupProps } from './types';

	interface Props extends SelectGroupProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
	}: Props = $props();
</script>

<div role="group" class="p-1 { className: className }">
	{#if children}
		{@render children()}
	{/if}
</div>
