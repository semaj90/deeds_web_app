<script lang="ts">
  import { slide } from 'svelte/transition';
// Lucide icons - individual imports
  import Download from 'lucide-svelte/icons/download';
  import Eye from 'lucide-svelte/icons/eye';
  import FileText from 'lucide-svelte/icons/file-text';
  import Layout from 'lucide-svelte/icons/layout';
  import Maximize from 'lucide-svelte/icons/maximize';
  import Minimize from 'lucide-svelte/icons/minimize';
  import PanelLeft from 'lucide-svelte/icons/panel-left';
  import Redo from 'lucide-svelte/icons/redo';
  import Replace from 'lucide-svelte/icons/replace';
  import Save from 'lucide-svelte/icons/save';
  import Search from 'lucide-svelte/icons/search';
  import Undo from 'lucide-svelte/icons/undo';
  import Upload from 'lucide-svelte/icons/upload';

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
            <Save size={16} /> Save Report <span class="shortcut">Ctrl+S</span>
          </button>
          <button class="dropdown-item" onclick={() => closeAllMenus()}>
            <FileText size={16} /> New Report <span class="shortcut">Ctrl+N</span>
          </button>
          <div class="dropdown-separator"></div>
          <button class="dropdown-item" onclick={() => closeAllMenus()}>
            <Upload size={16} /> Import
          </button>
          <button class="dropdown-item" onclick={() => { handleExport(); closeAllMenus(); }}>
            <Download size={16} /> Export
          </button>
          <div class="dropdown-separator"></div>
          <button class="dropdown-item" onclick={() => { handlePreview(); closeAllMenus(); }}>
            <Eye size={16} /> Preview
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
            <Undo size={16} /> Undo <span class="shortcut">Ctrl+Z</span>
          </button>
          <button class="dropdown-item" onclick={() => closeAllMenus()}>
            <Redo size={16} /> Redo <span class="shortcut">Ctrl+Y</span>
          </button>
          <div class="dropdown-separator"></div>
          <button class="dropdown-item" onclick={() => closeAllMenus()}>
            <Search size={16} /> Find <span class="shortcut">Ctrl+F</span>
          </button>
          <button class="dropdown-item" onclick={() => closeAllMenus()}>
            <Replace size={16} /> Replace <span class="shortcut">Ctrl+H</span>
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
            <PanelLeft size={16} /> Toggle Sidebar <span class="shortcut">Ctrl+B</span>
          </button>
          <button class="dropdown-item" onclick={() => { toggleLayout(); closeAllMenus(); }}>
            <Layout size={16} /> Switch Layout ({currentLayout})
          </button>
          <button class="dropdown-item" onclick={() => { toggleFullscreen(); closeAllMenus(); }}>
            {#if fullscreen}
              <Minimize size={16} /> Exit Fullscreen
            {:else}
              <Maximize size={16} /> Fullscreen
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
      <Save size={16} />
    </button>

    <div class="separator"></div>

    <button class="action-button" onclick={toggleSidebar} title="Toggle Sidebar">
      <PanelLeft size={16} />
    </button>

    <button class="action-button" onclick={toggleLayout} title="Switch Layout">
      <Layout size={16} />
    </button>

    <div class="separator"></div>

    <button class="action-button" onclick={handlePreview} title="Preview Report">
      <Eye size={16} />
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
    z-index: 40 }

  .menu-bar {
    display: flex;
    align-items: center;
	gap: 0.5rem }

  .menu-dropdown {
    position: relative }

  .menu-trigger {
    background: none;
	border: none;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
	color: #374151;
    cursor: pointer;
	transition:all 0.15s ease }

  .menu-trigger:hover {
    background: #f3f4f6 }

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
    z-index: 50 }

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
	transition:background-color 0.15s ease }

  .dropdown-item:hover {
    background: #f3f4f6 }

  .dropdown-separator {
    height: 1px;
	background: #e2e8f0;
    margin: 0.5rem 0 }

  .shortcut {
    margin-left: auto;
    font-size: 0.75rem;
	color: #6b7280;
    opacity: 0.7 }

  .quick-actions {
    display: flex;
    align-items: center;
	gap: 0.25rem }

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
	transition:all 0.15s ease }

  .action-button:hover {
    background: #f3f4f6;
	color: #3b82f6 }

  .action-button.unsaved {
    color: #ef4444 }

  .separator {
    width: 1px;
	height: 1.5rem;
    background: #e2e8f0;
	margin: 0 0.5rem }

  .status-info {
    display: flex;
    align-items: center;
	gap: 1rem;
    font-size: 0.75rem;
	color: #6b7280 }

  .word-count {
    font-weight: 500 }

  .unsaved-indicator {
    color: #ef4444;
    font-weight: 500 }

  .saved-indicator {
    color: #10b981 }
</style>
