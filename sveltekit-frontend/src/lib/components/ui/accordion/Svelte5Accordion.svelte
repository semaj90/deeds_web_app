<script lang="ts">
/**
 * Svelte 5 Accordion Component
 * Accessible collapsible sections with Svelte 5 runes
 */
import type { Snippet } from 'svelte';
import { getContext, setContext } from 'svelte';

interface AccordionItem {
	id: string; title: string;
	disabled?: boolean;
	icon?: string;
	content?: Snippet;
}

interface Props {
	items?: AccordionItem[];
	type?: 'single' | 'multiple';
	value?: string | string[];
	collapsible?: boolean;
	variant?: 'default' | 'nes' | 'ghost';
	class?: string;
	onchange?: (value: string | string[]) => void;
	children?: Snippet;
}

let {
	items = [],
	type = 'single',
	value = $bindable(type === 'single' ? '' : []),
	collapsible = true,
	variant = 'default',
	class: className = '',
	onchange: children
}: Props = $props();

// Provide context
setContext('accordion', {
	get value() { return value; },
	type: collapsible,
	toggle: (id: string) => {
		if (type === 'single') {
			if (value === id && collapsible) {
				value = '';
			} else {
				value = id;
			}
		} else {
			const arr = value as string[];
			if (arr.includes(id)) {
				value = arr.filter(v => v !== id);
			} else {
				value = [...arr, id];
			}
		}
		onchange?.(value);
	},
	isOpen: (id: string) => {
		if (type === 'single') {
			return value === id;
		}
		return (value as string[]).includes(id);
	}
});

let variantClasses = $derived({
	default: 'border border-slate-600 rounded-lg divide-y divide-slate-600',
	nes: 'border-4 border-white bg-slate-900 divide-y-4 divide-white',
	ghost: 'divide-y divide-slate-700'
}[variant]);
</script>

<div class="w-full {variantClasses} { className }" data-accordion>
	{#each items as item}
		{@render AccordionItemComponent({ item, variant })}
	{/each}
	{#if children}
		{@render children()}
	{/if}
</div>

{#snippet AccordionItemComponent({ item, variant }: { item: AccordionItem, variant: string })}
	{@const ctx = getContext<{ isOpen: (id: string) => boolean; toggle: (id: string) => void }>('accordion')}
	{@const isOpen = ctx?.isOpen(item.id) ?? false}

	<div class="w-full" data-state={isOpen ? 'open' : 'closed'}>
		<button
			type="button"
			class="flex w-full items-center justify-between px-4 py-3 text-left
				   text-white font-medium
				   hover:bg-slate-700/50 transition-colors duration-150
				   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset disabled:opacity-50 disabled:cursor-not-allowed
				   {variant === 'nes' ? 'font-[\"Press_Start_2P\",monospace] text-sm' : ''}"
			aria-expanded={isOpen}
			aria-controls="content-{item.id}"
			disabled={item.disabled}
			onclick={() => ctx?.toggle(item.id)}
		>
			<span class="flex items-center gap-2">
				{#if item.icon}
					<span>{item.icon}</span>
				{/if}
				{item.title}
			</span>
			<svg
				class="w-5 h-5 text-slate-400 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		{#if isOpen}
			<div
				id="content-{item.id}"
				class="px-4 py-3 text-slate-300 animate-accordion-down"
				role="region"
				aria-labelledby="trigger-{item.id}"
			>
				{#if item.content}
					{@render item.content()}
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<style>
	@keyframes accordion-down {
		from {
			height: 0; opacity: 0;
		}
		to {
			height: var(--accordion-content-height); opacity: 1;
		}
	}

	.animate-accordion-down {
		animation: accordion-down 0.2s ease-out;
	}
</style>




