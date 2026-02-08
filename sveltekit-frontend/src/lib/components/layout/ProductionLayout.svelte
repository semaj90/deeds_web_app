<script lang="ts">
  /**
   * ProductionLayout - Main Application Layout
   * Svelte 5 Component with bits-ui v2 compatible patterns
   * Phase 107 - Clean regeneration
   */
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { cn } from '$lib/utils';
  import Activity from 'lucide-svelte/icons/activity';
  import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
  import Bell from 'lucide-svelte/icons/bell';
  import Calendar from 'lucide-svelte/icons/calendar';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Database from 'lucide-svelte/icons/database';
  import Eye from 'lucide-svelte/icons/eye';
  import Folder from 'lucide-svelte/icons/folder';
  import Home from 'lucide-svelte/icons/home';
  import Menu from 'lucide-svelte/icons/menu';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import Search from 'lucide-svelte/icons/search';
  import Settings from 'lucide-svelte/icons/settings';
  import Terminal from 'lucide-svelte/icons/terminal';
  import User from 'lucide-svelte/icons/user';
  import X from 'lucide-svelte/icons/x';
  import Zap from 'lucide-svelte/icons/zap';
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    subtitle?: string;
    showBreadcrumbs?: boolean;
    fullWidth?: boolean;
    children?: Snippet;
  }

  let {
    title = 'Legal AI Platform',
    subtitle = 'Professional Legal Intelligence Suite',
    showBreadcrumbs = true,
    fullWidth = false,
    children
  } = $props<Props>();

  // Navigation items
  const mainNavItems = [
    { id: 'dashboard', href: '/', label: 'Dashboard', icon: Home, description: 'Overview and metrics' },
	{ id: 'cases', href: '/cases', label: 'Cases', icon: Folder, description: 'Case management' },
	{ id: 'evidence', href: '/evidenceboard', label: 'Evidence', icon: Eye, description: 'Evidence analysis' },
	{ id: 'research', href: '/demo/enhanced-rag-semantic', label: 'Research', icon: Search, description: 'Legal research' },
	{ id: 'chat', href: '/chat', label: 'AI Assistant', icon: MessageSquare, description: 'AI consultation' },
	{ id: 'analytics', href: '/analysis', label: 'Analytics', icon: BarChart3, description: 'Data insights' }
  ];

  const toolsNavItems = [
    { id: 'command', href: '/yorha-command-center', label: 'Command Center', icon: Terminal, description: 'System controls' },
	{ id: 'gpu', href: '/demo/gpu-inference', label: 'GPU Processing', icon: Zap, description: 'AI inference' },
	{ id: 'settings', href: '/settings', label: 'Settings', icon: Settings, description: 'Configuration' },
	{ id: 'admin', href: '/admin', label: 'Admin', icon: Database, description: 'Administration' }
  ];

  // State using Svelte 5 runes
  let isSidebarOpen = $state(true);
  let isMobileMenuOpen = $state(false);
  let showNotifications = $state(false);
  let currentTime = $state(new Date());

  let systemStatus = $state({
    ai: true,
    database: true,
    search: true,
    gpu: false
  });

  // Derived values
  let currentPath = $derived(browser && $page?.url ? $page.url.pathname : '/');

  let breadcrumbs = $derived.by(() => {
    const path = currentPath;
    const segments = path.split('/').filter(Boolean);
    const crumbs = [{ label: 'Home', href: '/' }];

    let currentHref = '';
    for (const segment of segments) {
      currentHref += '/' + segment;
      const navItem = [...mainNavItems, ...toolsNavItems].find(item => item.href === currentHref);
      crumbs.push({
        label: navItem?.label ?? segment.charAt(0).toUpperCase() + segment.slice(1),
        href: currentHref
      });
    }
    return crumbs;
  });

  let currentYear = $derived(new Date().getFullYear());

  // Effects
  $effect(() => {
    const timer = setInterval(() => {
      currentTime = new Date();
    },
	1000);

    return () => clearInterval(timer);
  });

  // Navigation functions
  function handleNavigation(href: string, event?: MouseEvent) {
    event?.preventDefault();
    goto(href);
    if (browser && window.innerWidth < 1024) {
      isMobileMenuOpen = false;
    }
  }

  function toggleSidebar() {
    isSidebarOpen = !isSidebarOpen;
  }

  function toggleMobileMenu() {
    isMobileMenuOpen = !isMobileMenuOpen;
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function isActive(href: string): boolean {
    if (href === '/') return currentPath === '/';
    return currentPath.startsWith(href);
  }
</script>

<div class="layout">
  <!-- Mobile Menu Overlay -->
  {#if isMobileMenuOpen}
    <button
      class="overlay"
      onclick={toggleMobileMenu}
      onkeydown={(e) => e.key === 'Escape' && toggleMobileMenu()}
    ></button>
  {/if}

  <!-- Sidebar -->
  <aside class={cn(
    'sidebar',
    isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed',
    isMobileMenuOpen ? 'sidebar-mobile-open' : ''
  )}>
    <!-- Logo -->
    <div class="sidebar-header">
      <div class="logo">
        <Zap class="logo-icon" />
        {#if isSidebarOpen}
          <div class="logo-text">
            <h1>Legal AI</h1>
            <p>Platform</p>
          </div>
        {/if}
      </div>
      {#if isSidebarOpen}
        <button class="close-mobile" onclick={toggleMobileMenu}>
          <X />
        </button>
      {/if}
    </div>

    <!-- Navigation -->
    <nav class="sidebar-nav">
      <div class="nav-section">
        {#if isSidebarOpen}
          <h3 class="nav-section-title">Core</h3>
        {/if}
        {#each mainNavItems as item}
          <button
            class={cn('nav-item', isActive(item.href) && 'nav-item-active')}
            onclick={(e) => handleNavigation(item.href, e)}
            title={!isSidebarOpen ? item.label : ''}
          >
            <svelte:component this={item.icon} class="nav-icon" />
            {#if isSidebarOpen}
              <div class="nav-item-content">
                <span class="nav-label">{item.label}</span>
                <span class="nav-desc">{item.description}</span>
              </div>
            {/if}
          </button>
        {/each}
      </div>

      <div class="nav-section">
        {#if isSidebarOpen}
          <h3 class="nav-section-title">Tools</h3>
        {/if}
        {#each toolsNavItems as item}
          <button
            class={cn('nav-item', isActive(item.href) && 'nav-item-active')}
            onclick={(e) => handleNavigation(item.href, e)}
            title={!isSidebarOpen ? item.label : ''}
          >
            <svelte:component this={item.icon} class="nav-icon" />
            {#if isSidebarOpen}
              <div class="nav-item-content">
                <span class="nav-label">{item.label}</span>
                <span class="nav-desc">{item.description}</span>
              </div>
            {/if}
          </button>
        {/each}
      </div>

      <!-- System Status -->
      {#if isSidebarOpen}
        <div class="system-status">
          <h3 class="nav-section-title">System</h3>
          <div class="status-grid">
            <div class="status-item">
              <span>AI</span>
              <span class={systemStatus.ai ? 'status-online' : 'status-offline'}>
                {systemStatus.ai ? '●' : '○'}
              </span>
            </div>
            <div class="status-item">
              <span>DB</span>
              <span class={systemStatus.database ? 'status-online' : 'status-offline'}>
                {systemStatus.database ? '●' : '○'}
              </span>
            </div>
            <div class="status-item">
              <span>GPU</span>
              <span class={systemStatus.gpu ? 'status-online' : 'status-warning'}>
                {systemStatus.gpu ? '●' : '◐'}
              </span>
            </div>
          </div>
        </div>
      {/if}
    </nav>

    <!-- Sidebar Footer -->
    {#if isSidebarOpen}
      <div class="sidebar-footer">
        <div class="time-display">
          <span class="time">{formatTime(currentTime)}</span>
          <span class="date">{formatDate(currentTime)}</span>
        </div>
      </div>
    {/if}
  </aside>

  <!-- Main Content -->
  <div class={cn('main-content', isSidebarOpen ? 'main-sidebar-open' : 'main-sidebar-collapsed')}>
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <button class="toggle-btn" onclick={toggleSidebar}>
          <Menu />
        </button>
        <button class="toggle-btn mobile-only" onclick={toggleMobileMenu}>
          <Menu />
        </button>

        <!-- Breadcrumbs -->
        {#if showBreadcrumbs}
          <nav class="breadcrumbs">
            {#each breadcrumbs as crumb, index}
              {#if index > 0}
                <ChevronDown class="breadcrumb-separator" />
              {/if}
              <button
                class={cn('breadcrumb', index === breadcrumbs.length - 1 && 'breadcrumb-active')}
                onclick={(e) => handleNavigation(crumb.href, e)}
              >
                {crumb.label}
              </button>
            {/each}
          </nav>
        {/if}
      </div>

      <div class="header-center">
        <h1 class="page-title">{title}</h1>
        {#if subtitle}
          <p class="page-subtitle">{subtitle}</p>
        {/if}
      </div>

      <div class="header-right">
        <button class="header-btn" onclick={() => showNotifications = !showNotifications}>
          <Bell />
          <span class="notification-badge"></span>
        </button>
        <button class="header-btn user-btn" onclick={(e) => handleNavigation('/profile', e)}>
          <User />
        </button>
      </div>
    </header>

    <!-- Page Content -->
    <main class={cn('page-content', fullWidth ? '' : 'container')}>
      {#if children}
        {@render children()}
      {/if}
    </main>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-content">
        <span>© {currentYear} Legal AI Platform</span>
        <div class="footer-status">
          <Activity class="footer-icon" />
          <span class="status-online">Operational</span>
        </div>
        <div class="footer-time">
          <Calendar class="footer-icon" />
          <span>{formatTime(currentTime)}</span>
        </div>
      </div>
    </footer>
  </div>
</div>

<style>
  .layout {
    display: flex;
    min-height: 100vh;
    background: linear-gradient(135deg, #0f172a, #1e293b, #0f172a);
    color: #f1f5f9;
  }

  .overlay { position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    z-index: 40;
    border: none;
    cursor: pointer;
  }

  /* Sidebar */
  .sidebar { position: fixed; top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(180deg, #0f172a, #1e293b);
    border-right: 1px solid rgba(245, 158, 11, 0.2);
    z-index: 50;
    display: flex;
    flex-direction: column;
    transition:all 0.3s ease;
  }

  .sidebar-open {
    width: 280px;
  }

  .sidebar-collapsed {
    width: 72px;
  }

  .sidebar-mobile-open {
    transform: translateX(0) !important;
  }

  @media (max-width: 1024px) {
    .sidebar {
      transform: translateX(-100%);
    }
  }

  .sidebar-header {
    padding: 1.5rem;
    border-bottom: 1px solid rgba(245, 158, 11, 0.2);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-icon { width: 2rem; height: 2rem;
    color: #f59e0b;
  }

  .logo-text h1 {
    font-size: 1.25rem;
    font-weight: 700;
    color: #f59e0b;
    margin: 0;
  }

  .logo-text p {
    font-size: 0.75rem;
    color: #94a3b8;
    margin: 0;
  }

  .close-mobile { display: none; padding: 0.5rem;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }

  @media (max-width: 1024px) {
    .close-mobile {
      display: block;
    }
  }

  /* Navigation */
  .sidebar-nav { flex: 1; padding: 1.5rem;
    overflow-y: auto;
  }

  .nav-section {
    margin-bottom: 2rem;
  }

  .nav-section-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(245, 158, 11, 0.1);
  }

  .nav-item { width: 100%; display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    margin-bottom: 0.25rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    color: #94a3b8;
    cursor: pointer;
    transition:all 0.2s;
    text-align: left;
  }

  .nav-item:hover {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.3);
  }

  .nav-item-active {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.5);
  }

  .nav-icon { width: 1.25rem; height: 1.25rem;
    flex-shrink: 0;
  }

  .nav-item-content {
    display: flex;
    flex-direction: column;
  }

  .nav-label {
    font-weight: 500;
  }

  .nav-desc {
    font-size: 0.75rem;
    color: #64748b;
  }

  /* System Status */
  .system-status {
    padding-top: 1rem;
    border-top: 1px solid rgba(245, 158, 11, 0.1);
  }

  .status-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: rgba(30, 41, 59, 0.5);
    padding: 0.75rem;
    border-radius: 0.5rem;
  }

  .status-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
  }

  .status-online {
    color: #22c55e;
  }

  .status-offline {
    color: #ef4444;
  }

  .status-warning {
    color: #f59e0b;
  }

  /* Sidebar Footer */
  .sidebar-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid rgba(245, 158, 11, 0.2);
  }

  .time-display {
    background: rgba(30, 41, 59, 0.5);
    padding: 0.75rem;
    border-radius: 0.5rem;
    text-align: center;
  }

  .time {
    display: block;
    font-family: monospace;
    font-size: 1.25rem;
    color: #f59e0b;
  }

  .date {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  /* Main Content */
  .main-content { flex: 1; display: flex;
    flex-direction: column;
    transition:margin-left 0.3s ease;
  }

  .main-sidebar-open {
    margin-left: 280px;
  }

  .main-sidebar-collapsed {
    margin-left: 72px;
  }

  @media (max-width: 1024px) {
    .main-sidebar-open,
    .main-sidebar-collapsed {
      margin-left: 0;
    }
  }

  /* Header */
  .header { position: sticky; top: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.5rem;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(245, 158, 11, 0.2);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .toggle-btn { padding: 0.5rem; background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    border-radius: 0.5rem;
    transition:all 0.2s;
  }

  .toggle-btn:hover { color: #f59e0b; background: rgba(245, 158, 11, 0.1);
  }

  .mobile-only {
    display: none;
  }

  @media (max-width: 1024px) {
    .mobile-only {
      display: block;
    }
  }

  .breadcrumbs {
    display: none;
    align-items: center;
    gap: 0.5rem;
  }

  @media (min-width: 768px) {
    .breadcrumbs {
      display: flex;
    }
  }

  .breadcrumb { background: transparent; border: none;
    color: #64748b;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    transition:all 0.2s;
  }

  .breadcrumb:hover {
    color: #f59e0b;
  }

  .breadcrumb-active {
    color: #f59e0b;
    font-weight: 500;
  }

  .breadcrumb-separator { width: 1rem; height: 1rem;
    color: #475569;
    transform: rotate(-90deg);
  }

  .header-center {
    flex: 1;
    text-align: center;
    display: none;
  }

  @media (min-width: 768px) {
    .header-center {
      display: block;
    }
  }

  .page-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #f59e0b;
    margin: 0;
  }

  .page-subtitle {
    font-size: 0.875rem;
    color: #94a3b8;
    margin: 0;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .header-btn { position: relative; padding: 0.5rem;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    border-radius: 0.5rem;
    transition:all 0.2s;
  }

  .header-btn:hover { color: #f59e0b; background: rgba(245, 158, 11, 0.1);
  }

  .notification-badge { position: absolute; top: 0.25rem;
    right: 0.25rem;
    width: 0.5rem;
    height: 0.5rem;
    background: #ef4444;
    border-radius: 50%;
  }

  /* Page Content */
  .page-content { flex: 1; padding: 1.5rem;
  }

  .container {
    max-width: 1400px;
    margin: 0 auto;
  }

  /* Footer */
  .footer {
    padding: 0.75rem 1.5rem;
    background: rgba(15, 23, 42, 0.95);
    border-top: 1px solid rgba(245, 158, 11, 0.2);
  }

  .footer-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #64748b;
  }

  .footer-status,
  .footer-time {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .footer-icon { width: 0.75rem; height: 0.75rem;
  }
</style>
