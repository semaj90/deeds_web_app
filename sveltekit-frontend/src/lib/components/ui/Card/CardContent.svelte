<script lang="ts">
  import { cn } from "$lib/utils/cn";

  let { children, class: className = "", ...rest } = $props();
</script>

<div
  class={cn("p-6 pt-0", className)}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</div>
