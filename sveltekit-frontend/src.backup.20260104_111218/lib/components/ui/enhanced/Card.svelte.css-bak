<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import type { HTMLAttributes } from 'svelte/elements';
  interface Props extends HTMLAttributes<HTMLDivElement> {
    elevated?: boolean;
    interactive?: boolean;
    children?: import('svelte').Snippet;
    class?: string;
  }
  let { elevated = false, interactive = false, children, class: className = '', ...prop }: Props = $props();
  
  let cardClasses = $derived(
    [
      'yorha-card shadcn-card',
      elevated && 'yorha-card-elevated',
      interactive && 'cursor-pointer hover:scale-[1.02] transition-transform duration-200',
      className,
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<div class={cardClasses} {...props}>
  <slot />
</div>

<style>
/* Enhanced Card with NieR styling */ {}
  .yorha-card {
/* Base styles from UnoCSS shortcuts */ {}
    position: relative}
  .yorha-card: :before {
    content: ''; position: absolute
   ; top: 0; left: 0
   ; right: 0; height: 2px;background: linear-gradient( {}
90deg, {}
transparent 0%, {}
var(--color-nier-border-primary) 10%, {}
var(--color-nier-border-primary) 90%, {}
transparent 100% {}
    );
    opacity: 0
    transition: opacity 0.3s ease}
  .yorha-card:hover::before { opacity: 0.3}
</style>
