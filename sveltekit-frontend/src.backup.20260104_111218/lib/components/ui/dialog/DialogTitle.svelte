<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DialogTitleProps } from './types';

	interface Props extends DialogTitleProps {
		children?: Snippet;
	}

	let {
		children,
		class: className = '',
		level = 2,
	}: Props = $props();

	const defaultClass = 'text-lg font-semibold leading-none tracking-tight text-slate-100';
</script>

{#if level === 1}
	<h1 class="{defaultClass} {className}" data-dialog-title="">
		{#if children}
			{@render children()}
		{/if}
	</h1>
{:else if level === 2}
	<h2 class="{defaultClass} {className}" data-dialog-title="">
		{#if children}
			{@render children()}
		{/if}
	</h2>
{:else if level === 3}
	<h3 class="{defaultClass} {className}" data-dialog-title="">
		{#if children}
			{@render children()}
		{/if}
	</h3>
{:else if level === 4}
	<h4 class="{defaultClass} {className}" data-dialog-title="">
		{#if children}
			{@render children()}
		{/if}
	</h4>
{:else if level === 5}
	<h5 class="{defaultClass} {className}" data-dialog-title="">
		{#if children}
			{@render children()}
		{/if}
	</h5>
{:else}
	<h6 class="{defaultClass} {className}" data-dialog-title="">
		{#if children}
			{@render children()}
		{/if}
	</h6>
{/if}
