<script lang="ts">
  import { Button } from '$lib/components/ui/enhanced-bits';
  interface Props {
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    show?: boolean}
  let { position = 'bottom-right', show = true }: Props = $props();
</script>

{#if show}
  <div class="ai-button-portal" data-position={position}>
    <Button.Root class="bits-btn bits-btn">AI Assistant</Button>
  {/if}
<style>
  /* @unocss-include */
  .ai-button-portal {
    position: fixed;
    z-index: 1000
    pointer-events: auto;}
  [data-position='bottom-right'] {
    right: 1.5rem; bottom: 1.5rem;}
  [data-position='bottom-left'] {
    left: 1.5rem; bottom: 1.5rem;}
  [data-position='top-right'] {
    right: 1.5rem; top: 1.5rem;}
  [data-position='top-left'] {
    left: 1.5rem
   ;top: 1.5rem;}
</style>




