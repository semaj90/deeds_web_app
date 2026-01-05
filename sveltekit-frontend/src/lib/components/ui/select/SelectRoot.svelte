<script lang="ts">
	let value = $state<any>(undefined);

	import type { Snippet } from 'svelte';
	import { onMount, setContext } from 'svelte';
	import type { SelectContext, SelectRootProps } from './types';

	interface Props extends SelectRootProps {
		children?: Snippet;
	}

	let {
		value = $bindable(''),
		defaultValue = '',
		onValueChange,
		disabled = false,
		required = false,
		name,
		children,
		class: className = '',
		placeholder = 'Select...',
	}: Props = $props();

	let open = $state(false);

	// Close on outside click
	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('[data-select-root]')) {
			open = false;
		}
	}

	// Close on escape
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
		}
	}

	onMount(() => {
		// Initialize with defaultValue if no value provided
		if (!value && defaultValue) {
			value = defaultValue;
		}
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleKeydown);
		};
	});
  
	setContext<SelectContext>('select', {
		get open() { return open; },
		get value() { return value; },
		get disabled() { return disabled; },
		setValue: (newValue: string) => {
			value = newValue;
			onValueChange?.(newValue);
			open = false;
		},
		setOpen: (isOpen: boolean) => {
			if (!disabled) open = isOpen;
		},
		toggle: () => {
			if (!disabled) open = !open;
		},
		close: () => {
			open = false;
		},
	});
</script>

<div
	class="relative { className }"
	data-select-root
	data-state={open ? 'open' : 'closed'}
	data-disabled={disabled || undefined}
>
	{#if name}
		<input type="hidden" { name } {value} { required } />
	{/if}
	{#if children}
		{@render children()}
	{/if}
</div>
