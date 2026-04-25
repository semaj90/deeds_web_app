<script lang="ts">
	import { cn } from "$lib";
	import { DropdownMenu } from "bits-ui";
	let { class: className = "", ...rest }: any = $props();
</script>

<DropdownMenu.Separator
	class={cn("dropdown-sep", className)}
	{...rest}
/>

<style>
	:global(.dropdown-sep) {
		margin: 0.25rem -0.375rem;
		height: 1px;
		background: rgba(212, 199, 163, 0.08);
	}
</style>