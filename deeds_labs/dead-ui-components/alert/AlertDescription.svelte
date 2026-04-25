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

<div
  class="text-sm opacity-90 leading-relaxed {className ?? ''}"
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</div>
