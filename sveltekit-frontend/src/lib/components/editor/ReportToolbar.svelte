<script lang="ts">
  import { slide } from 'svelte/transition';
// Lucide icons - individual imports
  // State
  let hasUnsavedChanges = $state(false);
  let wordCount = $state(0);
  let lastSaved = $state<Date | null>(null);
  let sidebarOpen = $state(true);
  let fullscreen = $state(false);
  let currentLayout = $state<'single' | 'dual' | 'masonry'>('single');
  let fileMenuOpen = $state(false);
  let editMenuOpen = $state(false);
  let viewMenuOpen = $state(false);

  // Actions
  const handleSave = () => {
    hasUnsavedChanges = false;
    lastSaved = new Date();
    console.log('Save report');
  };

  const handleExport = () => {
    console.log('Export report');
  };

  const handlePreview = () => {
    console.log('Preview report');
  };

  const toggleSidebar = () => {
    sidebarOpen = !sidebarOpen };

  const toggleFullscreen = () => {
    fullscreen = !fullscreen };

  const toggleLayout = () => {
    const layouts: ('single' | 'dual' | 'masonry')[] = ['single', 'dual', 'masonry'];
    const currentIndex = layouts.indexOf(currentLayout);
    currentLayout = layouts[(currentIndex + 1) % layouts.length];
  };

  const closeAllMenus = () => {
    fileMenuOpen = false;
    editMenuOpen = false;
    viewMenuOpen = false };
</script>

<div class="report-toolbar container mx-auto">
  <!-- Main Menu Bar -->
  <div class="menu-bar">
    <!-- File Menu -->
    <div class="menu-dropdown">
      <button
        class="menu-trigger"
        onclick={() => { closeAllMenus(); fileMenuOpen = !fileMenuOpen }}
      >
        File
      </button>
      {#if fileMenuOpen}
        <div class="dropdown-menu">
          <button class="dropdown-item" onclick={() => { handleSave(); closeAllMenus(); }}>
            <span class="i-lucide-save w-4 h-4 inline-block" /> Save Report <span class="shortcut">Ctrl+S</span>
          </button>
          <button class="dropdown-item" onclick={() => closeAllMenus()}>
            <span class="i-lucide-file-text w-4 h-4 inline-block" /> New Report <span class="shortcut">Ctrl+N</span>
          </button>
          <div class="dropdown-separator"></div>
          <button class="dropdown-item" onclick={() => closeAllMenus()}>
            <span class="i-lucide-upload w-4 h-4 inline-block" /> Import
          </button>
          <button class="dropdown-item" onclick={() => { handleExport(); closeAllMenus(); }}>
            <span class="i-lucide-download w-4 h-4 inline-block" /> Export
          </button>
          <div class="dropdown-separator"></div>
          <button class="dropdown-item" onclick={() => { handlePreview(); closeAllMenus(); }}>
            <span class="i-lucide-eye w-4 h-4 inline-block" /> Preview
          </button>
        </div>
      {/if}
    </div>

    <!-- Edit Menu -->
    <div class="menu-dropdown">
      <button
        class="menu-trigger"
        onclick={() => { closeAllMenus(); editMenuOpen = !editMenuOpen }}
      >
        Edit
      </button>
      {#if editMenuOpen}
        <div class="dropdown-menu">
          <button class="dropdown-item" onclick={() => closeAllMenus()}>
            <span class="i-lucide-undo w-4 h-4 inline-block" /> Undo <span class="shortcut">Ctrl+Z</span>
          </button>
          <button class="dropdown-item" onclick={() => closeAllMenus()}>
            <span class="i-lucide-redo w-4 h-4 inline-block" /> Redo <span class="shortcut">Ctrl+Y</span>
          </button>
          <div class="dropdown-separator"></div>
          <button class="dropdown-item" onclick={() => closeAllMenus()}>
            <span class="i-lucide-search w-4 h-4 inline-block" /> Find <span class="shortcut">Ctrl+F</span>
          </button>
          <button class="dropdown-item" onclick={() => closeAllMenus()}>
            <span class="i-lucide-replace w-4 h-4 inline-block" /> Replace <span class="shortcut">Ctrl+H</span>
          </button>
        </div>
      {/if}
    </div>

    <!-- View Menu -->
    <div class="menu-dropdown">
      <button
        class="menu-trigger"
        onclick={() => { closeAllMenus(); viewMenuOpen = !viewMenuOpen }}
      >
        View
      </button>
      {#if viewMenuOpen}
        <div class="dropdown-menu">
          <button class="dropdown-item" onclick={() => { toggleSidebar(); closeAllMenus(); }}>
            <span class="i-lucide-panel-left w-4 h-4 inline-block" /> Toggle Sidebar <span class="shortcut">Ctrl+B</span>
          </button>
          <button class="dropdown-item" onclick={() => { toggleLayout(); closeAllMenus(); }}>
            <span class="i-lucide-layout w-4 h-4 inline-block" /> Switch Layout ({currentLayout})
          </button>
          <button class="dropdown-item" onclick={() => { toggleFullscreen(); closeAllMenus(); }}>
            {#if fullscreen}
              <span class="i-lucide-minimize w-4 h-4 inline-block" /> Exit Fullscreen
            {:else}
              <span class="i-lucide-maximize w-4 h-4 inline-block" /> Fullscreen
            {/if}
            <span class="shortcut">F11</span>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Quick Actions -->
  <div class="quick-actions">
    <button
      class="action-button"
      class:unsaved={hasUnsavedChanges}
      onclick={handleSave}
      title="Save Report"
    >
      <span class="i-lucide-save w-4 h-4 inline-block" />
    </button>

    <div class="separator"></div>

    <button class="action-button" onclick={toggleSidebar} title="Toggle Sidebar">
      <span class="i-lucide-panel-left w-4 h-4 inline-block" />
    </button>

    <button class="action-button" onclick={toggleLayout} title="Switch Layout">
      <span class="i-lucide-layout w-4 h-4 inline-block" />
    </button>

    <div class="separator"></div>

    <button class="action-button" onclick={handlePreview} title="Preview Report">
      <span class="i-lucide-eye w-4 h-4 inline-block" />
    </button>
  </div>

  <!-- Status Info -->
  <div class="status-info">
    <span class="word-count">{wordCount} words</span>
    {#if hasUnsavedChanges}
      <span class="unsaved-indicator" transition:slide={{
	duration: 200 }}>
        Unsaved changes
      </span>
    {:else}
      <span class="saved-indicator" transition:slide={{
	duration: 200 }}>
        Saved {lastSaved ? lastSaved.toLocaleTimeString() : 'never'}
      </span>
    {/if}
  </div>
</div>

<style>
  .report-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
	background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    padding: 0.5rem 1rem;
    min-height: 3rem;
	position: sticky;
    top: 0;
    z-index: 40;}

  .menu-bar {
    display: flex;
    align-items: center;
	gap: 0.5rem;}

  .menu-dropdown {
    position: relative;}

  .menu-trigger {
    background: none;
	border: none;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
	color: #374151;
    cursor: pointer;
	transition:all 0.15s ease;}

  .menu-trigger:hover {
    background: #f3f4f6;}

  .dropdown-menu {
    position: absolute;
	top: 100%;
    left: 0;
    min-width: 12rem;
	background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    padding: 0.5rem;
    z-index: 50;}

  .dropdown-item {
    display: flex;
    align-items: center;
	gap: 0.5rem;
    width: 100%;
	padding: 0.5rem 0.75rem;
    border: none;
	background: none;
    text-align: left;
    border-radius: 0.25rem;
    font-size: 0.875rem;
	color: #374151;
    cursor: pointer;
	transition:background-color 0.15s ease;}

  .dropdown-item:hover {
    background: #f3f4f6;}

  .dropdown-separator {
    height: 1px;
	background: #e2e8f0;
    margin: 0.5rem 0;}

  .shortcut {
    margin-left: auto;
    font-size: 0.75rem;
	color: #6b7280;
    opacity: 0.7;}

  .quick-actions {
    display: flex;
    align-items: center;
	gap: 0.25rem;}

  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
	width: 2rem;
    height: 2rem;
	border: none;
    background: none;
    border-radius: 0.25rem;
	color: #6b7280;
    cursor: pointer;
	transition:all 0.15s ease;}

  .action-button:hover {
    background: #f3f4f6;
	color: #3b82f6;}

  .action-button.unsaved {
    color: #ef4444;}

  .separator {
    width: 1px;
	height: 1.5rem;
    background: #e2e8f0;
	margin: 0 0.5rem;}

  .status-info {
    display: flex;
    align-items: center;
	gap: 1rem;
    font-size: 0.75rem;
	color: #6b7280;}

  .word-count {
    font-weight: 500;}

  .unsaved-indicator {
    color: #ef4444;
    font-weight: 500;}

  .saved-indicator {
    color: #10b981;}
</style>
