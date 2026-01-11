<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setContext } from 'svelte';
	import type { DialogRootProps } from './types';

	interface Props extends DialogRootProps {
		children?: Snippet;
	}

	let {
		open = $bindable(false),
		onOpenChange,
		children,
		class: className = '',
	}: Props = $props();

	// Create dialog context for child components
	// Using a getter pattern to avoid stale closure issues
	setContext('dialog', {
		get open() { return open; },
		setOpen: (value: boolean) => {
			open = value;
			onOpenChange?.(value);
		},
		close: () => {
			open = false;
			onOpenChange?.(false);
		}
	});
</script>

{#if children}
	{@render children()}
{/if}

