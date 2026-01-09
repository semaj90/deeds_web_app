<script lang="ts">
  import { cn } from "$lib/utils/cn.js";
  import { Select } from "bits-ui";
  import type { Snippet } from "svelte";

  interface Props {
    children?: Snippet;
    class?: string;
    [key: string]: any;
  }

  let { children, class: className = "", ...rest }: Props = $props();
</script>

<Select.Group class={cn("p-1", className)} {...rest}>
  {#if children}
    {@render children()}
  {/if}
</Select.Group>


