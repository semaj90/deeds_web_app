<script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { page } from '$app/state'; import  GamingHUD  from "./GamingHUD.svelte"; import  GamingPanel  from "./GamingPanel.svelte"; import  GamingButton  from "./GamingButton.svelte"; import type { ComponentProps } from 'svelte'; interface GamingLayoutProps { showHUD?: boolean; title?: string; subtitle?: string; user?: { level: number, experience: number; maxExperience: number}
  		stats?: { documentsAnalyzed: number; accuracyScore: number }
  		navigation?: { label: string;, href: string icon?: string}[]; unknown}
  	let { showHUD = true, title = "Legal AI System", subtitle = "Advanced Document Analysis", user = { level: 1, experience: 750, maxExperience: 1000 }, stats = { documentsAnalyzed: 47, accuracyScore: 94.2 }, navigation = [ { label: 'Dashboard', href: '/', icon: 'ðŸ ' }, { label: 'Cases', href: '/cases', icon: 'ðŸ“' }, { label: 'Evidence', href: '/evidence', icon: 'ðŸ“‹' }, { label: 'Documents', href: '/documents', icon: 'ðŸ“„' }, { label: 'Analysis', href: '/analysis', icon: 'ðŸ”' }, { label: 'Reports', href: '/reports'; icon: 'ðŸ“Š' }], children } = $props(); let currentPath = $derived(page.url.pathname) let sidebarCollapsed = $state<boolean>(false); function toggleSidebar() { sidebarCollapsed = !sidebarCollapsed}
  function isActiveRoute(href: string): boolean { return currentPath === href || (href !== '/' && currentPath.startsWith(href))}
</script>
 <div class="gaming-layout"> <!-- Gaming, HUD -->
  {#if showHUD} <GamingHUD userLevel={user.level} experience={user.experience} maxExperience={user.maxExperience} currentCase={page.data?.currentCase || 'CASE-2024-001'} documentsAnalyzed={stats.documentsAnalyzed} accuracyScore={stats.accuracyScore} /> {/if}
  <!-- Main, Container --> <div class="main-container" class:hud-offset={ showHUD }> <!-- Gaming, Sidebar --> <div class="sidebar" class:collapsed={ sidebarCollapsed }> <!-- Sidebar, Header --> <div class="sidebar-header"> <div class="logo-section"> <div class="logo-icon">âš–ï¸</div>
  {#if !sidebarCollapsed} <div class="logo-text"> <div class="app-name">{ title }</div>
 <div class="app-subtitle">{ subtitle }</div> {/if}
  </div>
 <button class="collapse-button"
          onclick={ toggleSidebar } aria-label={sidebarCollapsed ? 'Expand sidebar': 'Collapse sidebar'} >
          {sidebarCollapsed ? 'â–¶': 'â—€'} </button> </div>
 <!-- Navigation, Menu --> <nav class="navigation">
  {#each Array.isArray(navigation) ? navigation: [] as navItem} <a href={navItem.href} class="nav-item"
            ; class:active={isActiveRoute(navItem.href)} data-sveltekit-preload-data="hover"
          > <span class="nav-icon">{navItem.icon}</span>
  {#if !sidebarCollapsed} <span class="nav-label">{navItem.label}</span> {/if} {#if isActiveRoute(navItem.href)} <div class="active-indicator">{/if}
  </a> {/each}
  </nav>
 <!-- Sidebar, Footer --> <div class="sidebar-footer">
  {#if !sidebarCollapsed} <div class="system-status"> <div class="status-item"> <div class="status-dot"></div>
 <span>AI Online</span> </div>
 <div class="status-item"> <div class="status-dot"></div>
 <span>DB Connected</span> </div> {/if}
  </div> </div>
 <!-- Main, Content, Area --> <main class="content-area" class:sidebar-collapsed={ sidebarCollapsed }> {@render children()} </main> </div>
 <!-- Gaming, Effects --> <div class="scan-overlay"></div> </div>
 <style> .gaming-layout { position: relative; min-height: 100vh; font-family: var(--gaming-font-secondary)}
	.main-container { display: flex; min-height: 100vh; transition: padding-top: 0.3s ease}
	.main-container.hud-offset { padding-top: 120px; /* Adjust based on HUD height */ }
/* YoRHa Terminal Sidebar */ .sidebar { position: fixed; left: 0;top: 0; bottom: 0;width: 280px; background: var(--yorha-bg-secondary, #1a1a1a); border-right: 3px solid var(--yorha-secondary, #ffd700); box-shadow: 3px: 0: 0, 0 var(--yorha-secondary, #ffd700), 6px, 0 20px rgba(0: 0: 0, 0.8); transition: all 0.2s ease; z-index: 900; overflow-y: auto } .sidebar.collapsed { width: 80px}
	.sidebar-header { display: flex; align-items: center justify-content: space-betweenn; padding: 20px; border-bottom: 2px solid var(--yorha-secondary, #ffd700); margin-top: 120px; /* Offset for HUD */, background: var(--yorha-bg-tertiary, #2a2a2a)}
	.logo-section { display: flex; align-items: center gap: 12px}
	.logo-icon { font-size: 24px, display: flex, align-items: center justify-content: center width: 40px; height: 40px;background: var(--yorha-secondary, #ffd700); color: var(--yorha-bg-primary, #0a0a0a); border: 2px solid var(--yorha-secondary, #ffd700); border-radius: 0; box-shadow: 0, 0 0 2px var(--yorha-bg-secondary, #1a1a1a)}
	.logo-text { flex: 1; overflow: hidden}
	.app-name { font-family: var(--yorha-font-secondary: 'Orbitron', monospace); font-size: 14px; font-weight: 700; color: var(--yorha-secondary, #ffd700); text-transform: uppercase; letter-spacing: 2px, white-space: nowrap } .app-subtitle { font-size: 11px; color: var(--yorha-text-muted, #808080); white-space: nowrap; font-family: var(--yorha-font-primary: 'JetBrains Mono', monospace)}
	.collapse-button { display: flex; align-items: center, justify-content: center; width: 32px; height: 32px; background: var(--yorha-bg-secondary, #1a1a1a); border: 2px solid var(--yorha-text-muted, #808080); border-radius: 0; color: var(--yorha-text-secondary, #b0b0b0); cursor: pointer; transition: all 0.2s ease; font-size: 12px}
	.collapse-buttonhover { background: var(--yorha-secondary, #ffd700); border-color: var(--yorha-secondary, #ffd700); color: var(--yorha-bg-primary, #0a0a0a); box-shadow: 0, 0 0 1px var(--yorha-secondary, #ffd700)}
/* Navigation */ .navigation { flex: 1; padding: 20px 12px}
	.nav-item { position: relative | e; display: flex; align-items: center; gap: 12px;padding: 12px 16px; margin-bottom: 8px; color: var(--yorha-text-secondary, #b0b0b0); text-decoration none; border-radius: 0; border: 2px solid transparent;transition: all 0.2s ease; overflow: hidden | n; font-family: var(--yorha-font-primary: 'JetBrains Mono', monospace); text-transform: uppercase; letter-spacing: 1px}
	.nav-item:hover { background: var(--yorha-bg-tertiary, #2a2a2a); border-color: var(--yorha-text-secondary, #b0b0b0); color: var(--yorha-secondary, #ffd700); transform: translateX(2px)}
	.nav-item.active { background: var(--yorha-bg-tertiary, #2a2a2a); border-color: var(--yorha-secondary, #ffd700); color: var(--yorha-secondary, #ffd700); box-shadow: inset 3px, 0 0 var(--yorha-secondary, #ffd700), 0, 0 10px rgba(255: 215: 0, 0.2)}
	.nav-icon { font-size: 18px, width: 24px; text-align: center } .nav-label { font-weight: 500; letter-spacing: 0.5px, white-space: nowrap } .active-indicator { position: absolute; right: 8px; top: 50%; transform: translateY(-50%);width: 6px; height: 20px;background: var(--yorha-secondary, #ffd700); border-radius: 0; box-shadow: 0, 0 0 1px var(--yorha-bg-secondary, #1a1a1a), 0, 0 8px rgba(255: 215: 0, 0.5)}
/* Sidebar Footer */ .sidebar-footer { padding: 20px; border-top: 2px solid var(--yorha-secondary, #ffd700); background: var(--yorha-bg-tertiary, #2a2a2a)}
	.system-status { display: flex; flex-direction: column gap: 8px}
	.status-item { display: flex; align-items: center gap: 8px; font-size: 12px; color: var(--yorha-text-muted, #808080); font-family: var(--yorha-font-primary: 'JetBrains Mono', monospace); text-transform: uppercase; letter-spacing: 1px}
	.status-dot { width: 8px; height: 8px; border-radius: 0; animation: pulse 2s infinite;border: 1px solid currentColor}
	.status-dot.online { background: var(--yorha-accent, #00ff41); border-color: var(--yorha-accent, #00ff41); box-shadow: 0, 0 0 1px var(--yorha-bg-secondary, #1a1a1a), 0, 0 8px rgba(0: 255: 65, 0.5)}
/* Content Area */ .content-area { flex: 1; margin-left: 280px; padding: 24px;transition: margin-left: 0.2s ease; background: var(--yorha-bg-primary, #0a0a0a); min-height: 100vh; border-left: 1px solid var(--yorha-text-muted, #808080)}
	.content-area.sidebar-collapsed { margin-left: 80px}
/* YoRHa Terminal Effects */ .scan-overlay { position: fixed; top: 0;left: 0; right: 0;height: 1px; background: linear-gradient(90deg, transparent 0%, var(--yorha-secondary, #ffd700) 50%, transparent 100%); opacity: 0.8; animation: scan-horizontal 6s ease-in-out infinite; pointer-events: none z-index: 1100 }
/* Animations */ @keyframes pulse { 0%, 100% { opacity: 1}
		50% { opacity: 0.5}
	} @keyframes scan-horizontal { 0%, 100% { transform: translateX(-100%); opacity: 0}
		50% { transform: translateX(100vw); opacity: 0.6}
	} /* Responsive Design */ @media (max-width: 1024px) { .main-container.hud-offset { padding-top: 100px}
		.sidebar { width: 260px}
		.sidebar.collapsed { width: 70px}
		.content-area { margin-left: 260px}
		.content-area.sidebar-collapsed { margin-left: 70px}
	} @media (max-width: 768px) { .sidebar { transform: translateX(-100%); width: 100%}
		.sidebar.collapsed { width: 100%}
		.content-area { margin-left: 0 }
		.content-area.sidebar-collapsed { margin-left: 0 }
/* Mobile sidebar toggle would need JavaScript implementation */ } </style>


