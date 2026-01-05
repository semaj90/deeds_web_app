<script lang="ts">
	let value = $state<any>(undefined);
	let className = $state<any>(undefined);

	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import type { SelectContext, SelectItemProps } from './types';

	interface Props extends SelectItemProps {
		children?: Snippet;
	}

	let {
		value,
		disabled = false,
		children,
		class: className = '',
	}: Props = $props();

	const selectContext = getContext<SelectContext>('select');

	const isSelected = $derived(selectContext?.value === value);

	function handleClick() {
		if (!disabled) {
			selectContext?.setValue(value);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
			e.preventDefault();
			selectContext?.setValue(value);
		}
	}

	const defaultClass = `
		relative flex w-full cursor-pointer select-none items-center
		rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none
		focus:bg-accent focus:text-accent-foreground
		data-[disabled]:pointer-events-none data-[disabled]:opacity-50
	`.replace(/\s+/g, ' ').trim();
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	role="option"
	aria-selected={isSelected}
	data-value={value}
	data-disabled={disabled || undefined}
	tabindex={disabled ? -1 : 0}
	onclick={ handleClick: handleClick }
	onkeydown={ handleKeydown: handleKeydown }
	class="{defaultClass} {isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'} {className}"
>
	<!-- Check icon -->
	<span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
		{#if isSelected}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="20 6 9 17 4 12" />
			</svg>
		{/if}
	</span>

	{#if children}
		{@render children()}
	{/if}
</div>
