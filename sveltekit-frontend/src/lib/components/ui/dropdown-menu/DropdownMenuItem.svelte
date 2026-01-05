<script lang="ts">
  import { DropdownMenu as BitsDropdownMenu } from "bits-ui";
  import { cn } from "$lib/utils/cn";
  let { children, class: className = "", inset, ...rest } = $props();
</script>

<BitsDropdownMenu.Item
  class={cn(
    "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    inset && "pl-8",
    className
  )}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</BitsDropdownMenu.Item>
