<script lang="ts">
	import { cn } from "$lib";
	import { DropdownMenu } from "bits-ui";
	let { children, class: className = "", sideOffset = 4, ...rest }: any = $props();
</script>

<DropdownMenu.Content
	{sideOffset}
	class={cn("dropdown-content", className)}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</DropdownMenu.Content>

<style>
	:global(.dropdown-content) {
		z-index: 50;
		min-width: 10rem;
		overflow: hidden;
		padding: 0.375rem;
		border-radius: 0.875rem;
		background: rgba(22, 21, 18, 0.97);
		border: 1px solid rgba(212, 199, 163, 0.1);
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.25),
			0 12px 32px -4px rgba(0, 0, 0, 0.55),
			0 0 48px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(212, 199, 163, 0.04);
		backdrop-filter: blur(16px) saturate(1.2);
		color: rgba(212, 199, 163, 0.85);
	}
</style>