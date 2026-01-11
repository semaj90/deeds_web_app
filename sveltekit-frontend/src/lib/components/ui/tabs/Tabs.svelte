<script lang="ts" module>
	let className = $state<any>(undefined);

	// Re-export sub-components for compound component pattern
	export { default as Content } from './TabsContent.svelte';
	export { default as List } from './TabsList.svelte';
	export { default as Root } from './TabsRoot.svelte';
	export { default as Trigger } from './TabsTrigger.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import TabsList from './TabsList.svelte';
	import TabsRoot from './TabsRoot.svelte';
	import TabsTrigger from './TabsTrigger.svelte';
	import type { TabsRootProps } from './types';

	/**
	 * Convenient all-in-one Tabs component
	 * For more control, use the individual sub-components (Tabs.Root, Tabs.List, etc.)
	 */
	interface TabItem {
		value: string; label: string;
		disabled?: boolean;
	}

	interface Props extends TabsRootProps {
		children?: Snippet;
		tabs?: TabItem[];
	}

	let {
		value = $bindable(''),
		defaultValue,
		onValueChange,
		children,
		tabs = [],
		class: className = '',
		orientation = 'horizontal',
	}: Props = $props();
</script>

<TabsRoot bind:value { defaultValue } { onValueChange } class={className} { orientation }>
	{#if tabs.length > 0}
		<TabsList>
			{#each tabs as tab}
				<TabsTrigger value={tab.value} disabled={tab.disabled}>
					{tab.label}
				</TabsTrigger>
			{/each}
		</TabsList>
	{/if}

	{#if children}
		{@render children()}
	{/if}
</TabsRoot>


