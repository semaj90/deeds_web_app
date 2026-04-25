<script lang="ts" module>

	// Re-export individual components for compound pattern
	export { default as CommandEmpty } from './CommandEmpty.svelte';
	export { default as CommandGroup } from './CommandGroup.svelte';
	export { default as CommandInput } from './CommandInput.svelte';
	export { default as CommandItem } from './CommandItem.svelte';
	export { default as CommandList } from './CommandList.svelte';
	export { default as CommandRoot } from './CommandRoot.svelte';
	export { default as CommandSeparator } from './CommandSeparator.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import CommandInput from './CommandInput.svelte';
	import CommandList from './CommandList.svelte';
	import CommandRoot from './CommandRoot.svelte';

	interface Props {
		value?: string;
		onValueChange?: (value: string) => void;
		placeholder?: string;
		class?: string;
		children?: Snippet;
	}

	let {
		value = $bindable(''),
		onValueChange,
		placeholder = 'Type a command or search...',
		class: className = '',
		children,
	}: Props = $props();
</script>

<CommandRoot bind:value { onValueChange } class={ className }>
	<CommandInput {placeholder} />
	<CommandList>
		{#if children}
			{@render children()}
		{/if}
	</CommandList>
</CommandRoot>


