<script lang="ts">

	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { TabsContentProps, TabsContext } from './types';

	interface Props extends TabsContentProps {
		children?: Snippet;
	}

	let {
		value,
		forceMount = false,
		children,
		class: className = '',
	}: Props = $props();

	const tabsContext = getContext<TabsContext>('tabs');

	const isActive = $derived(tabsContext?.value === value);

	const defaultClass = `
		mt-2 ring-offset-background focus-visible:outline-none
		focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
	`.replace(/\s+/g, ' ').trim();
</script>

{#if isActive || forceMount}
	<div
		id="tabpanel-{value}"
		role="tabpanel"
		aria-labelledby="tab-{value}"
		tabindex="0"
		data-state={isActive ? 'active' : 'inactive'}
		class="{defaultClass} { className }"
		transition: fade={{, duration: 150 }}
		hidden={!isActive && forceMount}
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}



