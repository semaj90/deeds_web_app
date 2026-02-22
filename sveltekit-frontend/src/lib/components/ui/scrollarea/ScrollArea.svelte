<script lang="ts">
  import { ScrollArea as BitsScrollArea } from "bits-ui";
  import type { Snippet } from "svelte";

  interface Props {
    class?: string;
    viewportClass?: string;
    orientation?: "vertical" | "horizontal" | "both";
    type?: "hover" | "scroll" | "auto" | "always";
    scrollHideDelay?: number;
    children?: Snippet;
  }

  let {
    class: className = "",
    viewportClass = "",
    orientation = "vertical",
    type = "hover",
    scrollHideDelay = 600,
    children,
  }: Props = $props();
</script>

<BitsScrollArea.Root class="relative overflow-hidden {className}" {type} {scrollHideDelay}>
  <BitsScrollArea.Viewport class="h-full w-full rounded-[inherit] {viewportClass}">
    {#if children}
      {@render children()}
    {/if}
  </BitsScrollArea.Viewport>

  {#if orientation === "vertical" || orientation === "both"}
    <BitsScrollArea.Scrollbar
      orientation="vertical"
      class="flex touch-none select-none p-px transition-colors duration-150 ease-out data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5"
    >
      <BitsScrollArea.Thumb
        class="relative flex-1 rounded-full bg-sand/30 hover:bg-sand/50 transition-colors"
      />
    </BitsScrollArea.Scrollbar>
  {/if}

  {#if orientation === "horizontal" || orientation === "both"}
    <BitsScrollArea.Scrollbar
      orientation="horizontal"
      class="flex touch-none select-none p-px transition-colors duration-150 ease-out data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col"
    >
      <BitsScrollArea.Thumb
        class="relative flex-1 rounded-full bg-sand/30 hover:bg-sand/50 transition-colors"
      />
    </BitsScrollArea.Scrollbar>
  {/if}

  <BitsScrollArea.Corner />
</BitsScrollArea.Root>
