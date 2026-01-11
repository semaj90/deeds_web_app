<script lang="ts">
	import { getContext } from 'svelte';
	import type { SelectContext, SelectValueProps } from './types';

	interface Props extends SelectValueProps {
		/** Mapping of values to display labels */
		labels?: Record<string, string>;
	}

	let {
		placeholder = 'Select...',
		labels = {},
		class: className = '',
	}: Props = $props();

	const selectContext = getContext<SelectContext>('select');

	const displayValue = $derived(
		selectContext?.value
			? (labels[selectContext.value] ?? selectContext.value)
			: placeholder
	);

	const isPlaceholder = $derived(!selectContext?.value);
</script>

<span class="{isPlaceholder ? 'text-muted-foreground' : ''} {className}">
	{displayValue}
</span>
