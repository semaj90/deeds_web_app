<script lang="ts">
  interface Props {
    className?: string;
    children?: import('svelte').Snippet;
    [key: string]: any
  }

  let { className = '', children, ...rest }: Props = $props();
</script>

<header {...rest} class={`ui-card-header ${className}`}>
  {@render children?.()}
</header>

<style>
  .ui-card-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }
</style>
