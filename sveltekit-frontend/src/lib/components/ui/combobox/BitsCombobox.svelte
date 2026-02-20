<script lang="ts">
	/**
	 * Svelte 5 Combobox Component
	 * Native HTML with filterable dropdown list and keyboard navigation
	 */
	import type { Snippet } from 'svelte';

	interface ComboboxItem {
		value: string;
		label: string;
		disabled?: boolean;
	}

	interface Props {
		inputValue?: string;
		items?: ComboboxItem[];
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		onSelect?: (value: string) => void;
		children?: Snippet;
	}

	let {
		inputValue = $bindable(''),
		items = [],
		placeholder = 'Search...',
		disabled = false,
		class: className = '',
		onSelect,
		children,
	}: Props = $props();

	let open = $state(false);
	let highlightedIndex = $state(-1);
	let listRef = $state<HTMLUListElement | null>(null);

	let filteredItems = $derived(
		inputValue
			? items.filter((item) =>
					item.label.toLowerCase().includes(inputValue.toLowerCase())
				)
			: items
	);

	function handleInput(e: Event) {
		inputValue = (e.target as HTMLInputElement).value;
		open = true;
		highlightedIndex = 0;
	}

	function selectItem(item: ComboboxItem) {
		if (item.disabled) return;
		inputValue = item.label;
		open = false;
		onSelect?.(item.value);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
			open = true;
			highlightedIndex = 0;
			e.preventDefault();
			return;
		}

		if (!open) return;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				highlightedIndex = Math.min(highlightedIndex + 1, filteredItems.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				highlightedIndex = Math.max(highlightedIndex - 1, 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (highlightedIndex >= 0 && filteredItems[highlightedIndex]) {
					selectItem(filteredItems[highlightedIndex]);
				}
				break;
			case 'Escape':
				open = false;
				break;
		}
	}

	function handleBlur() {
		// Delay to allow click events on items to fire
		setTimeout(() => { open = false; }, 150);
	}

	$effect(() => {
		if (listRef && highlightedIndex >= 0) {
			const el = listRef.children[highlightedIndex] as HTMLElement | undefined;
			el?.scrollIntoView({ block: 'nearest' });
		}
	});
</script>

<div class="relative w-full {className}">
	<div class="relative">
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
			class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sand/40 pointer-events-none"
		>
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.3-4.3" />
		</svg>
		<input
			type="text"
			value={inputValue}
			oninput={handleInput}
			onfocus={() => { open = true; }}
			onblur={handleBlur}
			onkeydown={handleKeydown}
			{placeholder}
			{disabled}
			role="combobox"
			aria-expanded={open}
			aria-controls="combobox-listbox"
			aria-autocomplete="list"
			aria-label={placeholder}
			class="w-full pl-9 pr-4 py-2 bg-panel border border-sand/30 rounded-md text-sm text-white
				placeholder:text-sand/50 focus:outline-none focus:ring-2 focus:ring-info
				focus:ring-offset-2 focus:ring-offset-panel
				disabled:cursor-not-allowed disabled:opacity-50"
		/>
	</div>

	{#if open && filteredItems.length > 0}
		<ul
			bind:this={listRef}
			id="combobox-listbox"
			role="listbox"
			class="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md
				border border-sand/30 bg-panelSoft shadow-lg"
		>
			{#each filteredItems as item, i}
				<li
					role="option"
					aria-selected={i === highlightedIndex}
					aria-disabled={item.disabled}
					class="px-3 py-1.5 text-sm cursor-pointer select-none
						{i === highlightedIndex ? 'bg-accent/20 text-white' : 'text-sand/80 hover:bg-accent/10'}
						{item.disabled ? 'opacity-50 cursor-not-allowed' : ''}"
					onmousedown={() => selectItem(item)}
					onmouseenter={() => { highlightedIndex = i; }}
				>
					{item.label}
				</li>
			{/each}
		</ul>
	{:else if open && inputValue && filteredItems.length === 0}
		<div class="absolute z-50 mt-1 w-full rounded-md border border-sand/30 bg-panelSoft shadow-lg px-3 py-2 text-sm text-sand/50">
			No results found.
		</div>
	{/if}

	{#if children}
		{@render children()}
	{/if}
</div>
