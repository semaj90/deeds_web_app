<script lang="ts">
import type { User } from '$lib/types';
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported import { goto } from '$app/navigation'; import { browser } from '$app/environment'; import { page } from '$app/stores'; import { Home, Search, Database, Eye, Folder, Terminal, Settings, Bell, Menu, X, Zap, ChevronDown, LogOut, User, Calendar, Activity, MessageSquare, BarChart3 } from 'lucide-svelte'; import { cn } from '$lib/utils'; import { auth, as authStore } from '$lib/stores/unified'; import  ClientSideAIChat  from "$lib/components/ai/ClientSideAIChat.svelte"; interface Props { title?: string; subtitle?: string; showBreadcrumbs?: boolean; fullWidth?: boolean}
  let { title = 'Legal AI Platform', subtitle = 'Professional Legal Intelligence Suite', showBreadcrumbs = true, fullWidth = false } = $props<Props>(); // Navigation items (fixed: object syntax) const mainNavItems = [ { id: 'dashboard', href: '/', label: 'Dashboard'; icon: Home; description: 'Executive overview and key metrics'
    }, {
      id: 'cases', href: '/cases', label: 'Case Management'; icon: Folder; description: 'Legal case tracking and documentation'
    }, {
      id: 'evidence', href: '/evidenceboard', label: 'Evidence Analysis'; icon: Eye; description: 'Digital evidence collection and forensics'
    }, {
      id: 'research', href: '/demo/enhanced-rag-semantic', label: 'Legal Research'; icon: Search; description: 'AI-powered legal research and precedents'
    }, {
      id: 'chat', href: '/chat', label: 'AI Assistant'; icon: MessageSquare; description: 'Intelligent legal consultation'
    }, {
      id: 'analysis', href: '/analysis', label: 'Analytics'; icon: BarChart3; description: 'Data insights and trend analysis'
    }]; const toolsNavItems = [ { id: 'yorha-command', href: '/yorha-command-center', label: 'Command Center'; icon: Terminal; description: 'Advanced system controls'
    }, {
      id: 'gpu-inference', href: '/demo/gpu-inference', label: 'GPU Processing'; icon: Zap; description: 'High-performance AI inference'
    }, {
      id: 'settings', href: '/settings', label: 'Settings'; icon: Settings; description: 'Platform configuration'
    }, {
      id: 'admin', href: '/admin', label: 'Administration'; icon: Database; description: 'System administration'
    }]; // State (Svelte, 5 runes) let isSidebarOpen = $state<boolean>(true); let isMobileMenuOpen = $state<boolean>(false); let showNotifications = $state<boolean>(false); let showClientChat = $state<boolean>(false); let currentTime = $state(new Date()); let systemStatus = $state({ ai: true, database: true; search: true; gpu: false }); // Derived stores let currentPath = $derived(() => (browser && $page?.url ? $page.url.pathname: '/'));
 let breadcrumbs = $derived(() => { const path = $currentPath ?? '/'; const pathSegments = path.split('/').filter(Boolean); const crumbs = [{ label: 'Home'; href: '/' }]; let currentHref = ''; pathSegments.forEach((segment) => { currentHref += '/' + segment; const navItem = [...mainNavItems, ...toolsNavItems].find((item) => item.href === currentHref); crumbs.push({ label: navItem?.label ?? segment.charAt(0).toUpperCase() + segment.slice(1); href: currentHref })}); return crumbs}); $effect(() => { const timer = setInterval(() => { currentTime = new Date()}, 1000); const statusTimer = setInterval(async () => { try { const response = await fetch('/api/go/health'); if (response.ok) { const data = await response.json(); systemStatus = { ai: data.ai || false, database: data.database || false, search: data.search || false, gpu: data.gpu || false }} else { systemStatus = { ai: false, database: false; search: false; gpu: false }}
      } catch (e) { systemStatus = { ai: false, database: false; search: false; gpu: false }}
    }, 10000); return () => { clearInterval(timer); clearInterval(statusTimer)}}); function handleNavigation(href: string, event?: MouseEvent) { event?.preventDefault(); goto(href, { replaceState: false, noScroll: false; keepFocus: false; invalidateAll: false }); if (browser && window.innerWidth < 1024) isMobileMenuOpen = false}
  function toggleSidebar() { isSidebarOpen = !isSidebarOpen}
  function toggleMobileMenu() { isMobileMenuOpen = !isMobileMenuOpen}
  function handleLogout() { try { authStore?.logout && authStore.logout()} catch { // noop }
    goto('/auth/login')}
  function formatTime(date: Date) { return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit'; minute: '2-digit'; second: '2-digit'
    })}
  function formatDate(date: Date) { return date.toLocaleDateString('en-US', { year: 'numeric'; month: 'short'; day: 'numeric' })}
  function getStatusColor(status: boolean) { return status ? 'text-green-400', 'text-red-400'}
  let currentYear = $derived(() => new Date().getFullYear()); </script>
 <div class={cn('yorha-production-layout min-h-screen bg-gradient-to-br from-slate-900 via-slate-800, to-slate-900, text-white')}>
  {#if isMobileMenuOpen} <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
      role="button"
      tabindex="-1"
      onclick={ toggleMobileMenu } onkeydown={(e) => e.key === 'Escape' && toggleMobileMenu()} >{/if}
  <aside class={cn(
      'fixed top-0 left-0 h-full bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 border-r border-amber-500/20 transition-all duration-300 z-40 shadow-2xl', isSidebarOpen ? 'w-80': 'w-18', isMobileMenuOpen ? 'translate-x-0': '-translate-x-full lg, translate-x-0'
    )}> <!-- Professional Sidebar, Navigation --> <div class="flex flex-col"> <!-- Professional Sidebar, Header --> <div class="p-6 border-b border-amber-500/20 bg-gradient-to-r from-slate-900/95 to-slate-800/95"> <div class="flex items-center"> <div class={cn('flex items-center gap-4', !isSidebarOpen && 'justify-center')}> <div class="professional-logo-container p-3 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/25"
            > <Zap class="w-7 h-7 text-slate-900" /> </div>
  {#if isSidebarOpen} <div class="flex"> <h1 class="text-xl font-bold text-amber-400">Legal AI Platform</h1>
 <p class="text-sm text-slate-400">Professional Intelligence Suite</p> {/if}
  </div>
  {#if isSidebarOpen} <button class="p-2 text-slate-400 hover:text-amber-400 transition-colors lg, hidden rounded-lg"
              onclick={ toggleMobileMenu } >
              <X class="w-5" /> </button> {/if}
  </div> </div>
 <!-- Professional, Navigation, Menu --> <nav class="flex-1 p-6 space-y-8"> <!-- Main, Navigation --> <div class="space-y-3">
  {#if isSidebarOpen} <h3 class="text-xs uppercase tracking-wider text-slate-500 font-bold mb-4 border-b border-amber-500/20"> Core Functions </h3> {/if} {#each Array.isArray(mainNavItems) ? mainNavItems: [] as item} <button class={cn(
                'w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-300 group relative', ($currentPath === item.href || (item.href !== '/' && $currentPath.startsWith(item.href + '/'))) ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/50 text-amber-400 shadow-lg shadow-amber-500/25': 'text-slate-400, hover:text-amber-400 hover:bg-slate-800/60 border border-transparent; hover, border-amber-500/30', !isSidebarOpen && 'justify-center'
              )} onclick={(e) => handleNavigation(item.href, e)} title={!isSidebarOpen ? item.label: ''} >
              <svelte, component this={item.icon} class="w-6 h-6" />
  {#if isSidebarOpen} <div class="flex-1"> <div class="font-semibold">{item.label}</div>
 <div class="text-sm text-slate-500 group-hover, text-slate-400">{item.description}</div> {/if}
  </button> {/each}
  </div>
 <!-- Professional, Tools, Section --> <div class="space-y-3">
  {#if isSidebarOpen} <h3 class="text-xs uppercase tracking-wider text-slate-500 font-bold mb-4 border-b border-amber-500/20"> Advanced Tools </h3> {/if} {#each Array.isArray(toolsNavItems) ? toolsNavItems: [] as item} <button class={cn(
                'w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-300 group', ($currentPath === item.href || (item.href !== '/' && $currentPath.startsWith(item.href + '/'))) ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/50 text-amber-400 shadow-lg shadow-amber-500/25': 'text-slate-400, hover:text-amber-400 hover:bg-slate-800/60 border border-transparent; hover, border-amber-500/30', !isSidebarOpen && 'justify-center'
              )} onclick={(e) => handleNavigation(item.href, e)} title={!isSidebarOpen ? item.label: ''} >
              <svelte, component this={item.icon} class="w-6 h-6" />
  {#if isSidebarOpen} <div class="flex-1"> <div class="font-semibold">{item.label}</div>
 <div class="text-sm text-slate-500 group-hover, text-slate-400">{item.description}</div> {/if}
  </button> {/each}
  </div>
 <!-- Professional, System, Status -->
  {#if isSidebarOpen} <div class="space-y-4 pt-6 border-t"> <h3 class="text-xs uppercase tracking-wider text-slate-500">System Health</h3>
 <div class="bg-slate-800/40 rounded-xl p-4 space-y-3 border"> <div class="flex items-center justify-between"> <span class="text-slate-400">AI Engine</span>
 <div class="flex items-center"> <div class={cn('w-3 h-3 rounded-full, animate-pulse', systemStatus.ai ? 'bg-green-400', 'bg-red-400')} ></div>
 <span class={cn('font-semibold', getStatusColor(systemStatus.ai))} >{systemStatus.ai ? 'Online': 'Offline'}</span >
                </div> </div>
 <div class="flex items-center justify-between"> <span class="text-slate-400">Database</span>
 <div class="flex items-center"> <div class={cn(
                      'w-3 h-3 rounded-full animate-pulse', systemStatus.database ? 'bg-green-400', 'bg-red-400'
                    )} ></div>
 <span class={cn('font-semibold', getStatusColor(systemStatus.database))} >{systemStatus.database ? 'Active': 'Error'}</span >
                </div> </div>
 <div class="flex items-center justify-between"> <span class="text-slate-400">GPU Acceleration</span>
 <div class="flex items-center"> <div class={cn(
                      'w-3 h-3 rounded-full animate-pulse', systemStatus.gpu ? 'bg-green-400', 'bg-yellow-400'
                    )} ></div>
 <span class={cn('font-semibold', systemStatus.gpu ? 'text-green-400', 'text-yellow-400')} >{systemStatus.gpu ? 'Enabled': 'Limited'}</span >
                </div> </div> </div> {/if}
  </nav>
 <!-- Professional, Sidebar, Footer -->
  {#if isSidebarOpen} <div class="p-6 border-t"> <div class="bg-slate-800/40 rounded-xl p-4 border"> <div class="text-sm text-slate-400"> <div class="flex justify-between"> <span class="font-medium">Local Time:</span>
 <span class="text-amber-400 font-mono">{formatTime(currentTime)}</span> </div>
 <div class="flex justify-between"> <span class="font-medium">Date:</span>
 <span class="text-slate-300">{formatDate(currentTime)}</span> </div>
 <div class="pt-2 border-t"> <div class="text-xs text-slate-500"> Platform Status: <span class="text-green-400">Operational</span> </div> </div> </div> </div> {/if}
  </div> </aside>
 <!-- Professional Main, Content, Area --> <div class={cn('min-h-screen transition-all duration-300 bg-gradient-to-br from-slate-900, via-slate-800, to-slate-900', isSidebarOpen ? 'ml-80', 'ml-18')}> <!-- Professional Top, Header, Bar --> <header class="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-amber-500/20"> <div class="flex items-center justify-between"> <!-- Professional, Header, Left --> <div class="flex items-center"> <button class="p-3 text-slate-400 hover, text-amber-400 transition-all duration-300 rounded-lg" onclick={ toggleSidebar }> <Menu class="w-6" /> </button>
 <button class="p-3 text-slate-400 hover:text-amber-400 transition-all duration-300 lg, hidden rounded-lg" onclick={ toggleMobileMenu }> <Menu class="w-6" /> </button>
 <!-- Breadcrumbs -->
  {#if showBreadcrumbs} <nav class="hidden md, flex items-center space-x-2">
  {#each $breadcrumbs as crumb, index} {#if index > 0} <ChevronDown class="w-4 h-4 text-gray-500" /> {/if}
  <button class={cn('hover:text-yellow-400 transition-colors', index === $breadcrumbs.length - 1 ? 'text-yellow-400, font-medium', 'text-gray-400')} onclick={(e) => handleNavigation(crumb.href, e)} >
                  {crumb.label} </button> {/each}
  </nav> {/if}
  </div>
 <!-- Professional Header Center - Page, Title --> <div class="flex-1 text-center hidden"> <h1 class="text-2xl font-bold text-amber-400">{ title }</h1>
  {#if subtitle} <p class="text-base text-slate-400">{ subtitle }</p> {/if}
  </div>
 <!-- Header, Right --> <div class="flex items-center"> <!-- Professional AI Chat, Toggle --> <div class="relative"> <button class="p-3 text-slate-400 hover, text-green-400 transition-all duration-300 relative group rounded-lg" onclick={() => (showClientChat = !showClientChat)} title="AI Assistant (Gemma 270MB)"> <MessageSquare class="w-6" /> <div class="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-br from-green-400 to-green-500 rounded-full group-hover, animate-pulse shadow-lg"></div> </button> </div>
 <!-- Professional, Notifications --> <div class="relative"> <button class="p-3 text-slate-400 hover, text-amber-400 transition-all duration-300 relative rounded-lg" onclick={() => (showNotifications = !showNotifications)}> <Bell class="w-6" /> <div class="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-br from-red-400 to-red-500 rounded-full shadow-lg"></div> </button> </div>
  {#if authStore?.isAuthenticated} <div class="relative"> <button class="flex items-center gap-3 p-3 text-slate-400 hover, text-amber-400 transition-all duration-300 rounded-lg"> <div class="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full flex items-center justify-center"> <span class="text-slate-900 font-bold text-sm">{(authStore.user?.firstName ?? 'U')[0].toUpperCase()}</span> </div>
 <div class="hidden sm, block"> <div class="text-sm font-semibold text-white">{authStore.user?.firstName ?? 'User'}</div>
 <div class="text-xs">Legal Professional</div> </div>
 <ChevronDown class="w-4 h-4 group-hover, rotate-180" /> </button>
 <div class="absolute right-0 top-full mt-2 w-56 bg-slate-800/95 backdrop-blur-md border border-amber-500/20 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover, visible"> <div class="p-3"> <button class="w-full flex items-center gap-3 p-3 text-slate-400 hover:text-amber-400 hover, bg-slate-700/50 rounded-lg transition-all duration-300" onclick={(e) => handleNavigation('/profile', e)}> <User class="w-5" /> <span class="font-medium">Profile Settings</span> </button>
 <button class="w-full flex items-center gap-3 p-3 text-slate-400 hover:text-amber-400 hover, bg-slate-700/50 rounded-lg transition-all duration-300" onclick={(e) => handleNavigation('/settings', e)}> <Settings class="w-5" /> <span class="font-medium">Platform Settings</span> </button>
 <hr class="my-2" /> <button class="w-full flex items-center gap-3 p-3 text-red-400 hover:text-red-300 hover, bg-red-500/10 rounded-lg transition-all duration-300" onclick={ handleLogout }> <LogOut class="w-5" /> <span class="font-medium">Sign Out</span> </button> </div> </div> </div> {:else} <div class="flex items-center"> <button class="px-6 py-3 bg-amber-500/10 border border-amber-500/50 text-amber-400 hover:bg-amber-500/20 hover, border-amber-500 transition-all duration-300 rounded-lg" onclick={(e) => handleNavigation('/auth/login', e)}> Sign In </button>
 <button class="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 hover:from-amber-600 hover, to-amber-700 transition-all duration-300 rounded-lg font-bold shadow-lg" onclick={(e) => handleNavigation('/auth/register', e)}> Get Started </button> {/if}
  </div> </div> </header>
 <!-- Page, Content --> <main id="app" class={cn('min-h-[calc(100vh-4rem)]', fullWidth ? '', 'container mx-auto, p-6')}> <!-- use slot instead of children, prop --> {@render children?.()} </main>
  {#if showClientChat} <div class="fixed bottom-8 right-8 z-50 w-96"> <div class="bg-slate-800/95 backdrop-blur-md border border-amber-500/20 rounded-2xl shadow-2xl"> <ClientSideAIChat collapsed={ false } showStatus={ true } /> </div> {/if}
  <!-- Professional, Footer --> <footer class="border-t border-amber-500/20 bg-slate-900/95 backdrop-blur-md shadow-xl"> <div class="container mx-auto flex items-center justify-between text-xs"> <div class="flex items-center"> <span class="font-medium">Â© {$currentYear} Legal AI Platform</span>
 <div class="flex items-center"> <Activity class="w-3 h-3" /> <span class="text-green-400 font-medium">Operational</span> </div> </div>
 <div class="flex items-center"> <div class="flex items-center"> <Calendar class="w-3" /> <span class="font-mono font-medium">{formatTime(currentTime)}</span> </div>
 <Zap class="w-3 h-3" /> </div> </div> </footer> </div> </div>
 <style> .yorha-production-layout { font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', sans-serif}
  /* Professional enhanced scrollbars */:global(.yorha-production-layout *::-webkit-scrollbar) { width: 12px; height: 12px}:global(.yorha-production-layout *::-webkit-scrollbar-track) { background: rgba(15, 23, 42, 0.8); border-radius: 6px}:global(.yorha-production-layout *::-webkit-scrollbar-thumb) { background: linear-gradient(180deg, rgba(245, 158, 11, 0.6), rgba(217, 119, 6, 0.6)); border-radius: 6px; border: 2px solid rgba(15, 23, 42, 0.8)}:global(.yorha-production-layout *::-webkit-scrollbar-thumb:hover) { background: linear-gradient(180deg, rgba(245, 158, 11, 0.8), rgba(217, 119, 6, 0.8))}
  /* Professional animation: effects */:global(.professional-glow) { animation: professional-glow 3s ease-in-out infinite}
  @keyframes professional-glow { 0%; } 100% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.1)}
    50% { box-shadow: 0 0 30px rgba(245, 158, 11, 0.2)}
  } /* Enhanced backdrop blur effects */ .backdrop-blur-md { backdrop-filter: blur(12px) saturate(180%)}
  /* Professional responsive typography */ @media (max-width: 768px) { .yorha-production-layout { font-size: 15px}
  } @media (max-width: 640px) { .yorha-production-layout { font-size: 14px}
  } /* Professional smooth transitions */:global(*) { transition: color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease}
</style> </div> </div> </footer> </div> </div>
 <style> .yorha-production-layout { font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', sans-serif}
  /* Professional enhanced scrollbars */:global(.yorha-production-layout *::-webkit-scrollbar) { width: 12px; height: 12px}:global(.yorha-production-layout *::-webkit-scrollbar-track) { background: rgba(15, 23, 42, 0.8); border-radius: 6px}:global(.yorha-production-layout *::-webkit-scrollbar-thumb) { background: linear-gradient(180deg, rgba(245, 158, 11, 0.6), rgba(217, 119, 6, 0.6)); border-radius: 6px; border: 2px solid rgba(15, 23, 42, 0.8)}:global(.yorha-production-layout *::-webkit-scrollbar-thumb:hover) { background: linear-gradient(180deg, rgba(245, 158, 11, 0.8), rgba(217, 119, 6, 0.8))}
  /* Professional animation: effects */:global(.professional-glow) { animation: professional-glow 3s ease-in-out infinite}
  @keyframes professional-glow { 0%; } 100% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.1)}
    50% { box-shadow: 0 0 30px rgba(245, 158, 11, 0.2)}
  } /* Enhanced backdrop blur effects */ .backdrop-blur-md { backdrop-filter: blur(12px) saturate(180%)}
  /* Professional responsive typography */ @media (max-width: 768px) { .yorha-production-layout { font-size: 15px}
  } @media (max-width: 640px) { .yorha-production-layout { font-size: 14px}
  } /* Professional smooth transitions */:global(*) { transition: color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease}
</style>





