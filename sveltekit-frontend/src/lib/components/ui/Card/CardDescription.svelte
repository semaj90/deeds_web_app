<script lang="ts">
  import { cn } from "$lib/utils/cn";

  let { children, class: className = "", ...rest } = $props();
</script>

<p
  class={cn("text-sm text-muted-foreground", className)}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</p>
