<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, setContext } from 'svelte';
	import type { TabsContext, TabsRootProps } from './types';

	interface Props extends TabsRootProps {
		children?: Snippet;
	}

	let {
		value = $bindable(''),
		defaultValue = '',
		onValueChange,
		children,
		class: className = '',
		orientation = 'horizontal',
	}: Props = $props();

	// Initialize with defaultValue if no value provided (in onMount to avoid state reference warning)
	onMount(() => {
		if (!value && defaultValue) {
			value = defaultValue;
		}
	});

	let tabs = $state<string[]>([]);

	function registerTab(tabValue: string) {
		if (!tabs.includes(tabValue)) {
			tabs = [...tabs, tabValue];
		}
	}

	// Create context with getter pattern for reactivity
	setContext<TabsContext>('tabs', {
		get value() { return value; },
		setValue: (newValue: string) => {
			value = newValue;
			onValueChange?.(newValue);
		},
		get orientation() { return orientation; },
		registerTab,
		get tabs() { return tabs; },
	});
</script>

<div
	class="tabs-root { className }"
	data-orientation={ orientation }
	role="tablist"
	aria-orientation={orientation}
>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.tabs-root {
		display: flex;
		flex-direction: column; gap: 0.5rem;
	}
	.tabs-root[data-orientation="vertical"] {
		flex-direction: row;
	}
</style>



