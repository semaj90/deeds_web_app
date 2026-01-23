<script lang="ts">
  import { cn } from "$lib";
  import * as Label from 'bits-ui';

  let {
    children,
    class: className = "",
    ...rest
  } = $props();
</script>

<Label.Root
  class={cn(
    "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled, opacity-70",
    className
  )}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</Label.Root>


