<script lang="ts">
  import { cn } from '$lib/utils/cn';
  interface CardHeaderProps {
    class?: string;
    children?: import('svelte').Snippet;
  }
  let { class: className = '', children }: CardHeaderProps = $props();
</script>

<div class={cn('shadcn-card-header', className)}>
  <slot />
</div>

<style>
  :global(.shadcn-card-header) {
    padding: 1.5rem 1.5rem 0;
  }
</style>
