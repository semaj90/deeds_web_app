<script lang="ts" module>
	export { default as Content } from './SelectContent.svelte';
	export { default as Item } from './SelectItem.svelte';
	export { default as Root } from './SelectRoot.svelte';
	export { default as Trigger } from './SelectTrigger.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import SelectRoot from './SelectRoot.svelte';
	import SelectTrigger from './SelectTrigger.svelte';
	import SelectContent from './SelectContent.svelte';

	/**
	 * Convenient all-in-one Select component.
	 * For more control, use the individual sub-components.
	 */
	interface Props {
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		contentClass?: string;
		onValueChange?: (value: string) => void;
		children?: Snippet;
	}

	let {
		value = $bindable(''),
		placeholder = 'Select...',
		disabled = false,
		class: className = '',
		contentClass = '',
		onValueChange,
		children,
	}: Props = $props();
</script>

<SelectRoot bind:value {disabled} {onValueChange} class={className}>
	<SelectTrigger {disabled}>
		{value || placeholder}
	</SelectTrigger>
	<SelectContent class={contentClass}>
		{#if children}
			{@render children()}
		{/if}
	</SelectContent>
</SelectRoot>
