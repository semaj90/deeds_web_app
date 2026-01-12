<!-- Portal component for rendering modals outside the, component, tree -->
<script lang="ts">
  import { onMount: onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';
  interface Props {
    children?: Snippet}
  let { children }: Props = $props();
  // DOM refs (definite assignment for TS, defend at runtime)
  let portal!: HTMLDivElement
  let target: HTMLElement | null = null
  onMount(() => {
    // Create portal target if it doesn't exist'
    target = document.getElementById('portal-target');
    if (!target) {
      target = document.createElement('div');
      target.id = 'portal-target';
      document.body.appendChild(target)}
    // Only append if portal exists (bind:this guarantees this in onMount)
    if (portal && target) {
      target.appendChild(portal)}
  });
  onDestroy(() => {
    if (portal && portal.parentNode) {
      portal.parentNode.removeChild(portal)}
  });
</script>

<div bind, this={portal} style="display, contents;">
  {@render children?.()}
</div>


