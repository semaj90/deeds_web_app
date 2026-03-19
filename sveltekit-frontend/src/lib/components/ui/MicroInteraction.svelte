<script lang="ts">
  /**
   * MicroInteraction — CSS Micro-Interaction Primitives (Doherty Threshold)
   * Wrap any element with press/hover/focus feedback animations.
   * Implements: press scale, hover lift, focus ring, spring bounce, stagger.
   *
   * Usage:
   *   <MicroInteraction effect="press">
   *     <button>Click me</button>
   *   </MicroInteraction>
   *
   *   <MicroInteraction effect="lift">
   *     <div class="card">...</div>
   *   </MicroInteraction>
   */
  import type { Snippet } from 'svelte';

  type Effect = 'press' | 'lift' | 'glow' | 'bounce' | 'none';

  interface Props {
    effect?: Effect;
    children: Snippet;
  }

  let { effect = 'press', children }: Props = $props();
</script>

<div class="mi mi-{effect}">
  {@render children()}
</div>

<style>
  .mi {
    display: contents;
  }

  /* Press — subtle scale down on click (Fitts's Law tactile feedback) */
  .mi-press > :global(*) {
    transition: transform 0.1s ease;
  }
  .mi-press > :global(*:active) {
    transform: scale(0.97);
  }

  /* Lift — hover elevates with shadow (Affordance: "I'm interactive") */
  .mi-lift > :global(*) {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .mi-lift > :global(*:hover) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  .mi-lift > :global(*:active) {
    transform: translateY(0);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* Glow — subtle glow on hover (Visual Hierarchy: draws attention) */
  .mi-glow > :global(*) {
    transition: box-shadow 0.2s ease;
  }
  .mi-glow > :global(*:hover) {
    box-shadow: 0 0 16px rgba(96, 165, 250, 0.15), 0 0 4px rgba(96, 165, 250, 0.1);
  }

  /* Bounce — spring animation on mount (Doherty Threshold: <400ms response) */
  .mi-bounce > :global(*) {
    animation: mi-spring 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes mi-spring {
    0% { transform: scale(0.9); opacity: 0; }
    60% { transform: scale(1.02); }
    100% { transform: scale(1); opacity: 1; }
  }

  /* None — pass-through, no effects */
  .mi-none {
    display: contents;
  }
</style>
