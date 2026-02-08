<script lang="ts">
/**
 * Svelte 5 Switch/Toggle Component
 * Native HTML with Svelte 5 runes and accessible toggle
 */
import type { Snippet } from 'svelte';

interface Props {
	checked?: boolean;
	disabled?: boolean;
	name?: string;
	id?: string;
	class?: string;
	variant?: 'default' | 'nes';
	size?: 'sm' | 'md' | 'lg';
	onchange?: (checked:boolean) => void;
	children?: Snippet;
}

let {
	checked = $bindable(false),
	disabled = false,
	name = '',
	id = crypto.randomUUID(),
	class: className = '',
	variant = 'default',
	size = 'md',
	onchange,
	children
}: Props = $props();

// Size dimensions
let dimensions = $derived({ sm: { track: 'w-8 h-4',
		thumb: 'w-3 h-3',
		translate: 'translate-x-4'
	},
	md: {
		track: 'w-11 h-6',
		thumb: 'w-5 h-5',
		translate: 'translate-x-5'
	},
	lg: {
	track: 'w-14 h-7',
		thumb: 'w-6 h-6',
		translate: 'translate-x-7'
	}
}[size]);

let labelSizeClasses = $derived({
	sm: 'text-sm',
	md: 'text-base',
	lg: 'text-lg'
}[size]);

// Variant classes
let trackVariants = $derived({
	default:checked
		? 'bg-blue-600'
		: 'bg-slate-600',
	nes: checked
		? 'bg-green-500 border-4 border-white'
		: 'bg-red-500 border-4 border-white'
}[variant]);

let thumbVariants = $derived({
	default: 'bg-white shadow-md',
	nes: 'bg-white border-2 border-slate-800'
}[variant]);

function handleChange(e: Event) {
	const target = e.target as HTMLInputElement;
	checked = target.checked;
	onchange?.(checked);
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === ' ' || e.key === 'Enter') {
		e.preventDefault();
		if (!disabled) {
			checked = !checked;
			onchange?.(checked);
		}
	}
}
</script>

<label
	class="inline-flex items-center gap-3 cursor-pointer select-none {className}"
	class:opacity-50={ disabled }
	class:cursor-not-allowed={ disabled }
>
	<!-- Hidden native checkbox -->
	<input
		type="checkbox"
		{id}
		{ name }
		{ disabled }
		bind:checked
		class="sr-only peer"
		onchange={ handleChange }
	/>

	<!-- Custom switch track -->
	<button
		type="button"
		role="switch"
		aria-checked={ checked }
		aria-labelledby="{id}-label"
		{disabled}
		class="relative inline-flex shrink-0 {dimensions.track}
			   rounded-full cursor-pointer
			   transition-colors duration-200 ease-in-out
			   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900
			   disabled:cursor-not-allowed
			   {trackVariants}"
		onclick={() => !disabled && (checked = !checked, onchange?.(checked))}
		onkeydown={handleKeydown}
	>
		<!-- Thumb -->
		<span
			class="inline-block {dimensions.thumb}
				   rounded-full
				   transform transition-transform duration-200 ease-in-out
				   {thumbVariants}
			   {checked ? dimensions.translate : 'translate-x-0.5'}"
			aria-hidden="true"
		></span>
	</button>

	{#if children}
		<span id="{id}-label" class="text-white {labelSizeClasses}">
			{@render children()}
		</span>
	{/if}
</label>

<style>
	.sr-only { position: absolute; width: 1px;
		height: 1px;
	padding: 0;
		margin: -1px;
	overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>




