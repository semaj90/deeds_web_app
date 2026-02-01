<script lang="ts">
  import { cn } from "$lib";
  import * as Select from "bits-ui";
  import type { Snippet } from "svelte";
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';

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




