<script lang="ts">
  import { cn } from "$lib";
  import { DropdownMenu } from "bits-ui";
let { children, class: className = "", ...rest } = $props();
</script>

<DropdownMenu.Trigger
  class={cn(
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none, disabled:opacity-50",
    className
  )}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</DropdownMenu.Trigger>


