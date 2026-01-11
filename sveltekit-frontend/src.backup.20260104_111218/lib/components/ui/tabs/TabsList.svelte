<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { TabsContext, TabsListProps } from './types';

	interface Props extends TabsListProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		loop = true,
	}: Props = $props();

	const tabsContext = getContext<TabsContext>('tabs');

	function handleKeydown(e: KeyboardEvent) {
		const tabs = tabsContext?.tabs ?? [];
		const currentIndex = tabs.indexOf(tabsContext?.value ?? '');
		const orientation = tabsContext?.orientation ?? 'horizontal';

		let nextIndex = currentIndex;
		const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
		const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';

		if (e.key === nextKey) {
			e.preventDefault();
			nextIndex = currentIndex + 1;
			if (nextIndex >= tabs.length) {
				nextIndex = loop ? 0 : tabs.length - 1;
			}
		} else if (e.key === prevKey) {
			e.preventDefault();
			nextIndex = currentIndex - 1;
			if (nextIndex < 0) {
				nextIndex = loop ? tabs.length - 1 : 0;
			}
		} else if (e.key === 'Home') {
			e.preventDefault();
			nextIndex = 0;
		} else if (e.key === 'End') {
			e.preventDefault();
			nextIndex = tabs.length - 1;
		}

		if (nextIndex !== currentIndex && tabs[nextIndex]) {
			tabsContext?.setValue(tabs[nextIndex]);
			const tabTrigger = document.querySelector(`[data-tabs-trigger="${tabs[nextIndex]}"]`) as HTMLElement;
			tabTrigger?.focus();
		}
	}

	const defaultClass = `
		inline-flex h-10 items-center justify-center rounded-md
		bg-muted p-1 text-muted-foreground
	`.replace(/\s+/g, ' ').trim();
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="{defaultClass} {className}"
	role="tablist"
	tabindex="0"
	aria-orientation={tabsContext?.orientation ?? 'horizontal'}
	onkeydown={handleKeydown}
>
	{#if children}
		{@render children()}
	{/if}
</div>
