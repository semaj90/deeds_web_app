<script lang="ts">
	let className = $state<any>(undefined);

	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { AlertDialogContext } from './types';

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	const dialogContext = getContext<AlertDialogContext>('alert-dialog');

	const defaultClass = `
		fixed inset-0 z-50 bg-black/80
	`.replace(/\s+/g, ' ').trim();
</script>

{#if dialogContext?.open}
	<div
		class="{defaultClass} {className}"
		transition:fade={{ duration: 150 }}
		data-state="open"
		aria-hidden="true"
	></div>
{/if}
