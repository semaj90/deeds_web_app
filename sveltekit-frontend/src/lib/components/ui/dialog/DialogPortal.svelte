<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { DialogPortalProps } from './types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

	interface Props extends DialogPortalProps {
		children?: Snippet;
	}

	let {
		children,
		to,
		disabled = false,
	}: Props = $props();

	const dialogContext = getContext<{ open, boolean }>('dialog');

	// For now, just render children in place (SSR-safe)
	// A full portal implementation would teleport to document.body
</script>

{#if dialogContext?.open}
	{#if children}
		{@render children()}
	{/if}
{/if}


