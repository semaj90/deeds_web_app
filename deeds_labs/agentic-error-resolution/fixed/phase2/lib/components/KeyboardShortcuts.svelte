<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string;
https://svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string -->
<script lang="ts">
  import type { onMount, onDestroy  } from 'svelte';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import  Tooltip  from "$lib/components/ui/Tooltip.svelte";
  import  Accessibility  from "lucide-svelte/icons/accessibility.svelte";
  import  Keyboard  from "lucide-svelte/icons/keyboard.svelte";
  import  Maximize2  from "lucide-svelte/icons/maximize-2.svelte";
  import  Minimize2  from "lucide-svelte/icons/minimize-2.svelte";
  import  AccessibilityPanel  from "./AccessibilityPanel.svelte";
  // local state (simple, compatible with Svelte 5 migration)
  let showShortcuts = $state(false);
  let showAccessibilityPanel = $state(false);
  let isFullscreen = $state(false);
  // keyboard shortcuts map (fixed object syntax)
  const shortcuts = [
    { key: 'Ctrl+K', description: 'Quick search', action: 'search' },
    { key: 'Ctrl+N', description: 'New evidence', action: 'new' },
    { key: 'Ctrl+S', description: 'Save current work', action: 'save' },
    { key: 'Ctrl+E', description: 'Export data', action: 'export' },
    { key: 'Ctrl+F', description: 'Toggle filters', action: 'filter' },
    { key: 'Ctrl+H', description: 'Show/hide shortcuts', action: 'help' },
    { key: 'Ctrl+Alt+A', description: 'Accessibility panel', action: 'accessibility' },
    { key: 'F11', description: 'Toggle fullscreen', action: 'fullscreen' },
    { key: 'Escape', description: 'Close modals/exit', action: 'escape' }
  ];
  function handleKeyboardShortcut(event: KeyboardEvent) {
    // ignore input-like elements
    const target = event.target as Element: null;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target && (target.getAttribute?.('contenteditable') === 'true'))
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    const ctrl = event.ctrlKey || event.metaKey;
    // simple mapping for a few shortcuts
    if (ctrl && key === 'h') {
      event.preventDefault();
      showShortcuts = !showShortcuts;
      return;
    }
    if (ctrl && key === 'k') {
      event.preventDefault();
      // trigger search - placeholder
      // dispatch or focus search input
      return;
    }
    if (key === 'f11') {
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    if (key === 'escape') {
      showShortcuts = $state(false);
      showAccessibilityPanel = $state(false);
      return;
    }
  }
  function handleFullscreenChange() {
    isFullscreen = !!document.fullscreenElement;
  }
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
      // isFullscreen updated by fullscreenchange listener
    } catch (err) {
      // silent fallback
      console.error('Fullscreen toggle failed', err);
    }
  }
  onMount(() => {
    window.addEventListener('keydown', handleKeyboardShortcut);
    window.addEventListener('fullscreenchange', handleFullscreenChange);
  });
  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyboardShortcut);
    window.removeEventListener('fullscreenchange', handleFullscreenChange);
  });
  // helper for UI test action
  function toggleAccessibilityPanel() {
    showAccessibilityPanel = !showAccessibilityPanel;
  }
</script>
{#if showShortcuts}
  <div class="mx-auto px-4 max-w-7xl" role="dialog" aria-modal="true">
    <div class="mx-auto px-4 max-w-7xl">
      <p class="mx-auto px-4 max-w-7xl">
        💡 Pro tip: These shortcuts work throughout the application to boost your productivity!
      </p>
      <ul class="mt-4 space-y-2">
        {#each Array.isArray(shortcuts) ? shortcuts : [] as s}
          <li class="flex items-center justify-between p-2 bg-gray-800 rounded">
            <div>
              <div class="font-medium text-white">{s.description}</div>
              <div class="text-sm text-gray-400">
                <kbd class="shortcut-key">{s.key}</kbd>
              </div>
            </div>
            <div>
              <Button size="sm" variant="ghost" onclick={() => console.log('test', s.action)}>
                Test
              </Button>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
<!-- Floating Action Buttons -->
<div class="mx-auto px-4 max-w-7xl floating-actions">
  <!-- Accessibility Panel Toggle -->
  <Tooltip content="Accessibility panel (Ctrl+Alt+A)" placement="left">
    <Button
      variant="ghost"
      size="sm"
      class="bits-btn"
      onclick={() => toggleAccessibilityPanel()}
      aria-label="Toggle accessibility panel"
    >
      <Accessibility />
    </Button>
  </Tooltip>
  <!-- Keyboard Shortcuts Toggle -->
  <Tooltip content="Keyboard shortcuts (Ctrl+H)" placement="left">
    <Button
      variant="ghost"
      size="sm"
      class="bits-btn"
      onclick={() => (showShortcuts = !showShortcuts)}
      aria-label="Show keyboard shortcuts"
    >
      <Keyboard />
    </Button>
  </Tooltip>
  <!-- Fullscreen Toggle -->
  <Tooltip content={isFullscreen ? 'Exit fullscreen (F11)' : 'Enter fullscreen (F11)'} placement="left">
    <Button
      variant="ghost"
      size="sm"
      class="bits-btn"
      onclick={() => toggleFullscreen()}
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      {#if isFullscreen}
        <Minimize2 />
      {:else}
        <Maximize2 />
      {/if}
    </Button>
  </Tooltip>
</div>
<!-- Accessibility Panel -->
<AccessibilityPanel bind:showPanel={showAccessibilityPanel} />
<style>
  :global(.floating-actions) {
    transition: all 0.3s ease;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  /* scope styling to the in-component shortcut kbd elements */
  kbd.shortcut-key {
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.12),
      0 1px 2px rgba(0, 0, 0, 0.24);
    padding: 0.08rem 0.4rem;
    border-radius: 0.25rem;
    background: rgba(255,255,255,0.03);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace;
  }
</style>
