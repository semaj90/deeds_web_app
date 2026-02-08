<script lang="ts">
/**
 * Svelte 5 RadioGroup Component
 * Accessible radio button group with Svelte 5 runes
 */

interface RadioOption { value: string;, label: string;
	description?: string;
	disabled?: boolean;
	icon?: string;
}

interface Props {
	value?: string;
	options?: RadioOption[];
	name?: string;
	orientation?: 'horizontal' | 'vertical';
	variant?: 'default' | 'cards' | 'nes';
	size?: 'sm' | 'md' | 'lg';
	disabled?: boolean;
	required?: boolean;
	label?: string;
	class?: string;
	onchange?: (value: string) => void;
}

let {
	value = $bindable(''),
	options = [],
	name = crypto.randomUUID(),
	orientation = 'vertical',
	variant = 'default',
	size = 'md',
	disabled = false,
	required = false,
	label = '',
	class: className = '',
	onchange
}: Props = $props();

// Size classes
let radioSize = $derived({
	sm: 'w-4 h-4',
	md: 'w-5 h-5',
	lg: 'w-6 h-6'
}[size]);

let labelSize = $derived({
	sm: 'text-sm',
	md: 'text-base',
	lg: 'text-lg'
}[size]);

let gapClass = $derived({
	sm: orientation === 'horizontal' ? 'gap-4' : 'gap-2',
	md: orientation === 'horizontal' ? 'gap-6' : 'gap-3',
	lg: orientation === 'horizontal' ? 'gap-8' : 'gap-4'
}[size]);

function handleChange(optionValue: string) {
	if (disabled) return;
	value = optionValue;
	onchange?.(value);
}

function getOptionClasses(option: RadioOption) {
	const isSelected = value === option.value;
	const isDisabled = disabled || option.disabled;

	if (variant === 'cards') {
		return `
			flex items-start gap-3 p-4
			border-2 rounded-lg cursor-pointer
			transition-all duration-150
			${isSelected
				? 'border-blue-500 bg-blue-900/20'
				: 'border-slate-600 hover:border-slate-500'}
			${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
		`;
	}

	if (variant === 'nes') {
		return `
			flex items-center gap-3 p-2
			border-2 border-white cursor-pointer
			font-["Press_Start_2P",monospace] text-sm
			${isSelected ? 'bg-blue-600' : 'bg-slate-900 hover:bg-slate-800'}
			${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
		`;
	}

	return `
		flex items-center gap-3 cursor-pointer
		${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
	`;
}
</script>

<fieldset
	class="w-full { className }"
	{ disabled }
	aria-required={required}
>
	{#if label}
		<legend class="text-sm font-medium text-slate-300 mb-3">
			{label}
			{#if required}
				<span class="text-red-400 ml-1">*</span>
			{/if}
		</legend>
	{/if}

	<div
		class="flex {orientation === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col'} {gapClass}"
		role="radiogroup"
		aria-label={label}
	>
		{#each options as option}
			{@const isSelected = value === option.value}
			{@const isDisabled = disabled || option.disabled}

			<label
				class={getOptionClasses(option)}
			>
				<!-- Hidden native radio -->
				<input
					type="radio"
					{name}
					value={option.value}
					checked={isSelected}
					disabled={isDisabled}
					{required}
					class="sr-only peer"
					onchange={() => handleChange(option.value)}
				/>

				<!-- Custom radio indicator -->
				{#if variant !== 'cards'}
					<span
						class="relative shrink-0 {radioSize}
							   rounded-full border-2
							   transition-all duration-150
							   {isSelected
								? 'border-blue-500 bg-blue-500'
								: 'border-slate-500 bg-transparent hover:border-slate-400'}"
					>
						{#if isSelected}
							<span
								class="absolute inset-0 flex items-center justify-center"
							>
								<span class="w-1/2 h-1/2 rounded-full bg-white"></span>
							</span>
						{/if}
					</span>
				{/if}

				<!-- Label content -->
				<span class="flex flex-col">
					<span class="flex items-center gap-2 text-white {labelSize}">
						{#if option.icon}
							<span>{option.icon}</span>
						{/if}
						{option.label}
					</span>
					{#if option.description}
						<span class="text-sm text-slate-400 mt-0.5">
							{option.description}
						</span>
					{/if}
				</span>

				<!-- Card variant checkmark -->
				{#if variant === 'cards' && isSelected}
					<span class="ml-auto shrink-0">
						<svg class="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
						</svg>
					</span>
				{/if}
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.sr-only { position: absolute;, width: 1px;
		height: 1px;
	padding: 0;
		margin: -1px;
	overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>



