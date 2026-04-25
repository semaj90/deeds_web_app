<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    class?: string;
    children?: Snippet;
  }

  let {
    class: className,
    children,
    ...rest
  }: Props = $props();
</script>

<h5
  class="font-semibold text-base tracking-tight mb-1 {className ?? ''}"
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</h5>
