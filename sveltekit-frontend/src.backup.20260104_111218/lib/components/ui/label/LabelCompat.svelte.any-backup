<script lang="ts">
  import Label from '$lib/components/ui/Label.svelte';

  import type { HTMLAttributes } from 'svelte/elements';
  // Svelte, 5 props pattern - Accept legacy props and map to base Label
  interface Props extends HTMLAttributes<HTMLLabelElement> {
    for?: string;
    class?: string;
  }
  let { for: forProp = '', class: classProp = '', children, ...rest }: Props & { children?: any } = $props();
</script>

<Label for_={forProp} class_={classProp} {...rest}>
  {#if children}
    {@render children()}
  {/if}
</Label>
