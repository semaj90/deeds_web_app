<script lang="ts">
	import { cn } from "$lib";
	import type { HTMLTextareaAttributes } from "svelte/elements";

	interface Props extends HTMLTextareaAttributes {
		value?: string;
	}

	let {
		placeholder = "",
		value = $bindable(""),
		disabled = false,
		rows = 3,
		class: className = "",
		...rest
	}: Props = $props();
</script>

<textarea
	{placeholder}
	bind:value
	{disabled}
	{rows}
	class={cn(
		"flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	{...rest}
></textarea>
