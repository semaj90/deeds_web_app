<script lang="ts">
  interface Props {
    className?: string;
    children?: import('svelte').Snippet;
    [key: string]: any
  }

  let { className = '', children, ...rest }: Props = $props();
</script>

<article {...rest} class={`ui-card ${className}`}>
  {@render children?.()}
</article>

<style>
  .ui-card {
    background: var(--card-bg, #0b1220);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 8px;
    padding: 0;
  }
</style>
