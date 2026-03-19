<script lang="ts">
  /**
   * Kbd — Keyboard Shortcut Visual Hint (Affordance + Hick's Law)
   * Shows keyboard shortcuts inline as styled key caps.
   * Supports single keys, combos (Ctrl+K), and common modifiers.
   */
  interface Props {
    keys: string;
    size?: 'sm' | 'md';
  }

  let { keys, size = 'sm' }: Props = $props();

  let parts = $derived(keys.split('+').map(k => {
    const t = k.trim().toLowerCase();
    // Map common modifier names to symbols
    if (t === 'ctrl' || t === 'control') return '⌃';
    if (t === 'cmd' || t === 'meta' || t === 'command') return '⌘';
    if (t === 'alt' || t === 'option') return '⌥';
    if (t === 'shift') return '⇧';
    if (t === 'enter' || t === 'return') return '↵';
    if (t === 'esc' || t === 'escape') return 'Esc';
    if (t === 'tab') return '⇥';
    if (t === 'space') return '␣';
    if (t === 'backspace') return '⌫';
    if (t === 'delete') return '⌦';
    if (t === 'up') return '↑';
    if (t === 'down') return '↓';
    if (t === 'left') return '←';
    if (t === 'right') return '→';
    return k.trim().toUpperCase();
  }));
</script>

<span class="kbd-combo {size}" aria-label="Keyboard shortcut: {keys}">
  {#each parts as part, i}
    {#if i > 0}<span class="kbd-plus" aria-hidden="true">+</span>{/if}
    <kbd class="kbd-key">{part}</kbd>
  {/each}
</span>

<style>
  .kbd-combo {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    vertical-align: baseline;
  }

  .kbd-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.375rem;
    height: 1.375rem;
    padding: 0 0.3125rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6875rem;
    font-weight: 500;
    line-height: 1;
    color: rgba(212, 199, 163, 0.65);
    background: rgba(212, 199, 163, 0.06);
    border: 1px solid rgba(212, 199, 163, 0.12);
    border-bottom-width: 2px;
    border-radius: 0.25rem;
    white-space: nowrap;
  }

  .kbd-plus {
    font-size: 0.5625rem;
    color: rgba(212, 199, 163, 0.25);
    margin: 0 0.0625rem;
  }

  .sm .kbd-key {
    min-width: 1.125rem;
    height: 1.125rem;
    padding: 0 0.25rem;
    font-size: 0.5625rem;
  }

  .md .kbd-key {
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0 0.375rem;
    font-size: 0.75rem;
  }
</style>
