<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";

	// Svelte 5 props
	interface Props {
		class?: string;
		htmlFor?: string;
		children?: Snippet;
		[key: string]: any;
	}

	let { class: className, htmlFor, children, ...restProps }: Props = $props();
</script>

<label
	for={htmlFor}
	class={cn(
		"text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</label>


