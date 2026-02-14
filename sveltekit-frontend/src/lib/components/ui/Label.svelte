<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLLabelAttributes } from 'svelte/elements';

  interface Props extends HTMLLabelAttributes {
    children?: Snippet;
  }
  let { children, ...restProps }: Props = $props();
</script>

<label {...restProps} class="text-sm font-medium text-sand/80">
  {@render children?.()}
</label>


