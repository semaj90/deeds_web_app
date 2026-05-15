<script lang="ts">
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { AlertDialogContext } from './types';

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	const dialogContext = getContext<AlertDialogContext>('alert-dialog');
</script>

{#if dialogContext?.open}
	<div
		class="alert-dlg-overlay {className}"
		transition:fade={{ duration: 200 }}
		data-state="open"
		aria-hidden="true"
	></div>
{/if}

<style>
	.alert-dlg-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		background:
			radial-gradient(circle at top, rgba(126, 231, 255, 0.14), transparent 26%),
			radial-gradient(circle at bottom right, rgba(255, 212, 121, 0.12), transparent 24%),
			rgba(4, 8, 15, 0.82);
		backdrop-filter: blur(14px) saturate(1.15);
	}
</style>
