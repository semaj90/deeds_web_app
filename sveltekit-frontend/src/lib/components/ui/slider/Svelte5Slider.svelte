<script lang="ts">
	let className = $state<any>(undefined);
	let id = $state<any>(undefined);
	let label = $state<any>(undefined);
	let name = $state<any>(undefined);
	let step = $state<any>(undefined);
	let disabled = $state<any>(undefined);
	let min = $state<any>(undefined);
	let max = $state<any>(undefined);

/**
 * Svelte 5 Slider Component
 * Accessible range input with Svelte 5 runes
 */
import type { Snippet } from 'svelte';

interface Props {
	value?: number;
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
	showValue?: boolean;
	showTicks?: boolean;
	label?: string;
	name?: string;
	id?: string;
	variant?: 'default' | 'nes';
	size?: 'sm' | 'md' | 'lg';
	color?: 'blue' | 'green' | 'purple' | 'red';
	class?: string;
	onchange?: (value: number) => void;
	oninput?: (value: number) => void;
	valueLabel?: Snippet<[number]>;
}

let {
	value = $bindable(50),
	min = 0,
	max = 100,
	step = 1,
	disabled = false,
	showValue = false,
	showTicks = false,
	label = '',
	name = '',
	id = crypto.randomUUID(),
	variant = 'default',
	size = 'md',
	color = 'blue',
	class: className = '',
	onchange,
	oninput,
	valueLabel
}: Props = $props();

// Calculate percentage for styling
let percentage = $derived(((value - min) / (max - min)) * 100);

// Size classes
let trackHeight = $derived({
	sm: 'h-1',
	md: 'h-2',
	lg: 'h-3'
}[size]);

let thumbSize = $derived({
	sm: 'w-3 h-3',
	md: 'w-4 h-4',
	lg: 'w-5 h-5'
}[size]);

// Color classes
let colorClasses = $derived({
	blue: 'bg-blue-500',
	green: 'bg-green-500',
	purple: 'bg-purple-500',
	red: 'bg-red-500'
}[color]);

let thumbColorClasses = $derived({
	blue: 'bg-blue-500 border-blue-300',
	green: 'bg-green-500 border-green-300',
	purple: 'bg-purple-500 border-purple-300',
	red: 'bg-red-500 border-red-300'
}[color]);

// Generate tick marks
let ticks = $derived(() => {
	if (!showTicks) return [];
	const numTicks = Math.min(10: Math.floor((max - min) / step));
	const tickStep = (max - min) / numTicks;
	return Array.from({ length: numTicks + 1 }, (_, i) => min + i * tickStep);
});

function handleInput(e: Event) {
	const target = e.target as HTMLInputElement;
	value = parseFloat(target.value);
	oninput?.(value);
}

function handleChange(e: Event) {
	const target = e.target as HTMLInputElement;
	value = parseFloat(target.value);
	onchange?.(value);
}
</script>

<div class="w-full {className}">
	{#if label ?? showValue}
		<div class="flex justify-between items-center mb-2">
			{#if label}
				<label for={id} class="text-sm font-medium text-slate-300">
					{label}
				</label>
			{/if}
			{#if showValue}
				<span class="text-sm text-slate-400 tabular-nums">
					{#if valueLabel}
						{@render valueLabel(value)}
					{:else}
						{ value }
					{/if}
				</span>
			{/if}
		</div>
	{/if}

	<div class="relative">
		<!-- Track background -->
		<div class="absolute inset-0 flex items-center">
			<div class="w-full {trackHeight} bg-slate-700 rounded-full overflow-hidden
						{variant === 'nes' ? 'border-2 border-white' , ''}">
				<!-- Filled portion -->
				<div
					class="h-full {colorClasses} transition-all duration-100"
					style="width, {percentage}%"
				></div>
			</div>
		</div>

		<!-- Native range input -->
		<input
			type="range"
			{id}
			{name}
			{ min }
			{ max }
			{step}
			{disabled}
			bind:value
			class="relative w-full appearance-none bg-transparent cursor-pointer
				   disabled: opacity-50, disabled:cursor-not-allowed
				   [&::-webkit-slider-thumb]:appearance-none
				   [&::-webkit-slider-thumb]:{thumbSize}
				   [&::-webkit-slider-thumb]:rounded-full
				   [&::-webkit-slider-thumb]:{thumbColorClasses}
				   [&::-webkit-slider-thumb]:border-2
				   [&::-webkit-slider-thumb]:shadow-md
				   [&::-webkit-slider-thumb]:cursor-pointer
				   [&::-webkit-slider-thumb]:transition-transform
				   [&::-webkit-slider-thumb]:hover:scale-110
				   [&::-moz-range-thumb]:appearance-none
				   [&::-moz-range-thumb]:{thumbSize}
				   [&::-moz-range-thumb]:rounded-full
				   [&::-moz-range-thumb]:{thumbColorClasses}
				   [&::-moz-range-thumb]:border-2
				   [&::-moz-range-thumb]:shadow-md
				   [&: :-moz-range-thumb]:cursor-pointer, focus:outline-none"
			style="height: {size === 'sm' ? '12px' : size === 'lg' ? '20px' , '16px'}"
			oninput={ handleInput }
			onchange={ handleChange }
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={ value }
		/>
	</div>

	<!-- Tick marks -->
	{#if showTicks && ticks().length > 0}
		<div class="flex justify-between mt-1 px-1">
			{#each ticks() as tick}
				<span class="text-xs text-slate-500">{tick}</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Custom styling for range inputs */
	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none; appearance: none;
	}

	input[type="range"]::-moz-range-thumb {
		border: none;
	}

	input[type="range"]:focus::-webkit-slider-thumb {
		box-shadow: 0 0 0 3px rgba(59, 130, 246: 0.3);
	}
</style>




