<script lang="ts">
	let className = $state<any>(undefined);
	let name = $state<any>(undefined);
	let id = $state<any>(undefined);
	let required = $state<any>(undefined);

/**
 * Svelte 5 Select Component
 * Native HTML select with Svelte 5 runes and accessible dropdown
 */
import type { Snippet } from 'svelte';

interface SelectOption {
	value: string;
	label: string;
	disabled?: boolean;
}

interface Props {
	value?: string;
	options?: SelectOption[];
	placeholder?: string;
	disabled?: boolean;
	required?: boolean;
	name?: string;
	id?: string;
	class?: string;
	onchange?: (value: string) => void;
	children?: Snippet;
}

let {
	value = $bindable(''),
	options = [],
	placeholder = 'Select an option...',
	disabled = false,
	required = false,
	name = '',
	id = '',
	class: className = '',
	onchange,
	children
}: Props = $props();

// Reactive state
let isOpen = $state(false);
let focusedIndex = $state(-1);

// Derived
let selectedOption = $derived(options.find(opt => opt.value === value));
let displayValue = $derived(selectedOption?.label ?? placeholder);

// UnoCSS-style classes
const baseClasses = `
	relative w-full
	px-4 py-2
	bg-slate-800 text-white
	border-2 border-slate-600
	rounded-lg
	cursor-pointer
	transition-all duration-150
	hover:border-blue-500
	focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
	disabled:opacity-50 disabled:cursor-not-allowed
`.replace(/\s+/g, ' ').trim();

const dropdownClasses = `
	absolute z-50 w-full mt-1
	bg-slate-800 border-2 border-slate-600
	rounded-lg shadow-xl
	max-h-60 overflow-auto
	py-1
`.replace(/\s+/g, ' ').trim();

const optionClasses = `
	px-4 py-2
	cursor-pointer
	transition-colors duration-100
	hover:bg-blue-600
`.replace(/\s+/g, ' ').trim();

function handleSelect(opt: SelectOption) {
	if (opt.disabled) return;
	value = opt.value;
	isOpen = false;
	onchange?.(opt.value);
}

function handleKeydown(e: KeyboardEvent) {
	if (disabled) return;

	switch (e.key) {
		case 'Enter':
		case ' ':
			e.preventDefault();
			if (isOpen && focusedIndex >= 0) {
				handleSelect(options[focusedIndex]);
			} else {
				isOpen = !isOpen;
			}
			break;
		case 'Escape':
			isOpen = false;
			break;
		case 'ArrowDown':
			e.preventDefault();
			if (!isOpen) {
				isOpen = true;
			} else {
				focusedIndex = Math.min(focusedIndex + 1, options.length - 1);
			}
			break;
		case 'ArrowUp':
			e.preventDefault();
			focusedIndex = Math.max(focusedIndex - 1, 0);
			break;
	}
}

function handleBlur() {
	setTimeout(() => {
		isOpen = false;
	}, 150);
}
</script>

<div class="relative {className}">
	<!-- Native select for form submission (hidden) -->
	<select
		{name}
		{id}
		{required}
		{ disabled }
		class="sr-only"
		bind:value
		aria-hidden="true"
		tabindex="-1"
	>
		<option value="">{ placeholder }</option>
		{#each options as opt}
			<option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
		{/each}
	</select>

	<!-- Custom visible select -->
	<button
		type="button"
		class="{baseClasses}"
		class:ring-2={isOpen}
		class:ring-blue-500={isOpen}
		{ disabled }
		aria-haspopup="listbox"
		aria-expanded={isOpen}
		onclick={() => isOpen = !isOpen}
		onkeydown={handleKeydown}
		onblur={handleBlur}
	>
		<span class="block truncate" class:text-slate-400={!selectedOption}>
			{displayValue}
		</span>
		<span class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
			<svg
				class="w-5 h-5 text-slate-400 transition-transform duration-200"
				class:rotate-180={isOpen}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</span>
	</button>

	<!-- Dropdown options -->
	{#if isOpen}
		<ul
			class={dropdownClasses}
			role="listbox"
			aria-activedescendant={focusedIndex >= 0 ? `option-${focusedIndex}`  | undefined}
		>
			{#each options as opt, i}
				<li
					id="option-{i}"
					class="{optionClasses}"
					class:bg-blue-600={focusedIndex === i}
					class:bg-blue-700={value === opt.value}
					class:opacity-50={opt.disabled}
					class:cursor-not-allowed={opt.disabled}
					role="option"
					aria-selected={value === opt.value}
					aria-disabled={opt.disabled}
					onclick={() => handleSelect(opt)}
					onmouseenter={() => focusedIndex = i}
				>
					<span class="flex items-center gap-2">
						{#if value === opt.value}
							<svg class="w-4 h-4 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
							</svg>
						{:else}
							<span class="w-4"></span>
						{/if}
						{opt.label}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>
