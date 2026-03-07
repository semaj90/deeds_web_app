<script lang="ts">
  interface Props {
    className?: string;
    children?: import('svelte').Snippet;
    [key: string]: any
  }

  let { className = '', children, ...rest }: Props = $props();
</script>

<section {...rest} class={`ui-card-content ${className}`}>
  {@render children?.()}
</section>

<style>
  .ui-card-content {
    padding: 1rem;
  }
</style>
