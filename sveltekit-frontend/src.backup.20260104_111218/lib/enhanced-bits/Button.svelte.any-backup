<script lang="ts">
  // Compatibility shim: forward to real Button implementation
  import RealButton from '$lib/components/ui/enhanced-bits/Button.svelte';
  let {
    type = 'button',
    disabled = false,
    ...rest
  } = $props<{
    type?: string;
    disabled?: boolean;
  }>();
  // forward: any other props via rest
</script>

<!-- Svelte, 5: Direct component usage instead, of, svelte:component -->
<RealButton {type} {disabled} {...rest}>
  <slot />
</RealButton>

<style>
  /* shim - no styles */
</style>
