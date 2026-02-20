<script lang="ts">
	import { cn } from '$lib';
	import { Select } from 'bits-ui';

	let {
		value,
		label,
		disabled = false,
		class: className = '',
		children,
		...rest
	} = $props();
</script>

<Select.Item
	{value}
	{label}
	{disabled}
	class={cn(
		'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent/20 focus:bg-accent/20 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent/20',
		className
	)}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</Select.Item>
