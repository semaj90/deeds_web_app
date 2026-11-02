<!--
  Consolidated Modal component re-exporting the canonical Bits UI Dialog implementation.
  Ensures portal to document.body, focus trapping, and tactical HUD styling.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import CanonicalModal from '../Modal.svelte';

  interface Props {
    open?: boolean;
    onClose?: () => void;
    title?: string;
    description?: string;
    subtitle?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    variant?: 'standard' | 'legal' | 'glass' | 'yorha' | 'courtroom';
    closeOnOverlayClick?: boolean;
    closeOnEscape?: boolean;
    showCloseButton?: boolean;
    class?: string;
    children?: Snippet;
    footer?: Snippet;
    header?: Snippet;
  }

  let {
    open = $bindable(false),
    onClose,
    title = '',
    description = '',
    subtitle = '',
    size = 'md',
    variant = 'legal',
    closeOnOverlayClick = true,
    closeOnEscape = true,
    showCloseButton = true,
    class: className = '',
    children,
    footer,
    header
  }: Props = $props();

  const mappedVariant = $derived(variant === 'standard' ? 'glass' : variant);
</script>

<CanonicalModal
  bind:open
  {onClose}
  {title}
  subtitle={subtitle || description}
  {size}
  variant={mappedVariant}
  closeOnOutsideClick={closeOnOverlayClick}
  {closeOnEscape}
  {showCloseButton}
  class={className}
  {header}
  {footer}
>
  {#if children}
    {@render children()}
  {/if}
</CanonicalModal>
