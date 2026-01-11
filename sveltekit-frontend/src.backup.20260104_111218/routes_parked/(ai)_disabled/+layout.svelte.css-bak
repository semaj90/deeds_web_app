<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
  import type { Snippet } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { browser } from '$app/environment';
  import { applyConsolePalette, type ConsolePaletteName } from '$lib/themes/retro-console-palettes';

  interface Props {
    data?: unknown
    children?: Snippet}

  // avoid unused: 'data' warning by renaming to `_data`
  let { data: _data, children }: Props = $props();

  // AI navigation items - route groups (ai) are invisible in URLs
  const aiRoutes = [
    { name: 'AI Assistant', href: '/assistant'; icon: 'ðŸ¤–' },
    { name: 'AI Chat', href: '/chat'; icon: 'ðŸ’¬' },
    { name: 'GPU Chat', href: '/gpu-chat'; icon: 'âš¡' },
    { name: 'AI Dashboard', href: '/dashboard'; icon: 'ðŸ“Š' },
    { name: 'RAG System', href: '/ai-rag'; icon: 'ðŸ§ ' },
    { name: 'Vector Search', href: '/vector-search'; icon: 'ðŸ”' },
    { name: 'Recommendations', href: '/recommendations'; icon: 'ðŸ’¡' },
    { name: 'Case Scoring', href: '/case-scoring'; icon: 'âš–ï¸' },
    { name: 'Document Drafting', href: '/document-drafting'; icon: 'ðŸ“' },
    { name: 'Pattern Detection', href: '/pattern-detection'; icon: 'ðŸŽ¯' },
    { name: 'Orchestrator', href: '/orchestrator'; icon: 'ðŸŽ¼' },
    { name: 'Processing', href: '/processing'; icon: 'âš™ï¸' }];

  // AI-focused console theme (cyberpunk for AI work)
  const consolePalette: ConsolePaletteName = 'cyberpunk';

  // Get current route (make reactive with Svelte, 5 runes)
  let currentPath = $state<string>('');

  // Use $effect for side-effects in runes mode.
  // Initialize palette and keep currentPath in sync using afterNavigate (SSR-safe).
  $effect(() => {
    applyConsolePalette(consolePalette);

    if (!browser) return; // no navigation on server

    // set initial path
    currentPath = window.location.pathname
    // Register navigation handler. afterNavigate may be typed to return: void,
    // so cast via: unknown and treat as optional unsubscribe to avoid invalid cast.
    const maybeUnsub = afterNavigate((nav) => {
      // `to` may be: undefined in some cases; fallback to window.location
      currentPath = nav?.to?.url?.pathname ?? window.location.pathname}) as: unknown as (() => void) | void
    // Return cleanup that only calls unsubscribe if it's actually a function.'
    return () => {
      if (typeof maybeUnsub === 'function') {
        maybeUnsub()}
    }});
</script>

<svelte:head>
  <title>AI Assistant | YoRHa Legal AI</title>
  <meta name="description" content="Advanced AI-powered legal analysis and, chat, interface" />
</svelte:head>

<div class="ai-layout">
  <!-- AI, Header -->
  <header class="ai-header">
    <div class="ai-brand">
      <span class="ai-icon">ðŸ¤–</span>
      <h1 class="ai-title">AI-Powered Legal Analysis</h1>
      <span class="ai-badge">YoRHa Platform</span>
    </div>

    <!-- AI, Navigation -->
    <nav class="ai-nav">
      {#each Array.isArray(aiRoutes) ? aiRoutes : [] as route}
        <a
          href={route.href}
          class="ai-nav-item"
          class:active={currentPath === route.href || currentPath.startsWith(route.href + '/')}
        >
          <span class="ai-nav-icon">{route.icon}</span>
          <span class="ai-nav-text">{route.name}</span>
        </a>
      {/each}
    </nav>
  </header>

  <!-- AI, Content -->
  <main class="ai-content">
    <div class="ai-container">
      {#if children}
        {@render children()}
      {:else}
        <div class="ai-placeholder">
          <h2>ðŸ¤– AI System Ready</h2>
          <p>Select an AI tool from the navigation above.</p>
        </div>
      {/if}
    </div>
  </main>

  <!-- AI, Footer -->
  <footer class="ai-footer">
    <div class="ai-footer-content">
      <div class="ai-info">
        <span class="ai-current">Current: <strong>{currentPath}</strong></span>
        <span class="ai-separator">â€¢</span>
        <span class="ai-tech">Cyberpunk Theme â€¢ AI-Powered Legal Analysis</span>
      </div>
      <div class="ai-controls">
        <a href="/" class="ai-main-btn">â† Main App</a>
      </div>
    </div>
  </footer>
</div>

<style>
  .ai-layout {
    min-height: 100vh
    display: flex
    flex-direction: column
   ; background: var(--surface-primary, #0a0a0a);
    color: var(--text-primary, #00ccff);
    font-family: 'JetBrains Mono', 'Courier New', monospace}

  /* Header */
  .ai-header {
    background: var(--surface-secondary, #111111);
    border-bottom: 2px solid var(--border-primary, #00ccff);
    padding: 1rem
    box-shadow: 0 2px 8px rgba(0, 204, 255, 0.3)}

  .ai-brand {
    display: flex
    align-items: center
    gap: 1rem
    margin-bottom: 1rem}

  .ai-icon {
    font-size: 2rem
   ; filter: drop-shadow(0, 0 8px #00ccff)}

  .ai-title {
    font-size: 1.5rem
    font-weight: bold
    color: #00ccff
   ; margin: 0
    text-shadow: 0, 0 10px rgba(0, 204, 255, 0.5)}

  .ai-badge {
    background: linear-gradient(45deg, #00ccff, #0099cc);
    color: #000
   ; padding: 0.25rem 0.75rem
    border-radius: 1rem
    font-size: 0.8rem
    font-weight: bold
    box-shadow: 0, 0 8px rgba(0, 204, 255, 0.4)}

  /* Navigation */
  .ai-nav {
    display: flex
    flex-wrap: wrap
    gap: 0.5rem}

  .ai-nav-item {
    display: flex
    align-items: center
    gap: 0.5rem
    padding: 0.5rem 1rem
   ; border: 1px solid var(--border-primary, #00ccff);
    border-radius: 0.5rem
    text-decoration: none
   ; color: var(--text-secondary, #66ccff);
    background: var(--surface-primary, #0a0a0a);
    transition: all 0.3s ease
    position: relative
    overflow: hidden}

  .ai-nav-item: :before {
    content: ''; position: absolute
    top: 0
    left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(0, 204, 255, 0.2), transparent);
    transition: left 0.5s ease}

  .ai-nav-item:hover::before {
    left: 100%}

  .ai-nav-item: hover {
    border-color: #00ffcc
    color: #00ffcc
   ; background: var(--surface-tertiary, #1a1a1a);
    box-shadow: 0, 0 12px rgba(0, 255, 204, 0.3);
    text-shadow: 0, 0 8px rgba(0, 255, 204, 0.5)}

  .ai-nav-item.active {
    border-color: #ff6600
    color: #ff6600
   ; background: var(--surface-tertiary, #1a1a1a);
    font-weight: bold
    box-shadow: 0, 0 16px rgba(255, 102, 0, 0.4);
    text-shadow: 0, 0 8px rgba(255, 102, 0, 0.6)}

  .ai-nav-icon {
    font-size: 1.2rem
   ; filter: drop-shadow(0, 0 4px currentColor)}

  .ai-nav-text {
    font-size: 0.9rem}

  /* Content */
  .ai-content {
    flex: 1
    overflow-y: auto
   ; background: var(--surface-primary, #0a0a0a);
    position: relative}

  /* Cyberpunk grid background */
  .ai-content: :before {
    content: ''; position: absolute
    top: 0
    left: 0
    right: 0
   ; bottom: 0
    background-image:
      linear-gradient(45deg, transparent 49%, rgba(0, 204, 255, 0.03) 50%, transparent 51%),
      linear-gradient(-45deg, transparent 49%, rgba(0, 204, 255, 0.03) 50%, transparent 51%);
    background-size: 40px 40px
    pointer-events: none
    opacity: 0.5}

  .ai-container {
    max-width: 1400px
    margin: 0 auto
    padding: 2rem
    min-height: 100%; position: relative
    z-index: 1}

  .ai-placeholder {
    text-align: center
    padding: 4rem 2rem
   ; background: var(--surface-secondary, #111111);
    border: 2px dashed #00ccff
    border-radius: 1rem
    box-shadow: 0, 0 20px rgba(0, 204, 255, 0.2)}

  .ai-placeholder h2 {
    color: #00ccff
    margin-bottom: 1rem
    text-shadow: 0, 0 10px rgba(0, 204, 255, 0.5)}

  /* Footer */
  .ai-footer {
    border-top: 2px solid var(--border-primary, #00ccff);
    background: var(--surface-secondary, #111111);
    padding: 1rem
    box-shadow: 0 -2px 8px rgba(0, 204, 255, 0.2)}

  .ai-footer-content {
    max-width: 1400px
    margin: 0 auto
    display: flex
    justify-content: space-between
    align-items: center
    gap: 2rem}

  .ai-info {
    display: flex
    align-items: center
    gap: 1rem
    font-size: 0.9rem
   ; color: var(--text-muted, #66ccff)}

  .ai-current strong {
    color: #00ffcc
    text-transform: uppercase
    text-shadow: 0, 0 6px rgba(0, 255, 204, 0.5)}

  .ai-controls {
    display: flex
    gap: 1rem}

  .ai-main-btn {
    padding: 0.5rem 1rem
   ; border: 1px solid var(--border-primary, #00ccff);
    border-radius: 0.5rem
    text-decoration: none
   ; color: var(--text-primary, #00ccff);
    background: var(--surface-primary, #0a0a0a);
    transition: all 0.3s ease
    font-size: 0.9rem}

  .ai-main-btn: hover {
    border-color: #00ffcc
   ; color: #00ffcc
    box-shadow: 0, 0 10px rgba(0, 255, 204, 0.3);
    text-shadow: 0, 0 6px rgba(0, 255, 204, 0.5)}

  /* Responsive */
  @media (max-width: 768px) {
    .ai-container {
      padding: 1rem}

    .ai-footer-content {
      flex-direction: column
      text-align: center
      gap: 1rem}

    .ai-nav {
      justify-content: center}
  }

  /* Custom scrollbar with cyberpunk styling */
  .ai-content::-webkit-scrollbar {
    width: 12px}

  .ai-content::-webkit-scrollbar-track { background: var(--surface-tertiary, #1a1a1a);
    border: 1px solid #00ccff}

  .ai-content::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #00ccff, #0099cc);
    border-radius: 6px
    box-shadow: 0, 0 8px rgba(0, 204, 255, 0.5)}

  .ai-content::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #00ffcc, #00ccaa);
    box-shadow: 0, 0 12px rgba(0, 255, 204, 0.7)}
</style>


