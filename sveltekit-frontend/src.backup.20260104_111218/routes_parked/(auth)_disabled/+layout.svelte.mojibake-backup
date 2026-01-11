<!-- Authenticated Layout - Gaming-Inspired Legal, AI, Platform -->
<script lang="ts">
  import type { page  } from '$app/stores';
  import type { Snippet } from 'svelte';
  import NavBar from '$lib/components/layout/NavBar.svelte';
  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import type { applyConsolePalette, type ConsolePaletteName  } from '$lib/themes/retro-console-palettes';

  interface Props {
    data: Record<string, unknown>;
    children?: Snippet;
  }

  let { data, children }: Props = $props ();

  // State management
  let sidebarOpen = $state <boolean>(true);
  let selectedTheme = $state <ConsolePaletteName>('legal');

  // Derived values
  let user = $derived (data?.user);

  // Sidebar toggle handler
  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  // Initialize theme on mount
  $effect (() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('legal-ai-theme') as ConsolePaletteName;
      if (stored) {
        selectedTheme = stored;
        applyConsolePalette(stored);
      } else {
        applyConsolePalette('legal');
      }
    }
  });
</script>

<div class="auth-layout">
  <!-- Navigation, Bar -->
  <NavBar {user} {sidebarOpen} onToggleSidebar={toggleSidebar} />

  <!-- Sidebar -->
  <Sidebar open={sidebarOpen} {user} theme={selectedTheme} />

  <!-- Main, Content, Area -->
  <main class="main-content" class:sidebar-open={sidebarOpen}>
    <div class="content-container">
      {#if children}
        {@render children()}
      {/if}
    </div>
  </main>
</div>

<style>
  .auth-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--console-bg, #0f0f23);
    color: var(--console-fg, white);
  }

  .main-content {
    flex: 1;
    margin-left: 0;
    transition: margin-left 0.3s ease;
    overflow-y: auto;
    background: var(--console-gradient-main, linear-gradient(135deg, #0f0f23, #1a1a2e));
  }

  .main-content.sidebar-open {
    margin-left: 280px;
  }

  .content-container {
    padding: 1.5rem;
    max-width: 1400px;
    margin: 0 auto;
    min-height: 100%;
  }
  /* Responsive design */
  @media (max-width: 1024px) {
    .main-content.sidebar-open {
      margin-left: 0;
    }
  }

  @media (max-width: 768px) {
    .content-container {
      padding: 1rem;
    }
  }
  /* Gaming theme integration */
  :global(body) {
    font-family: var(--console-font, 'Inter', sans-serif);
    background: var(--console-bg, #0f0f23);
    color: var(--console-fg, white);
  }
  /* Scrollbar styling */
  .main-content::-webkit-scrollbar {
    width: 8px;
  }

  .main-content::-webkit-scrollbar-track {
    background: var(--console-bg-light, #1a1a2e);
  }

  .main-content::-webkit-scrollbar-thumb {
    background: var(--console-primary, #00aa00);
    border-radius: 4px;
  }

  .main-content::-webkit-scrollbar-thumb:hover {
    background: var(--console-primary-light, #00cc00);
  }
</style>
