<script lang="ts">
	import { cn } from '$lib';
	import { Select } from 'bits-ui';

	let {
		class: className = '',
		children,
		...rest
	} = $props();
</script>

<Select.Content
	class={cn(
		'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-sand/30 bg-panelSoft text-white shadow-md p-1',
		className
	)}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</Select.Content>
