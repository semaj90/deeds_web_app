<script lang="ts">
  interface Props {
    className?: string;
    children?: import('svelte').Snippet;
    [key: string]: any
  }

  let { className = '', children, ...rest }: Props = $props();
</script>

<h3 {...rest} class={`ui-card-title ${className}`}>
  {@render children?.()}
</h3>

<style>
  .ui-card-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }
</style>
