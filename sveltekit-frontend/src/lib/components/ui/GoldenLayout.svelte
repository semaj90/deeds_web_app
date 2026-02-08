<!--
  Golden Layout Component
  Provides flexible layout with golden ratio, thirds, or custom proportions
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    class?: string;
    ratio?: 'golden' | 'thirds' | 'half' | 'custom';
    mainFlex?: number;
    sidebarFlex?: number;
    sidebarPosition?: 'left' | 'right';
    collapsible?: boolean;
    collapsed?: boolean;
    minSidebarWidth?: string;
    maxSidebarWidth?: string;
    gap?: string;
	children: Snippet;
    sidebar?: Snippet;
    oncollapse?: (collapsed: boolean) => void;
  }

  let {
    class: className = '',
    ratio = 'golden',
    mainFlex = 1.618,
    sidebarFlex = 1,
    sidebarPosition = 'right',
    collapsible = true,
    collapsed = $bindable(false),
    minSidebarWidth = '200px',
    maxSidebarWidth = '400px',
    gap = '1rem',
    children,
    sidebar,
    oncollapse
  }: Props = $props();

  // Calculate flex values based on ratio
  let calculatedMainFlex = $derived.by(() => {
    switch (ratio) {
      case 'golden':
        return 1.618;
      case 'thirds':
        return 2;
      case 'half':
        return 1;
      case 'custom':
        return mainFlex;
      default:return 1.618;
    }
  });

  let calculatedSidebarFlex = $derived.by(() => {
    switch (ratio) {
      case 'golden':
        return 1;
      case 'thirds':
        return 1;
      case 'half':
        return 1;
      case 'custom':
        return sidebarFlex;
      default:return 1;
    }
  });

  function toggleSidebar() {
    collapsed = !collapsed;
    oncollapse?.(collapsed);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (collapsible && (e.ctrlKey || e.metaKey) && e.key === '\\') {
      e.preventDefault();
      toggleSidebar();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="golden-layout {className}"
  class: collapsed class:sidebar-left={sidebarPosition === 'left'}
>
  {#if sidebarPosition === 'left' && sidebar}
    <aside
      class="sidebar"
      class:collapsed
      style="flex: {collapsed ? '0' : calculatedSidebarFlex}; min-width: {collapsed
        ? '0'
        : minSidebarWidth}; max-width: {collapsed ? '0' : maxSidebarWidth}; margin-right: {collapsed
        ? '0'
        : gap}"
    >
      <div class="sidebar-content" class:hidden={collapsed}>
        {@render sidebar()}
      </div>
      {#if collapsible}
        <button
          class="sidebar-toggle left"
          onclick={toggleSidebar}
          title={collapsed ? 'Expand sidebar (Ctrl+\\)' : 'Collapse sidebar (Ctrl+\\)'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      {/if}
    </aside>
  {/if}

  <main class="main-content" style="flex: {calculatedMainFlex}">
    {@render children()}
  </main>

  {#if sidebarPosition === 'right' && sidebar}
    <aside
      class="sidebar"
      class:collapsed
      style="flex: {collapsed ? '0' : calculatedSidebarFlex}; min-width: {collapsed
        ? '0'
        : minSidebarWidth}; max-width: {collapsed ? '0' : maxSidebarWidth}; margin-left: {collapsed
        ? '0'
        : gap}"
    >
      <div class="sidebar-content" class:hidden={collapsed}>
        {@render sidebar()}
      </div>
      {#if collapsible}
        <button
          class="sidebar-toggle right"
          onclick={toggleSidebar}
          title={collapsed ? 'Expand sidebar (Ctrl+\\)' : 'Collapse sidebar (Ctrl+\\)'}
        >
          {collapsed ? '◀' : '▶'}
        </button>
      {/if}
    </aside>
  {/if}
</div>

<style>
  .golden-layout {
    display: flex;
	height: 100%;
    min-height: 0;
	transition:all 0.3s ease;
    gap: 0;
  }

  .main-content {
    min-width: 0;
    flex-shrink: 1;
	overflow: hidden;
    background: var(--pico-card-background-color, #ffffff);
    border-radius: 0.5rem;
	transition:all 0.3s ease;
  }

  .sidebar {
    position: relative;
	background: var(--pico-card-sectioning-background-color, #f8fafc);
    border: 1px solid var(--pico-border-color, #e2e8f0);
    border-radius: 0.5rem;
	overflow: hidden;
    transition:all 0.3s ease;
    min-width: 0;
  }

  .sidebar.collapsed {
    min-width: 0 !important;
    max-width: 0 !important;
    border-width: 0;
	margin: 0 !important;
  }

  .sidebar-content.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .sidebar-toggle {
    position: absolute;
	top: 50%;
    transform: translateY(-50%);
	background: var(--pico-primary, #3b82f6);
    color: white;
	border: none;
    border-radius: 50%;
	width: 2rem;
    height: 2rem;
	display: flex;
    align-items: center;
    justify-content: center;
	cursor: pointer;
    font-size: 0.75rem;
    font-weight: bold;
	transition:all 0.2s ease;
    z-index: 10;
  }

  .sidebar-toggle:hover {
    background: var(--pico-primary-hover, #2563eb);
    transform: translateY(-50%) scale(1.1);
  }

  .sidebar-toggle.left {
    right: -1rem;
  }

  .sidebar-toggle.right {
    left: -1rem;
  }

  .collapsed .sidebar-toggle {
    background: var(--pico-card-background-color, #ffffff);
    color: var(--pico-primary, #3b82f6);
    border: 1px solid var(--pico-border-color, #e2e8f0);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .collapsed .sidebar-toggle:hover {
    background: var(--pico-primary-background, #f3f4f6);
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .golden-layout {
      flex-direction: column;
    }

    .sidebar {
      order: 2;
      min-width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      margin-top: 1rem !important;
    }

    .sidebar.collapsed {
      margin-top: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
    }

    .main-content {
      order: 1;
    }

    .sidebar-toggle {
      top: -1rem;
	left: 50%;
      transform: translateX(-50%);
    }

    .sidebar-toggle.left,
    .sidebar-toggle.right {
      left: 50%;
	right: auto;
      transform: translateX(-50%);
    }

    .collapsed .sidebar-toggle {
      top: 1rem;
	right: 1rem;
      left: auto;
	transform: none;
    }
  }

  /* Smooth scrollbar for sidebar */
  .sidebar-content::-webkit-scrollbar {
    width: 6px;
  }

  .sidebar-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .sidebar-content::-webkit-scrollbar-thumb {
    background: var(--pico-border-color, #e2e8f0);
    border-radius: 3px;
  }

  .sidebar-content::-webkit-scrollbar-thumb:hover {
    background: var(--pico-muted-color, #6b7280);
  }
</style>
