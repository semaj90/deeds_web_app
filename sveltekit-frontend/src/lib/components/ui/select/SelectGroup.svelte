<script lang="ts">
  import { Select as BitsSelect } from "bits-ui";
  import { cn } from "$lib/utils/cn";
  import type { Snippet } from "svelte";

  interface Props {
    children?: Snippet;
    class?: string;
    [key: string]: any;
  }

  let { children, class: className = "", ...rest }: Props = $props();
</script>

<BitsSelect.Group class={cn("p-1", className)} {...rest}>
  {#if children}
    {@render children()}
  {/if}
</BitsSelect.Group>
