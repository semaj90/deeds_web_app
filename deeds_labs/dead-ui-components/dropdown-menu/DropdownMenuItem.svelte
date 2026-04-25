<script lang="ts">
	import { cn } from "$lib";
	import { DropdownMenu } from "bits-ui";
	let { children, class: className = "", inset, ...rest }: any = $props();
</script>

<DropdownMenu.Item
	class={cn("dropdown-item", inset && "pl-8", className)}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</DropdownMenu.Item>

<style>
	:global(.dropdown-item) {
		position: relative;
		display: flex;
		cursor: default;
		user-select: none;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
		font-size: 0.8125rem;
		border-radius: 0.5rem;
		outline: none;
		transition: all 0.1s ease;
		color: rgba(212, 199, 163, 0.75);
	}
	:global(.dropdown-item:hover),
	:global(.dropdown-item[data-highlighted]) {
		background: rgba(212, 199, 163, 0.08);
		color: rgba(212, 199, 163, 0.95);
	}
	:global(.dropdown-item[data-disabled]) {
		pointer-events: none;
		opacity: 0.4;
	}
</style>