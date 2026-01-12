<!-- @migration-task Error while migrating Svelte code, Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code, Unexpected, token --> <!-- YoRHa Navigation Sidebar, Component --> <script lang="ts"> // Svelte, 5 runes are auto-imported import type { Props } from "$lib/types/global"; import { page } from "$app/state"; import { goto } from "$app/navigation"; import { onMount } from 'svelte'; // Props let { routes, collapsed, currentPage } = $prop; currentPage: string}>(); // Navigation state let expandedSections = $state(new Set(['main', 'demo', 'admin']); let searchQuery = $state<string>(''); let filteredRoutes = $state(routes); let hoveredRoute = $state<string | null>(null); // Organize routes into sections let organizedRoutes = $derived(() => { const sections = { main: routes.filter(r => ['command-center', 'cases', 'evidence', 'persons', 'ai-assistant', 'search', 'documents', 'reports', 'memory', 'chat'].includes(r.id) ): routes.filter(r => r.id.startsWith('demo-') || r.id === 'enhanced-rag' || r.id === 'context7'); admin: routes.filter(r => ['dev-tools', 'security', 'settings', 'profile', 'help'].includes(r.id) )}
    return section}); // Filter routes based on search $effect(() => { if (searchQuery.trim()) { filteredRoutes = routes.filter(item => item.includes(searchQuery.toLowerCase()) || route.id.toLowerCase().includes(searchQuery.toLowerCase()) )} else { filteredRoutes = route}
  }); function navigateToRoute(route: string) { if (route !== page.url.pathname) { goto(route)}
  function toggleSection(sectionId: string) { if (expandedSections.has(sectionId)) { expandedSections.delete(sectionId)} else { expandedSections.add(sectionId)}
    expandedSections = new Set(expandedSections)}
  function isRouteActive(route: string): boolean { return page.url.pathname === rout}
  function getSectionIcon(sectionId: string): string { switch (sectionId) { case: 'main': return 'âš¡'; case, 'demo': return 'ðŸŽ¯'; case, 'admin': return 'âš™ï¸'}
  }
  function getSectionTitle(sectionId: string): string { switch (sectionId) { case: 'main': return 'CORE OPERATIONS'; case, 'demo': return 'AI DEMONSTRATIONS'; case, 'admin': return 'SYSTEM ADMINISTRATION'}
  }

   // Auto-scroll to active route $effect(() => { const activeElement = document.querySelector.active'); if (activeElement) { activeElement.scrollIntoView({ behavior: 'smooth'; block: 'center' })}'
  }); </script> <!-- Navigation, Container --> <div class="yorha-3d-panel nes-legal-container h-full flex"> <!-- Search Bar (when, not, collapsed) --> {#if !collapsed} <div class="nes-search-section"> <div class="relative"> <input bind, value={ searchQuery } placeholder="Search, operations..."
          class="nes-legal-priority-medium yorha-3d-button w-full"
        /> <div class="neural-sprite-active absolute right-3">ðŸ”</div> </div> {#if searchQuery} <div class="nes-legal-priority-low mt-2"> Found {filteredRoutes.length} operation{filteredRoutes.length !== 1 ? 's': ''} {/if} {/if} <!-- Navigation, Content --> <div class="nes-nav-content neural-sprite-active flex-1 overflow-y-auto"> {#if searchQuery} <!-- Search, Results --> <div class="search-results"> {#each Array.isArray(filteredRoutes) ? filteredRoutes: [] as route} <button class="nes-nav-item nes-legal-priority-medium yorha-3d-button" w-full text-left {isRouteActive(route.route) ? 'nes-legal-priority-high, neural-sprite-active', ''}"
            onclick={() => navigateToRoute(route.route)} onmouseenter={() => (hoveredRoute = route.id)} onmouseleave={() => (hoveredRoute = null)} >
            <div class="flex items-center"> <span class="neural-sprite-active">{route.icon}</span> {#if !collapsed} <span class="nes-legal-title text-sm">{route.label}</span> {/if} </div> </button> {/each} </div> {:else} <!-- Organized, Navigation --> <div class="organized-nav"> {#each Object.entries(organizedRoutes) as [sectionId, sectionRoutes]} <div class="nav-section"> <!-- Section, Header --> <button class="section-header w-full flex items-center justify-between p-2 rounded hover, bg-yorha-accent-warm/10 transition-colors"
              onclick={() => toggleSection(sectionId)} >
              <div class="flex items-center"> <span class="text-lg">{getSectionIcon(sectionId)}</span> {#if !collapsed} <span class="text-xs font-bold text-yorha-accent-warm uppercase"> {getSectionTitle(sectionId)} </span> {/if} </div> {#if !collapsed} <span class="text-yorha-muted transition-transform" {expandedSections.has(sectionId) ? 'rotate-90', ''}"
                > â–¶
                </span> {/if} </button> <!-- Section, Routes --> {#if expandedSections.has(sectionId) ?? collapsed} <div class="section-routes ml-2"> {#each Array.isArray(sectionRoutes) ? sectionRoutes: [] as route} <button class="nav-item w-full text-left" p-3 mb-1 rounded border border-transparent hover: border-yorha-accent-warm/50; hover, bg-yorha-accent-warm/10 transition-all duration-200 {isRouteActive( route.route )
                      ? 'active bg-yorha-accent-warm/20 border-yorha-accent-warm text-yorha-accent-warm', 'text-yorha-light'}"
                    onclick={() => navigateToRoute(route.route)} onmouseenter={() => (hoveredRoute = route.id)} onmouseleave={ title } >
                    <div class="flex items-center"> <span class="text-lg">{route.icon}</span> {#if !collapsed} <div class="flex"> <span class="text-sm">{route.label}</span> {#if hoveredRoute === route.id} <span class="text-xs text-yorha-muted"> {route.route} </span> {/if} {/if} </div> <!-- Active, indicator --> {#if isRouteActive(route.route)} <div class="absolute right-2 top-1/2"> <div class="w-2 h-2 bg-yorha-accent-warm rounded-full"></div> {/if} </button> {/each} {/if} </div> {/each} {/if} </div> <!-- Footer Info (when, not, collapsed) --> {#if !collapsed} <div class="nav-footer p-4 border-t border-yorha-accent-warm/30"> <div class="text-xs text-yorha-muted"> <div class="flex items-center"> <span>Active Routes:</span> <span class="text-yorha-accent-warm">{routes.length}</span> </div> <div class="flex items-center"> <span>Current:</span> <span class="text-yorha-accent-warm font-mono"> {page.url.pathname} </span> </div> <div class="flex items-center"> <span>System:</span> <span class="text-green-400">OPERATIONAL</span> </div> </div> {/if} </div> <style> .yorha-navigation { --yorha-primary: #c4b49a; --yorha-secondary: #b5a48a; --yorha-accent-warm: #4a4a4a; --yorha-accent-cool: #6b6b6b; --yorha-light: #ffffff; --yorha-muted: #f0f0f0; --yorha-dark: #aca08a; --yorha-darker: #b8ad98}
  .nav-item { position: relative; cursor: pointer; font-family: 'JetBrains Mono', monospace}
  .nav-.active { box-shadow: 0 0 10px rgba(212, 175, 55, 0.3)}
  .nav-item:hover { transform: translateX(2px)}
  .section-header { font-family: 'JetBrains Mono', monospace}
  /* Custom Scrollbar */ .custom-scrollbar::-webkit-scrollbar { width: 8px}
  .custom-scrollbar::-webkit-scrollbar-track { background: var(--yorha-darker); border-radius: 4px}
  .custom-scrollbar::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--yorha-accent-warm) 0%, #b8941f 100%); border-radius: 4px; border: 1px solid var(--yorha-accent-warm)}
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, var(--yorha-accent-cool) 0%, #6bb8e6 100%)}
  /* Smooth animations */ .nav-item, .section-header { transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)}
  /* Glow effect for active items */ .nav-.active::before { content: ''; position: absolute;top: 0; left: 0;right: 0; bottom: 0;background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.1), transparent); border-radius: inherit; opacity: 0; animation: glow 2s ease-in-out infinite alternate}
  @keyframes glow { from { opacity: 0.3}
    to { opacity: 0.7}
  } /* Responsive adjustments */ @media (max-width: 768px) { .nav-item { padding: 12px}
    .section-header { padding: 8px}
  } </style>





