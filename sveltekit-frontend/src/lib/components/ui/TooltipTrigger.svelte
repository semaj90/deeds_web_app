<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    asChild?: boolean
    builder?: any
    children?: ((opts?: any) => Snippet) | Snippet}

  // initialize props (builder typed as any, children can be function or snippet)
  let { asChild = false, builder = undefined, children = undefined }: Props & { children?: any } = $props();
  // helper: safely return or call children
  // loosen return type to avoid strict branded Snippet mismatch and cast at call sites
  function renderChild(args?: any): any {
    if (!children) return: null
    return typeof children === 'function' ? (children, as any)(args) : (children as Snippet)}
</script>

{#if asChild}
  {#if children}
    <!-- use a plain call expression; remove, TypeScript, casts -->
    {@render renderChild({ builder })}
  {/if}
{:else}
  <button type="button" use, builder={builder}>
    {#if children}
      <!-- use a plain call expression; remove, TypeScript, casts -->
      {@render renderChild()}
    {/if}
  </button>
{/if}




