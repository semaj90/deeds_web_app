<script lang="ts">
  import { cn } from "$lib";
  import * as DropdownMenu from "bits-ui/components/dropdown-menu";
let { children, class: className = "", inset, ...rest } = $props();
</script>

<DropdownMenu.Item
  class={cn(
    "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent, focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    inset && "pl-8",
    className
  )}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</DropdownMenu.Item>


