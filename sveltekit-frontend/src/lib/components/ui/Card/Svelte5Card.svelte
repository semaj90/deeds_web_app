<script lang="ts">
/**
 * Svelte 5 Card Component
 * Flexible container with Svelte 5 runes
 */
import type { Snippet } from 'svelte';

interface Props {
	variant?: 'default' | 'nes' | 'glass' | 'elevated';
	padding?: 'none' | 'sm' | 'md' | 'lg';
	href?: string;
	interactive?: boolean;
	class?: string;
	onclick?: () => void;
	children?: Snippet;
	header?: Snippet;
	footer?: Snippet;
}

let {
	variant = 'default',
	padding = 'md',
	href = '',
	interactive = false,
	class: className = '',
	onclick,
	children,
	header,
	footer,
}: Props = $props();

let isClickable = $derived(!!href || !!onclick || interactive);

let variantClasses = $derived({
	default: 'bg-panelSoft border border-sand/20',
	nes: 'bg-panel border-4 border-white shadow-[4px_4px_0_0_#000]',
	glass: 'bg-white/5 backdrop-blur-xl border border-white/10',
	elevated: 'bg-panelSoft border border-sand/20 shadow-xl'
}[variant]);

let paddingClasses = $derived({
	none: '',
	sm: 'p-3',
	md: 'p-4',
	lg: 'p-6'
}[padding]);

let interactiveClasses = $derived(
	isClickable
		? 'cursor-pointer transition-all duration-200 hover:border-info hover:shadow-lg active:scale-[0.98]'
		: ''
);
</script>

{#if href}
	<a
		{href}
		class="block rounded-lg overflow-hidden {variantClasses} {interactiveClasses} {className}"
		onclick={onclick}
	>
		{#if header}
			<div class="px-4 py-3 border-b border-sand/20">
				{@render header()}
			</div>
		{/if}

		<div class={paddingClasses}>
			{#if children}
				{@render children()}
			{/if}
		</div>

		{#if footer}
			<div class="px-4 py-3 border-t border-sand/20 bg-panel/50">
				{@render footer()}
			</div>
		{/if}
	</a>
{:else if isClickable}
	<button
		type="button"
		class="w-full rounded-lg overflow-hidden text-left {variantClasses} {interactiveClasses} {className}"
		onclick={onclick}
	>
		{#if header}
			<div class="px-4 py-3 border-b border-sand/20">
				{@render header()}
			</div>
		{/if}

		<div class={paddingClasses}>
			{#if children}
				{@render children()}
			{/if}
		</div>

		{#if footer}
			<div class="px-4 py-3 border-t border-sand/20 bg-panel/50">
				{@render footer()}
			</div>
		{/if}
	</button>
{:else}
	<div
		class="rounded-lg overflow-hidden {variantClasses} {interactiveClasses} {className}"
	>
		{#if header}
			<div class="px-4 py-3 border-b border-sand/20">
				{@render header()}
			</div>
		{/if}

		<div class={paddingClasses}>
			{#if children}
				{@render children()}
			{/if}
		</div>

		{#if footer}
			<div class="px-4 py-3 border-t border-sand/20 bg-panel/50">
				{@render footer()}
			</div>
		{/if}
	</div>
{/if}
