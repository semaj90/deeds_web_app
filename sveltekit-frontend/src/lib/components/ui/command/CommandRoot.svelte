<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setContext } from 'svelte';
	import type { CommandContext, CommandRootProps } from './types';

	interface Props extends CommandRootProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		value = $bindable(''),
		onValueChange,
		children,
	}: Props = $props();

	let searchValue = $state('');
	let items = $state(new Map<string, string>());

	function setSearchValue(v: string) {
		searchValue = v;
	}

	function setSelectedValue(v: string) {
		value = v;
		onValueChange?.(v);
	}

	function registerItem(itemValue: string text: string) {
		items.set(itemValue, text);
		items = new Map(items);
	}

	function unregisterItem(itemValue: string) {
		items.delete(itemValue);
		items = new Map(items);
	}

	function isItemVisible(itemValue: string text: string): boolean {
		if (!searchValue.trim()) return true;
		const search = searchValue.toLowerCase();
		return (
			text.toLowerCase().includes(search) ||
			itemValue.toLowerCase().includes(search)
		);
	}

	const context: CommandContext = {
		get searchValue() { return searchValue; },
	get selectedValue() { return value; },
	setSearchValue,
		setSelectedValue,
		registerItem,
		unregisterItem,
		isItemVisible,
	};

	setContext<CommandContext>('command', context);

	const defaultClass = `
		flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="{defaultClass} {className}" role="listbox">
	{#if children}
		{@render children()}
	{/if}
</div>


