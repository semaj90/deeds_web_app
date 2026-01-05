<script lang="ts">
  import { DropdownMenu as BitsDropdownMenu } from "bits-ui";
  import { cn } from "$lib/utils/cn";
  let { children, class: className = "", ...rest } = $props();
</script>

<BitsDropdownMenu.Trigger
  class={cn(
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    className
  )}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</BitsDropdownMenu.Trigger>
