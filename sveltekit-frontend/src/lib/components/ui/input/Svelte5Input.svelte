<script lang="ts">
/**
 * Svelte 5 Input Component
 * Native HTML with Svelte 5 runes and accessible input
 */
import type { Snippet } from 'svelte';

type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | 'date' | 'time' | 'datetime-local';

interface Props {
	value?: string;
	type?: InputType;
	placeholder?: string;
	disabled?: boolean;
	readonly?: boolean;
	required?: boolean;
	name?: string;
	id?: string;
	autocomplete?: HTMLInputElement['autocomplete'];
	min?: string | number;
	max?: string | number;
	step?: string | number;
	pattern?: string;
	maxlength?: number;
	minlength?: number;
	class?: string;
	variant?: 'default' | 'nes' | 'ghost';
	size?: 'sm' | 'md' | 'lg';
	error?: string;
	label?: string;
	oninput?: (value: string) => void;
	onchange?: (value: string) => void;
	onfocus?: () => void;
	onblur?: () => void;
	prefix?: Snippet;
	suffix?: Snippet;
}

let {
	value = $bindable(''),
	type = 'text',
	placeholder = '',
	disabled = false,
	readonly = false,
	required = false,
	name = '',
	id = crypto.randomUUID(),
	autocomplete = '',
	min,
	max,
	step,
	pattern,
	maxlength,
	minlength,
	class: className = '',
	variant = 'default',
	size = 'md',
	error = '',
	label = '',
	oninput,
	onchange,
	onfocus,
	onblur,
	prefix,
	suffix,
}: Props = $props();

let isFocused = $state(false);

let sizeClasses = $derived({
	sm: 'h-8 text-sm px-2',
	md: 'h-10 text-base px-3',
	lg: 'h-12 text-lg px-4'
}[size]);

let variantClasses = $derived({
	default: 'bg-panelSoft text-white border-2 border-sand/30 hover:border-sand/30 focus:border-info focus:ring-2 focus:ring-info/20 placeholder:text-sand/40',
	nes: 'bg-panel text-white border-4 border-white font-mono placeholder:text-sand/60',
	ghost: 'bg-transparent text-white border-b-2 border-sand/30 hover:border-sand/30 focus:border-info placeholder:text-sand/40 rounded-none'
}[variant]);

let errorClasses = $derived(
	error ? 'border-danger focus:border-danger focus:ring-danger/20' : ''
);

function handleInput(e: Event) {
	const target = e.target as HTMLInputElement;
	value = target.value;
	oninput?.(value);
}

function handleChange(e: Event) {
	const target = e.target as HTMLInputElement;
	value = target.value;
	onchange?.(value);
}

function handleFocus() {
	isFocused = true;
	onfocus?.();
}

function handleBlur() {
	isFocused = false;
	onblur?.();
}
</script>

<div class="w-full {className}">
	{#if label}
		<label for={id} class="block text-sm font-medium text-sand/40 mb-1.5">
			{label}
			{#if required}
				<span class="text-danger/80 ml-1">*</span>
			{/if}
		</label>
	{/if}

	<div class="relative flex items-center">
		{#if prefix}
			<div class="absolute left-3 text-sand/40">
				{@render prefix()}
			</div>
		{/if}

		<input
			{type}
			{id}
			{name}
			{placeholder}
			{disabled}
			{readonly}
			{required}
			{autocomplete}
			{min}
			{max}
			{step}
			{pattern}
			{maxlength}
			{minlength}
			bind:value
			class="w-full rounded-lg outline-none transition-all duration-150
				   {sizeClasses} {variantClasses} {errorClasses}
				   disabled:opacity-50 disabled:cursor-not-allowed
				   {prefix ? 'pl-10' : ''}
				   {suffix ? 'pr-10' : ''}"
			oninput={handleInput}
			onchange={handleChange}
			onfocus={handleFocus}
			onblur={handleBlur}
			aria-invalid={!!error}
			aria-describedby={error ? `${id}-error` : undefined}
		/>

		{#if suffix}
			<div class="absolute right-3 text-sand/40">
				{@render suffix()}
			</div>
		{/if}
	</div>

	{#if error}
		<p id="{id}-error" class="mt-1.5 text-sm text-danger/80">
			{error}
		</p>
	{/if}
</div>
