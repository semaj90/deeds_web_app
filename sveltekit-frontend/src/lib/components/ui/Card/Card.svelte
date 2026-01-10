<script lang="ts">
  import { cn } from "$lib";

  let { children, class: className = "", ...rest } = $props();
</script>

<div
  class={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</div>
