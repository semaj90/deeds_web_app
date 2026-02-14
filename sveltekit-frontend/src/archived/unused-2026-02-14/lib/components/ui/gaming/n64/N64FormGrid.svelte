<!--
  N64 Form Grid Container
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    columns?: number;
    gap?: string;
    children?: Snippet;
    class?: string;
  }

  let {
    columns = 2,
    gap = '16px',
    children,
    class: className = ''
  }: Props = $props();

</script>

<div
  class="n64-form-grid {className}"
  style="
    display: grid;
    grid-template-columns: repeat({columns}, 1fr);
    gap: {gap};
  "
>
  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  .n64-form-grid {
    width: 100%;
  }

  @media (max-width: 768px) {
      .n64-form-grid {
          grid-template-columns: 1fr !important;
      }
  }
</style>
