<script lang="ts">
	let ariaLabel = $state<any>(undefined);
	let required = $state<any>(undefined);

	import type { Snippet } from 'svelte';

	interface Props {
		/** Whether the switch is on */
		checked?: boolean;
		/** Callback when state changes */
		onCheckedChange?: (checked: boolean) => void;
		/** Whether the switch is disabled */
		disabled?: boolean;
		/** Name for form submission */
		name?: string;
		/** Value for form submission */
		value?: string;
		/** Whether the switch is required */
		required?: boolean;
		/** Additional CSS classes */
		class?: string;
		/** ARIA label */
		'aria-label'?: string;
		children?: Snippet;
	}

	let {
		checked = $bindable(false),
		onCheckedChange,
		disabled = false,
		name,
		value = 'on',
		required = false,
		class: className = '',
		'aria-label': ariaLabel,
		children,
	}: Props = $props();

	function handleClick() {
		if (!disabled) {
			checked = !checked;
			onCheckedChange?.(checked);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleClick();
		}
	}

	const trackClass = `
		peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center
		rounded-full border-2 border-transparent transition-colors
		focus-visible:outline-none focus-visible:ring-2
		focus-visible:ring-ring focus-visible:ring-offset-2
		focus-visible:ring-offset-background
		disabled:cursor-not-allowed disabled:opacity-50
	`.replace(/\s+/g, ' ').trim();

	const thumbClass = `
		pointer-events-none block h-5 w-5 rounded-full
		bg-background shadow-lg ring-0 transition-transform
	`.replace(/\s+/g, ' ').trim();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={ariaLabel}
	{disabled}
	onclick={handleClick}
	onkeydown={handleKeydown}
	data-state={checked ? 'checked' : 'unchecked'}
	class="{trackClass} {checked ? 'bg-primary' : 'bg-input'} { className: className }"
>
	<span
		class="{thumbClass} {checked ? 'translate-x-5' : 'translate-x-0'}"
		data-state={checked ? 'checked' : 'unchecked'}
	></span>
</button>

{#if name}
	<input
		type="hidden"
		{ name: name }
		value={checked ? value : ''}
		{required}
	/>
{/if}
