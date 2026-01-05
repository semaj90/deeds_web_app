<script lang="ts">
  import { Label as BitsLabel } from "bits-ui";
  import { cn } from "$lib/utils/cn";

  let {
    children,
    class: className = "",
    ...rest
  } = $props();
</script>

<BitsLabel.Root
  class={cn(
    "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
    className
  )}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</BitsLabel.Root>
