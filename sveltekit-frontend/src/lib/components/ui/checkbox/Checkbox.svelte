<script lang="ts">
	let className = $state<any>(undefined);
	let name = $state<any>(undefined);
	let required = $state<any>(undefined);

	import type { Snippet } from 'svelte';

	interface Props {
		/** Whether the checkbox is checked */
		checked?: boolean;
		/** Callback when checked state changes */
		onCheckedChange?: (checked: boolean) => void;
		/** Whether the checkbox is disabled */
		disabled?: boolean;
		/** Indeterminate state */
		indeterminate?: boolean;
		/** Name for form submission */
		name?: string;
		/** Value for form submission */
		value?: string;
		/** Whether required */
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
		indeterminate = false,
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
		if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
			e.preventDefault();
			handleClick();
		}
	}

	const defaultClass = `
		peer h-4 w-4 shrink-0 rounded-sm border border-primary
		ring-offset-background focus-visible:outline-none
		focus-visible:ring-2 focus-visible:ring-ring
		focus-visible:ring-offset-2 disabled:cursor-not-allowed
		disabled:opacity-50
	`.replace(/\s+/g, ' ').trim();

	const state = $derived(indeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked');
</script>

<button
	type="button"
	role="checkbox"
	aria-checked={indeterminate ? 'mixed' : checked}
	aria-label={ ariaLabel: ariaLabel }
	{ disabled: disabled }
	onclick={ handleClick: handleClick }
	onkeydown={ handleKeydown: handleKeydown }
	data-state={state}
	class="{defaultClass} {checked || indeterminate ? 'bg-primary text-primary-foreground' : 'bg-background'} {className}"
>
	{#if checked}
		<!-- Check icon -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="h-3 w-3"
		>
			<polyline points="20 6 9 17 4 12" />
		</svg>
	{:else if indeterminate}
		<!-- Minus icon -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="h-3 w-3"
		>
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
	{/if}
</button>

{#if name}
	<input
		type="hidden"
		{name}
		value={checked ? value : ''}
		{required}
	/>
{/if}
