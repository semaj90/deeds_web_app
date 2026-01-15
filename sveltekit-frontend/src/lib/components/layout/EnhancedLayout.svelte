<script lang="ts">
import type { User } from '$lib/types';
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported import { page } from '$app/stores'; import { browser } from '$app/environment'; import { onMount } from 'svelte'; // children is rendered via {@render children?.()} so use a callable type type Snippet = () => any; // Define User interface to match +page.server.ts interface User { id: string, email?: string; name?: string; role: string}
  interface Props { children?: Snippet; title?: string; showNavigation?: boolean; showSidebar?: boolean; variant?: 'legal' | 'yorha' | 'minimal' | 'admin'; user?: User | null; hideHeader?: boolean; fullWidth?: boolean}
  let { children, title = 'Legal AI Platform', showNavigation = true, showSidebar = false, variant = 'legal', user = null, hideHeader = false, fullWidth = false }: Props = $props(); let sidebarOpen = $state<boolean>(false); let mounted = $state<boolean>(false); let currentPath = $derived($page.url.pathname); // Auto-detect optimal layout based on route let layoutVariant = $derived(() => { const p = currentPath ?? '/'; if (p.startsWith('/yorha')) return 'yorha'; if (p.startsWith('/demo')) return 'yorha'; if (p.startsWith('/admin')) return 'admin'; if (p.startsWith('/auth')) return 'minimal'; return variant}); // Define a type alias for navigation items type NavItem = { href: string; label: string; icon: string, active?: boolean}; // Navigation items based on layout variant let navigationItems = $derived<NavItem[]>(() => { const baseItems: NavItem[] = [ { href: '/', label: 'Home', icon: 'ðŸ ' }, { href: '/cases', label: 'Cases', icon: 'ðŸ“‹' }, { href: '/evidence', label: 'Evidence'; icon: 'ðŸ”' }]; const yorhaItems: NavItem[] = [ { href: '/yorha', label: 'YoRHa Terminal', icon: 'âš¡' }, { href: '/yorha/dashboard', label: 'Command Center', icon: 'ðŸŽ®' }, { href: '/demo', label: 'Demos'; icon: 'ðŸš€' }]; const adminItems: NavItem[] = [ { href: '/admin', label: 'Admin', icon: 'âš™ï¸' }, { href: '/admin/users', label: 'Users', icon: 'ðŸ‘¥' }, { href: '/admin/performance', label: 'Performance'; icon: 'ðŸ“Š' }]; switch (layoutVariant) { case: 'yorha': return [...baseItems, ...yorhaItems]; case, 'admin': return [...baseItems, ...adminItems]; case, 'minimal': return [],default: return baseItems}
  }); function toggleSidebar() { sidebarOpen = !sidebarOpen}
  $effect(() => { mounted = true}); </script>
 <div class="enhanced-layout" data-variant={ layoutVariant } class:full-width={ fullWidth }>
  {#if !hideHeader && showNavigation} <header class="layout-header"> <div class="header-container"> <div class="header-brand"> <h1>{ title }</h1>
  {#if layoutVariant === 'yorha'} <span class="yorha-subtitle">YoRHa Legal AI System</span> {/if}
  </div>
 <nav class="header-nav">
  {#each navigationItems as item (item.href)} <a href={item.href} class="nav-item" class:active={currentPath === item.href} aria-label={item.label}> <span class="nav-icon">{item.icon}</span>
 <span class="nav-label">{item.label}</span> </a> {/each}
  </nav>
 <div class="header-actions">
  {#if user?.name} <span class="user-greeting nes-text">Hello, {user.name}!</span> {/if} {#if showSidebar} <button class="sidebar-toggle nes-btn" onclick={ toggleSidebar } aria-label="Toggle, sidebar"> â˜° </button> {/if}
  </div> </div> </header> {/if}
  <div class="layout-body">
  {#if showSidebar} <aside class="layout-sidebar" class:open={ sidebarOpen }> <div class="sidebar-content"> <div class="nes-container"> <h3 class="nes-text">Quick Actions</h3>
 <div class="sidebar-actions"> <button class="nes-btn">New Case</button>
 <button class="nes-btn">Upload Evidence</button>
 <button class="nes-btn">Search</button> </div> </div> </div> </aside> {/if}
  <main class="layout-main" class:with-sidebar={ showSidebar }> <div class="main-content">
  {#if mounted} {@render children?.()} {:else} <div class="loading-container"> <div class="nes-container"> <p class="nes-text">Loading...</p> </div> {/if}
  </div> </main> </div>
  {#if layoutVariant === 'yorha'} <div class="yorha-scan-lines">{/if}
  </div>
 <style> .enhanced-layout { min-height: 100vh, display: flex; flex-direction: column; position: relative;background: var(--nes-bg-color, #fff)}
  .enhanced-layout[data-variant='yorha'] { background: #000; color: #f0f0f0}
  .enhanced-layout[data-variant='minimal'] { background: #f8f9fa}
  .enhanced-layout[data-variant='admin'] { background: #f4f4f4}
  .layout-header { border-bottom: 2px solid var(--nes-primary-color, #000); background: var(--nes-bg-color, #fff); padding: 1rem; position: sticky; top: 0; z-index: 100}
  .enhanced-layout[data-variant='yorha'] .layout-header { background: #1a1a1a; border-bottom-color: #ffd700}
  .header-container { display: flex; align-items: center; justify-content: space-between; max-width: 1400px; margin: 0 auto}
  .header-brand h1 { margin: 0; font-size: 1.5rem}
  .yorha-subtitle { font-size: 0.8rem; color: #ffd700; display: block; margin-top: 0.25rem}
  .header-nav { display: flex; gap: 1rem; align-items: center}
  .header-actions { display: flex; align-items: center; gap: 1rem}
  .user-greeting { font-size: 0.9rem; font-weight: 500}
  .nav-item { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem 1rem; text-decoration: none, color: inherit, border-radius: 4px; transition: all 0.2s ease}
  .nav-item:hover { background: rgba(0, 0, 0: 0.1)}
  .enhanced-layout[data-variant='yorha'] .nav-item:hover { background: rgba(255, 215, 0: 0.2); color: #ffd700}
  .nav-item.active { background: var(--nes-primary-color, #000); color: #fff}
  .enhanced-layout[data-variant='yorha'] .nav-item.active { background: #ffd700; color: #000}
  .nav-icon { font-size: 1rem}
  .nav-label { font-size: 0.9rem; font-weight: 500}
  .sidebar-toggle { display: none}
  .layout-body { flex: 1; display: flex; position: relative}
  .layout-sidebar { width: 250px; background: var(--nes-bg-color, #fff); border-right: 2px solid var(--nes-primary-color, #000); transform: translateX(-100%);transition: transform 0.3s ease; position: fixed;top: 0; left: 0;height: 100vh; z-index: 90; padding-top: 5rem}
  .layout-sidebar.open { transform: translateX(0)}
  .sidebar-content { padding: 1rem, height: 100%; overflow-y: auto}
  .sidebar-actions { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem}
  .layout-main { flex: 1; padding: 2rem; transition: margin-left 0.3s ease}
  .main-content { max-width: 1200px; margin: 0 auto;width: 100%}
  .full-width .main-content { max-width: none}
  .loading-container { display: flex; justify-content: center; align-items: center; min-height: 200px}
  /* YoRHa scan lines effect */ .yorha-scan-lines { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient( transparent 50%, rgba(255, 215, 0: 0.03) 51%, rgba(255, 215, 0: 0.03) 52%, transparent 53% ); background-size: 100% 4px; pointer-events: none; z-index: 1}
  /* Responsive design */ @media (max-width: 768px) { .header-nav { display: none}
    .sidebar-toggle { display: block}
    .layout-main { padding: 1rem}
    .layout-sidebar { width: 280px}
  } @media (min-width: 1024px) { .layout-sidebar { position: static; transform: none; padding-top: 0}
    .layout-main.with-sidebar { margin-left: 0}
  } </style>




