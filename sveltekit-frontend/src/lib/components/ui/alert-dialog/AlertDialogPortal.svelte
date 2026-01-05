<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { AlertDialogContext } from './types';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();

	const dialogContext = getContext<AlertDialogContext>('alert-dialog');
</script>

{#if dialogContext?.open}
	{#if children}
		{@render children()}
	{/if}
{/if}
