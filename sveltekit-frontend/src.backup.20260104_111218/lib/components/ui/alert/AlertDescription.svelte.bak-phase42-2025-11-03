<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    class?: string;
    children?: import('svelte').Snippet;
  }
  let { class: className = '', children, ...restProps }: Props = $props();
</script>

<div class="text-sm [&_p]:leading-relaxed {className}" {...restProps}>
  <slot />
</div>
