<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  interface Route {
    id: string;
    route: string;
    label: string;
    icon: string;
  }

  let {
    routes = [],
    collapsed = false
  }: {
    routes: Route[];
    collapsed: boolean;
  } = $props();

  // Navigation state
  let expandedSections = $state(new Set(['main', 'demo', 'admin']));
  let searchQuery = $state('');
  let hoveredRoute = $state<string | null>(null);

  // Organize routes into sections
  const organizedRoutes = $derived.by(() => {
    const sections: Record<string, Route[]> = {
      main: routes.filter(r => ['command-center', 'cases', 'evidence', 'persons', 'ai-assistant', 'search', 'documents', 'reports', 'memory', 'chat'].includes(r.id)),
      demo: routes.filter(r => r.id.startsWith('demo-') || r.id === 'enhanced-rag' || r.id === 'context7'),
      admin: routes.filter(r => ['dev-tools', 'security', 'settings', 'profile', 'help'].includes(r.id))
    };
    return sections;
  });

  const filteredRoutes = $derived.by(() => {
    if (!searchQuery.trim()) return routes;
    const q = searchQuery.toLowerCase();
    return routes.filter(r =>
      r.label.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      r.route.toLowerCase().includes(q)
    );
  });

  function navigateToRoute(route: string) {
    if (route !== page.url.pathname) {
      goto(route);
    }
  }

  function toggleSection(sectionId: string) {
    if (expandedSections.has(sectionId)) {
      expandedSections.delete(sectionId);
    } else {
      expandedSections.add(sectionId);
    }
    expandedSections = new Set(expandedSections);
  }

  function isRouteActive(route: string): boolean {
    return page.url.pathname === route;
  }

  function getSectionIcon(sectionId: string): string {
    switch (sectionId) {
      case 'main': return '⚡';
      case 'demo': return '🎯';
      case 'admin': return '⚙️';
      default: return '📁';
    }
  }

  function getSectionTitle(sectionId: string): string {
    switch (sectionId) {
      case 'main': return 'CORE OPERATIONS';
      case 'demo': return 'AI SYSTEMS';
      case 'admin': return 'SYSTEM ADMIN';
      default: return 'SECTION';
    }
  }
</script>

<div class="h-full flex flex-col bg-slate-900 border-r border-slate-800">
  <!-- Search Bar -->
  {#if !collapsed}
    <div class="p-4">
      <div class="relative">
        <input
          bind:value={searchQuery}
          placeholder="Search menu..."
          class="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
        />
        <div class="absolute right-3 top-2.5 text-slate-500">🔍</div>
      </div>
    </div>
  {/if}

  <!-- Navigation Content -->
  <div class="flex-1 overflow-y-auto custom-scrollbar p-2">
    {#if searchQuery}
      <!-- Search Results -->
      <div class="space-y-1">
        {#each filteredRoutes as route}
          <button
            class="w-full flex items-center gap-3 p-2 rounded transition-colors text-left {isRouteActive(route.route) ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:bg-slate-800'}"
            onclick={() => navigateToRoute(route.route)}
          >
            <span class="text-lg">{route.icon}</span>
            {#if !collapsed}
              <span class="text-sm font-medium">{route.label}</span>
            {/if}
          </button>
        {/each}
      </div>
    {:else}
      <!-- Organized Sections -->
      <div class="space-y-4">
        {#each Object.entries(organizedRoutes) as [sectionId, sectionRoutes]}
          <div class="space-y-1">
            <button
              class="w-full flex items-center justify-between p-2 rounded hover:bg-slate-800 transition-colors group"
              onclick={() => toggleSection(sectionId)}
            >
              <div class="flex items-center gap-2">
                <span class="text-base">{getSectionIcon(sectionId)}</span>
                {#if !collapsed}
                  <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-slate-300">
                    {getSectionTitle(sectionId)}
                  </span>
                {/if}
              </div>
              {#if !collapsed}
                <span class="text-[10px] text-slate-600 transition-transform {expandedSections.has(sectionId) ? 'rotate-90' : ''}">
                  ▶
                </span>
              {/if}
            </button>

            <!-- Section Routes -->
            {#if expandedSections.has(sectionId) || collapsed}
              <div class="space-y-1 {collapsed ? '' : 'ml-2'}">
                {#each sectionRoutes as route}
                  <button
                    class="w-full relative flex items-center gap-3 p-2 rounded transition-all group text-left {isRouteActive(route.route) ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'text-slate-400 hover:bg-slate-800'}"
                    onclick={() => navigateToRoute(route.route)}
                    onmouseenter={() => (hoveredRoute = route.id)}
                    onmouseleave={() => (hoveredRoute = null)}
                  >
                    <span class="text-lg transition-transform group-hover:scale-110">{route.icon}</span>
                    {#if !collapsed}
                      <span class="text-sm">{route.label}</span>
                    {/if}
                    <!-- Active indicator -->
                    {#if isRouteActive(route.route)}
                      <div class="absolute right-2 w-1 h-3 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.5)]"></div>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Footer -->
  {#if !collapsed}
    <div class="p-4 border-t border-slate-800 bg-slate-900/50">
      <div class="space-y-1 text-[10px] font-mono uppercase tracking-tighter">
        <div class="flex justify-between items-center text-slate-500">
          <span>Active Nodes</span>
          <span class="text-cyan-500">{routes.length}</span>
        </div>
        <div class="flex justify-between items-center text-slate-500">
          <span>System Status</span>
          <span class="text-green-500">Ready</span>
        </div>
      </div>
    </div>
  {/if}
</div> <style> .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
</style>





