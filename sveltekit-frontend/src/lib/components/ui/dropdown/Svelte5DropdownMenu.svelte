<script lang="ts">
	let className = $state<any>(undefined);

/**
 * Svelte 5 Dropdown Menu Component
 * Accessible dropdown with Svelte 5 runes
 */
import type { Snippet } from 'svelte';

interface MenuItem {
	id: string;
	label?: string;
	icon?: string;
	shortcut?: string;
	disabled?: boolean;
	danger?: boolean;
	separator?: boolean;
}

interface Props {
	items?: MenuItem[];
	open?: boolean;
	align?: 'start' | 'center' | 'end';
	side?: 'top' | 'bottom';
	class?: string;
	onselect?: (id: string) => void;
	onOpenChange?: (open: boolean) => void;
	children?: Snippet;
	trigger?: Snippet;
}

let {
	items = [],
	open = $bindable(false),
	align = 'start',
	side = 'bottom',
	class: className = '',
	onselect: onOpenChange,
	children: trigger
}: Props = $props();

let menuRef = $state<HTMLDivElement | null>(null);
let triggerRef = $state<HTMLButtonElement | null>(null);
let focusedIndex = $state(-1);

let alignClasses = $derived({
	start: 'left-0',
	center: 'left-1/2 -translate-x-1/2',
	end: 'right-0'
}[align]);

let sideClasses = $derived({
	top: 'bottom-full mb-1',
	bottom: 'top-full mt-1'
}[side]);

function toggle() {
	open = !open;
	onOpenChange?.(open);
	if (open) {
		focusedIndex = 0;
	}
}

function close() {
	open = false;
	onOpenChange?.(false);
	focusedIndex = -1;
}

function selectItem(item: MenuItem) {
	if (item.disabled || item.separator) return;
	onselect?.(item.id);
	close();
}

function handleKeydown(e: KeyboardEvent) {
	if (!open) return;

	const enabledItems = items.filter(i => !i.disabled && !i.separator);

	switch (e.key) {
		case 'Escape':
			e.preventDefault();
			close();
			triggerRef?.focus();
			break;
		case 'ArrowDown':
			e.preventDefault();
			focusedIndex = (focusedIndex + 1) % enabledItems.length;
			break;
		case 'ArrowUp':
			e.preventDefault();
			focusedIndex = (focusedIndex - 1 + enabledItems.length) % enabledItems.length;
			break;
		case 'Enter':
		case ' ':
			e.preventDefault();
			if (focusedIndex >= 0) {
				selectItem(enabledItems[focusedIndex]);
			}
			break;
	}
}

function handleClickOutside(e: MouseEvent) {
	const target = e.target as Node;
	if (menuRef && !menuRef.contains(target) && triggerRef && !triggerRef.contains(target)) {
		close();
	}
}

$effect(() => {
	if (open) {
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);
	}
	return () => {
		document.removeEventListener('click', handleClickOutside);
		document.removeEventListener('keydown', handleKeydown);
	};
});
</script>

<div class="relative inline-block {className}">
	<button
		bind:this={triggerRef}
		type="button"
		class="inline-flex items-center justify-center"
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={toggle}
	>
		{#if trigger}
			{@render trigger()}
		{:else if children}
			{@render children()}
		{:else}
			<span class="px-3 py-2 bg-slate-700 rounded-lg text-white hover:bg-slate-600">
				Menu
				<svg class="w-4 h-4 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</span>
		{/if}
	</button>

	{#if open}
		<div
			bind:this={menuRef}
			class="absolute z-50 {alignClasses} {sideClasses}
				   min-w-[180px] py-1
				   bg-slate-800 border border-slate-600 rounded-lg shadow-xl
				   animate-in fade-in-0 zoom-in-95 duration-100"
			role="menu"
			aria-orientation="vertical"
		>
			{#each items as item, i}
				{#if item.separator}
					<div class="my-1 h-px bg-slate-700" role="separator"></div>
				{:else}
					<button
						type="button"
						class="w-full px-3 py-2 text-left text-sm flex items-center gap-2
							   transition-colors duration-100
							   {item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
							   {item.danger ? 'text-red-400 hover:bg-red-900/30' : 'text-white, hover:bg-slate-700'}
							   {focusedIndex === i ? 'bg-slate-700' : ''}"
						role="menuitem"
						tabindex={focusedIndex === i ? 0 , -1}
						disabled={item.disabled}
						onclick={() => selectItem(item)}
						onmouseenter={() => focusedIndex = i}
					>
						{#if item.icon}
							<span class="w-4 text-center">{item.icon}</span>
						{/if}
						<span class="flex-1">{item.label}</span>
						{#if item.shortcut}
							<span class="text-xs text-slate-500">{item.shortcut}</span>
						{/if}
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.animate-in {
		animation: fade-in 0.1s ease-out, zoom-in 0.1s ease-out;
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes zoom-in {
		from { transform: scale(0.95); }
		to { transform: scale(1); }
	}
</style>


