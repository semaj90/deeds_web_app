<script lang="ts">
  import { cn } from "$lib";

  let { children, class: className = "", ...rest } = $props();
</script>

<div
  class={cn("flex items-center p-6 pt-0", className)}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</div>


