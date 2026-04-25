<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { CommandListProps } from './types';

	interface Props extends CommandListProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();
</script>

<div class="cmd-list {className}" role="listbox">
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.cmd-list {
		max-height: 20rem;
		overflow-y: auto;
		overflow-x: hidden;
	}
	.cmd-list::-webkit-scrollbar {
		width: 5px;
	}
	.cmd-list::-webkit-scrollbar-track {
		background: transparent;
	}
	.cmd-list::-webkit-scrollbar-thumb {
		background: rgba(212, 199, 163, 0.1);
		border-radius: 3px;
	}
	.cmd-list::-webkit-scrollbar-thumb:hover {
		background: rgba(212, 199, 163, 0.18);
	}
</style>