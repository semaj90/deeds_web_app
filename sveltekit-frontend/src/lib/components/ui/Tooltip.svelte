<script lang="ts">
  import { cn } from "$lib";
  import * as Tooltip from "bits-ui";
  import { fade } from "svelte/transition";
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';

  let {
    children,
    content,
    delayDuration = 500,
    class: className = "",
    side = "top",
    ...rest
  } = $props();
</script>

<Tooltip.Root {delayDuration} {...rest}>
  <Tooltip.Trigger class={className}>
    {#if children}
      {@render children()}
    {/if}
  </Tooltip.Trigger>
  <Tooltip.Content
    {side}
    class={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
    )}
  >
    <div transition:fade={{ duration: 150 }}>
      {content}
    </div>
    <Tooltip.Arrow class="fill-popover" />
  </Tooltip.Content>
</Tooltip.Root>




