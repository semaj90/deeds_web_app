<script lang="ts">
  /**
   * HoverCard — Progressive Disclosure (bits-ui Tooltip headless primitive)
   * Shows rich preview content on hover/focus. Accessible with keyboard.
   * Uses bits-ui Tooltip internally for reliable positioning + a11y.
   */
  import { Tooltip } from 'bits-ui';
  import type { Snippet } from 'svelte';

  interface Props {
    /** Delay before showing (ms). Default 400. */
    delay?: number;
    /** Preferred placement side. */
    side?: 'top' | 'bottom' | 'left' | 'right';
    /** Max width of the card. */
    maxWidth?: string;
    /** Trigger content */
    trigger: Snippet;
    /** Card content */
    children: Snippet;
  }

  let {
    delay = 400,
    side = 'bottom',
    maxWidth = '320px',
    trigger,
    children,
  }: Props = $props();
</script>

<Tooltip.Root delayDuration={delay}>
  <Tooltip.Trigger class="hover-card-trigger">
    {@render trigger()}
  </Tooltip.Trigger>
  <Tooltip.Content {side} sideOffset={6} class="hover-card-content" style="max-width: {maxWidth};">
    <div class="hover-card-inner">
      {@render children()}
    </div>
    <Tooltip.Arrow class="hover-card-arrow" />
  </Tooltip.Content>
</Tooltip.Root>

<style>
  :global(.hover-card-trigger) {
    cursor: pointer;
    display: inline-flex;
  }

  :global(.hover-card-content) {
    z-index: 9000;
    animation: hc-in 0.15s ease-out;
  }

  @keyframes hc-in {
    from {
      opacity: 0;
      transform: scale(0.97) translateY(2px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .hover-card-inner {
    background: #1a1d24;
    border: 1px solid rgba(212, 199, 163, 0.12);
    border-radius: 0.5rem;
    padding: 0.75rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
    font-size: 0.8125rem;
    color: rgba(212, 199, 163, 0.85);
    line-height: 1.5;
  }

  :global(.hover-card-arrow) {
    fill: #1a1d24;
  }
</style>
