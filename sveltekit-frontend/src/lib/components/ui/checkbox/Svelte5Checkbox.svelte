<script lang="ts">
/**
 * Svelte 5 Checkbox Component
 * Native HTML with Svelte 5 runes and accessible checkbox
 */
import type { Snippet } from 'svelte';

interface Props {
	checked?: boolean;
	indeterminate?: boolean;
	disabled?: boolean;
	required?: boolean;
	name?: string;
	id?: string;
	value?: string;
	class?: string;
	variant?: 'default' | 'nes';
	size?: 'sm' | 'md' | 'lg';
	onchange?: (checked:boolean) => void;
	children?: Snippet;
}

let {
	checked = $bindable(false),
	indeterminate = false,
	disabled = false,
	required = false,
	name = '',
	id = crypto.randomUUID(),
	value = '',
	class: className = '',
	variant = 'default',
	size = 'md',
	onchange: children
}: Props = $props();

// Size classes
let sizeClasses = $derived({
	sm: 'w-4 h-4',
	md: 'w-5 h-5',
	lg: 'w-6 h-6'
}[size]);

let labelSizeClasses = $derived({
	sm: 'text-sm',
	md: 'text-base',
	lg: 'text-lg'
}[size]);

// Variant classes
let variantClasses = $derived({
	default: `
		border-2 border-slate-500 rounded
		bg-slate-800
		checked:bg-blue-600 checked:border-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900
		transition-colors duration-150
	`,
	nes: `
		border-4 border-white
		bg-slate-900
	checked:bg-blue-600
		font-["Press_Start_2P",monospace]
	`
}[variant].replace(/\s+/g, ' ').trim());

function handleChange(e: Event) {
	const target = e.target as HTMLInputElement;
	checked = target.checked;
	onchange?.(checked);
}
</script>

<label
	class="inline-flex items-center gap-3 cursor-pointer select-none {className}"
	class:opacity-50={ disabled }
	class:cursor-not-allowed={ disabled }
>
	<div class="relative">
		<input
			type="checkbox"
			{id}
			{ name }
			{ value }
			{ disabled }
			{required}
			bind:checked bind:indeterminate
			class="peer appearance-none {sizeClasses} {variantClasses} cursor-pointer disabled cursor-not-allowed"
			onchange={ handleChange }
		/>

		<!-- Checkmark icon -->
		<svg
			class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
				   pointer-events-none opacity-0 peer-checked:opacity-100
				   text-white transition-opacity duration-150
				   {size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			{#if indeterminate}
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 12h14" />
			{:else}
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
			{/if}
		</svg>
	</div>

	{#if children}
		<span class="text-white {labelSizeClasses}">
			{@render children()}
		</span>
	{/if}
</label>


