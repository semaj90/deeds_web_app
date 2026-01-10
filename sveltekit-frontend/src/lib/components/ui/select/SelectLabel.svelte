<script lang="ts">
  import { cn } from "$lib";
  import * as Select from "bits-ui";
  import type { Snippet } from "svelte";

  interface Props {
    children?: Snippet;
    class?: string;
    [key: string]: any;
  }

  let { children, class: className = "", ...rest }: Props = $props();
</script>

<Select.Label
  class={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</Select.Label>


