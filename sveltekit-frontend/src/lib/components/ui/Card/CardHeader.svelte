<script lang="ts">
  import { cn } from "$lib";

  let { children, class: className = "", ...rest } = $props();
</script>

<div
  class={cn("flex flex-col space-y-1.5 p-6", className)}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</div>


