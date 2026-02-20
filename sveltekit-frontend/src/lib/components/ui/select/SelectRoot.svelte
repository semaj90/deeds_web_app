<script lang="ts">
	import { cn } from '$lib';
	import { Select } from 'bits-ui';

	let {
		value = $bindable(''),
		type = 'single',
		disabled = false,
		onValueChange,
		class: className = '',
		children,
		...rest
	} = $props();
</script>

<Select.Root
	bind:value
	{type}
	{disabled}
	{onValueChange}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</Select.Root>
