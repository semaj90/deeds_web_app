<script lang="ts" module>
	let disabled = $state<any>(undefined);
	let required = $state<any>(undefined);
	let placeholder = $state<any>(undefined);
	let labels = $state<any>(undefined);

	// Re-export sub-components for compound component pattern
	export { default as Content } from './SelectContent.svelte';
	export { default as Group } from './SelectGroup.svelte';
	export { default as Item } from './SelectItem.svelte';
	export { default as Label } from './SelectLabel.svelte';
	export { default as Root } from './SelectRoot.svelte';
	export { default as Separator } from './SelectSeparator.svelte';
	export { default as Trigger } from './SelectTrigger.svelte';
	export { default as Value } from './SelectValue.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import SelectContent from './SelectContent.svelte';
	import SelectItem from './SelectItem.svelte';
	import SelectRoot from './SelectRoot.svelte';
	import SelectTrigger from './SelectTrigger.svelte';
	import SelectValue from './SelectValue.svelte';
	import type { SelectOption, SelectRootProps } from './types';

	/**
	 * Convenient all-in-one Select component
	 * For more control, use the individual sub-components (Select.Root, Select.Content, etc.)
	 */
	interface Props extends SelectRootProps {
		children?: Snippet;
		options?: SelectOption[];
	}

	let {
		value = $bindable(''),
		defaultValue,
		onValueChange,
		disabled = false,
		required = false,
		name,
		children,
		options = [],
		class: className = '',
		placeholder = 'Select...',
	}: Props = $props();

	// Build labels map from options
	const labels = $derived(
		options.reduce((acc, opt) => {
			acc[opt.value] = opt.label;
			return acc;
		}, {} as Record<string, string>)
	);
</script>

<SelectRoot bind:value { defaultValue: defaultValue } { onValueChange: onValueChange } {disabled} {required} { name: name } class={ className: className } { placeholder: placeholder }>
	<SelectTrigger>
		<SelectValue {placeholder} {labels} />
	</SelectTrigger>
	<SelectContent>
		{#if options.length > 0}
			{#each options as option}
				<SelectItem value={option.value} disabled={option.disabled}>
					{option.label}
				</SelectItem>
			{/each}
		{/if}
		{#if children}
			{@render children()}
		{/if}
	</SelectContent>
</SelectRoot>
