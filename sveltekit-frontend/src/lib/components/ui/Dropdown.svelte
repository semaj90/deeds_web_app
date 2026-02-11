<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { Snippet } from 'svelte';

  interface Props {
    align?: 'left' | 'right';
    closeOnSelect?: boolean;
    onopen?: () => void;
    onclose?: () => void;
    children?: Snippet;
    trigger?: Snippet<[{ open: boolean }]>;
  }

  let {
    align = 'left',
    closeOnSelect = true,
    onopen,
    onclose,
    children,
    trigger
  }: Props = $props();

  let open = $state(false);
  let rootEl: HTMLElement | null = $state(null);

  function toggle() {
    open = !open;
    if (open) {
      onopen?.();
    } else {
      onclose?.();
    }
  }

  export function close() {
    if (open) {
      open = false;
      onclose?.();
    }
  }

  export function maybeCloseFromItem() {
    if (closeOnSelect) close();
  }

  function onDocumentClick(e: MouseEvent) {
    if (!rootEl) return;
    if (!rootEl.contains(e.target as Node)) {
      close();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }

  $effect(() => {
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeydown);

    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeydown);
    };
  });

  const menuPosition = $derived(align === 'right' ? 'right: 0;' : 'left: 0;');
</script>

<div class="dropdown-root" bind:this={rootEl} style="position: relative; display: inline-block;">
  <button
    type="button"
    class="dropdown-trigger"
    onclick={(e) => {
      e.stopPropagation();
      toggle();
    }}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    }}
    aria-haspopup="true"
    aria-expanded={open}
  >
    {#if trigger}
      {@render trigger({ open })}
    {/if}
  </button>

  {#if open}
    <div
      role="menu"
      tabindex="-1"
      class="dropdown-menu"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === 'Escape') close();
      }}
      style={`position: absolute; top: 100%; z-index: 60; ${menuPosition}`}
      transition:fly={{ y: -6, duration: 140 }}
    >
      {#if children}
        {@render children()}
      {/if}
    </div>
  {/if}
</div>

<style>
  .dropdown-root {
    font-size: 0.95rem;
  }

  .dropdown-trigger {
    display: inline-flex;
    align-items: center;
  }

  .dropdown-menu {
    background: var(--dropdown-bg, #fff);
    border-radius: 0.5rem;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08);
    padding: 0.35rem;
    border: 1px solid #e6edf3;
    min-width: 12rem;
  }
</style>
