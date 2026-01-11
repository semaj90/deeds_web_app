<script lang="ts">
  // Simple CardDescription component (shadcn-like) - Svelte, 5
  interface Props {
    className?: string;
    children?: import('svelte').Snippet;
  }
  let { className = '', children }: Props = $props();
</script>

<p class={'text-sm, text-muted-foreground, ' + className}>
  {#if children}
    {@render children()}
  {/if}
</p>


