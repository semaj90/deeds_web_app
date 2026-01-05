<script lang="ts">
	let className = $state<any>(undefined);

	import type { Snippet } from 'svelte';
	import type { CommandGroupProps } from './types';

	interface Props extends CommandGroupProps {
		children?: Snippet;
	}

	let {
		heading = '',
		class: className = '',
		children,
	}: Props = $props();

	const defaultClass = `
		overflow-hidden p-1 text-foreground
	`.replace(/\s+/g, ' ').trim();

	const headingClass = `
		px-2 py-1.5 text-xs font-medium text-muted-foreground
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="{defaultClass} {className}" role="group">
	{#if heading}
		<div class={headingClass}>
			{heading}
		</div>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</div>
