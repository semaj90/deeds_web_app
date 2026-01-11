<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext, onMount } from 'svelte';
	import type { TabsContext, TabsTriggerProps } from './types';

	interface Props extends TabsTriggerProps {
		children?: Snippet;
	}

	let {
		value,
		disabled = false,
		children,
		class: className = '',
	}: Props = $props();

	const tabsContext = getContext<TabsContext>('tabs');

	onMount(() => {
		tabsContext?.registerTab(value);
	});

	function handleClick() {
		if (!disabled) {
			tabsContext?.setValue(value);
		}
	}

	const isActive = $derived(tabsContext?.value === value);

	const defaultClass = `
		inline-flex items-center justify-center whitespace-nowrap rounded-sm
		px-3 py-1.5 text-sm font-medium ring-offset-background
		transition-all focus-visible:outline-none focus-visible:ring-2
		focus-visible:ring-ring focus-visible:ring-offset-2
		disabled:pointer-events-none disabled:opacity-50
	`.replace(/\s+/g, ' ').trim();
</script>

<button
	type="button"
	role="tab"
	aria-selected={isActive}
	aria-controls="tabpanel-{value}"
	tabindex={isActive ? 0 : -1}
	data-tabs-trigger={value}
	data-state={isActive ? 'active' : 'inactive'}
	{disabled}
	onclick={handleClick}
	class="{defaultClass} {isActive ? 'bg-background text-foreground shadow-sm' : ''} {className}"
>
	{#if children}
		{@render children()}
	{/if}
</button>
