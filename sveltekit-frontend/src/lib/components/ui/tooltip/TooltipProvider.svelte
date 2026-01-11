<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setContext } from 'svelte';
	import type { TooltipProviderProps } from './types';

	interface Props extends TooltipProviderProps {
		children?: Snippet;
	}

	let {
		delayDuration = 300,
		skipDelayDuration = 100,
		children,
		class: className = '',
	}: Props = $props();

	// Provider-level context for shared delay settings
	setContext('tooltip-provider', {
		get delayDuration() { return delayDuration; },
		get skipDelayDuration() { return skipDelayDuration; },
	});
</script>

{#if children}
	{@render children()}
{/if}

