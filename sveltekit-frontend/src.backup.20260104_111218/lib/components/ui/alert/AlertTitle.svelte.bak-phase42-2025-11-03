<script lang="ts">
  interface Props {
    class?: string;
    children?: import('svelte').Snippet;
  }
  let { children, class: className = '', ...restProps }: Props = $props();
</script>

<h5 class="mb-1 font-medium leading-none" {...restProps}>
  <slot />
</h5>
