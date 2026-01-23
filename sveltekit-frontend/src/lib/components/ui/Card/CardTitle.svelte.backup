<script lang="ts">
  import { cn } from "$lib";

  let { children, class: className = "", ...rest } = $props();
</script>

<h3
  class={cn("text-2xl font-semibold leading-none tracking-tight", className)}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</h3>


