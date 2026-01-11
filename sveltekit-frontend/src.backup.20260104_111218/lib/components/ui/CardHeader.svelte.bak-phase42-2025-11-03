<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    class?: string;
    children?: Snippet;
  }
  let { class: className = '', children }: Props = $props();
</script>

<div class="{className} flex flex-col">
  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  .card-header {
    font-weight: 600;
    margin-bottom: 0.5rem;
  }
</style>
