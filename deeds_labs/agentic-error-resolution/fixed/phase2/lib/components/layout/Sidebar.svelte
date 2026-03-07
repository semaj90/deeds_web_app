<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { page  } from '$app/stores';
  import  Button  from "$lib/components/ui/bits/Button.svelte";
  import type { applyConsolePalette, type ConsolePaletteName  } from '$lib/themes/retro-console-palettes';
  interface User {
    id: string;
    name?: string;
    email?: string;
    role?: string;
  }
  interface Props {
    open?: boolean;
    user?: User;
    theme?: ConsolePaletteName;
  }
  let { open = $bindable(false), user, theme = 'legal' }: Props = $props();
  import type { cn  } from '$lib/utils';
  import type { BarChart3, Bot, Briefcase, ChevronRight, FileBarChart, FileText, Home, Layers, Plus, Scale, Search, Settings  } from 'lucide-svelte';
  import type { onMount  } from 'svelte';
  let mounted = $state(false);
  $effect(() => {
    mounted = true;
  });
  let currentPath = $derived($page.url.pathname);
  let isAdmin = $derived(user?.role === 'admin');
  type NavigationItem = {
    name: string;
    href: string;
    icon: any;
    current: boolean;
    badge?: string;
  };
  let navigation = $derived([
    { name: '🎮 Command Center', href: '/dashboard', icon: Home, current: currentPath === '/' || currentPath === '/dashboard', badge: 'HQ' },
    { name: '⚖️ Case Management', href: '/cases', icon: Briefcase, current: currentPath.startsWith('/cases'), badge: 'ACTIVE' },
    { name: '🗃️ Evidence Vault', href: '/evidence', icon: FileText, current: currentPath.startsWith('/evidence'), badge: '12 New' },
    { name: '🤖 AI Counsel', href: '/ai', icon: Bot, current: currentPath.startsWith('/ai'), badge: 'AI' },
    { name: '📋 Document Analysis', href: '/documents', icon: FileBarChart, current: currentPath.startsWith('/documents') },
    { name: '🔍 Legal Research', href: '/research', icon: Search, current: currentPath.startsWith('/research') },
    { name: '⏱️ Case Timeline', href: '/timeline', icon: Layers, current: currentPath.startsWith('/timeline') },
  ]);
  let analytics = $derived([
    { name: '📊 Analytics Hub', href: '/analytics', icon: BarChart3, current: currentPath.startsWith('/analytics') },
    { name: '📋 Reports', href: '/reports', icon: FileBarChart, current: currentPath.startsWith('/reports') },
  ]);
  let adminFeatures = $derived([
    { name: '🔧 Admin Console', href: '/admin', icon: Settings, current: currentPath.startsWith('/admin'), badge: 'ADMIN' },
  ]);
  let settings = $derived([
    { name: '⚙️ Settings', href: '/settings', icon: Settings, current: currentPath.startsWith('/settings') },
  ]);
  function closeSidebar() {
    open = $state(false);
  }
</script>
<!-- Mobile backdrop -->
{#if open}
  <button class="fixed inset-0 z-40 bg-black/50 lg:hidden" onclick={closeSidebar} aria-label="Close sidebar"></button>
{/if}
<!-- Sidebar -->
<aside
  class={cn(
    'fixed top-0 left-0 z-50 h-full w-64 transform bg-nier-surface border-r border-nier-gray transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0',
    open ? 'translate-x-0' : '-translate-x-full'
  )}
>
  <div class="flex h-full flex-col">
    <!-- Logo section -->
    <div class="flex h-16 items-center border-b border-nier-gray px-6">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-crimson-gradient rounded-md flex items-center justify-center nier-glow">
          <Scale class="h-5 w-5 text-white" />
        </div>
        <div class="flex-1">
          <h1 class="text-sm font-semibold text-foreground">Legal AI Platform</h1>
          <p class="text-xs nes-text is-disabled">
            {theme?.toUpperCase()} Console Mode
          </p>
        </div>
        <div class="text-xs bg-console-primary text-console-bg px-2 py-1 rounded">
          {theme?.toUpperCase()}
        </div>
      </div>
    </div>
    <!-- User Info Section -->
    {#if user}
      <div class="flex items-center gap-3 p-4 border-b border-nier-gray bg-nier-surface-light">
        <div class="w-10 h-10 bg-console-primary rounded-full flex items-center justify-center">
          <span class="text-console-bg font-bold">👤</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-foreground truncate">
            {user.name || user.email}
          </p>
          <p class="text-xs nes-text is-disabled">
            {user.role || 'Legal Professional'}
          </p>
        </div>
        {#if isAdmin}
          <div class="text-xs bg-console-error text-white px-2 py-1 rounded">ADMIN{/if}
      {/if}
    <!-- Quick actions -->
    <div class="p-4 border-b border-nier-gray">
      <div class="grid grid-cols-2 gap-2">
        <button class="nes-btn is-primary justify-start bits-btn bits-btn">
          <Plus class="mr-2 h-4 w-4" />
          New Case
        </button>
        <Button variant="ghost" size="sm" class="justify-start bits-btn bits-btn">
          <Search class="mr-2 h-4 w-4" />
          Search
        </Button>
      </div>
    </div>
    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto py-4">
      <div class="px-3 space-y-1">
        <!-- Main navigation -->
        <div class="space-y-1">
          {#each Array.isArray(navigation) ? navigation : [] as item}
            {@const IconComponent = item.icon}
            <a
              href={item.href}
              class={cn(
                'group flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 whitespace-nowrap',
                item.current
                  ? 'bg-harvard-crimson text-white shadow-nier-glow'
                  : 'text-muted-foreground hover:text-foreground hover:bg-nier-surface-light'
              )}
              onclick={closeSidebar}
              title={item.name}
            >
              <IconComponent
                class={cn(
                  'h-5 w-5 flex-shrink-0',
                  item.current ? 'text-white' : 'text-muted-foreground group-hover:text-foreground'
                )}
              />
              <span class="flex-1 min-w-0 truncate">{item.name}</span>
              {#if item.badge}
                <span
                  class={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0',
                    item.current ? 'bg-white/20 text-white' : 'bg-harvard-crimson text-white'
                  )}
                >
                  {item.badge}
                </span>
              {/if}
              {#if item.current}
                <ChevronRight class="h-4 w-4 text-white flex-shrink-0" />
              {/if}
            </a>
          {/each}
        </div>
        <!-- Analytics section -->
        <div class="pt-4">
          <h3 class="px-3 text-xs font-semibold nes-text is-disabled uppercase tracking-wider">Analytics</h3>
          <div class="mt-2 space-y-1">
            {#each Array.isArray(analytics) ? analytics : [] as item}
              {@const IconComponent = item.icon}
              <a
                href={item.href}
                class={cn(
                  'group flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200',
                  item.current
                    ? 'bg-harvard-crimson text-white shadow-nier-glow'
                    : 'text-muted-foreground hover:text-foreground hover:bg-nier-surface-light'
                )}
                onclick={closeSidebar}
                title={item.name}
              >
                <IconComponent
                  class={cn(
                    'h-5 w-5 flex-shrink-0',
                    item.current ? 'text-white' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                <span class="flex-1 min-w-0 truncate">{item.name}</span>
              </a>
            {/each}
          </div>
        </div>
        <!-- Admin section -->
        {#if isAdmin}
          <div class="pt-4">
            <h3 class="px-3 text-xs font-semibold nes-text is-disabled uppercase tracking-wider">🛡️ Administration</h3>
            <div class="mt-2 space-y-1">
              {#each Array.isArray(adminFeatures) ? adminFeatures : [] as item}
                {@const IconComponent = item.icon}
                <a
                  href={item.href}
                  class={cn(
                    'group flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200',
                    item.current
                      ? 'bg-console-error text-white shadow-nier-glow'
                      : 'text-muted-foreground hover:text-foreground hover:bg-nier-surface-light border border-console-error/20'
                  )}
                  onclick={closeSidebar}
                  title={item.name}
                >
                  <IconComponent
                    class={cn(
                      'h-5 w-5 flex-shrink-0',
                      item.current ? 'text-white' : 'text-console-error group-hover:text-foreground'
                    )}
                  />
                  <span class="flex-1 min-w-0 truncate">{item.name}</span>
                  {#if item.badge}
                    <span
                      class={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0',
                        item.current ? 'bg-white/20 text-white' : 'bg-console-error text-white'
                      )}
                    >
                      {item.badge}
                    </span>
                  {/if}
                </a>
              {/each}
            </div>
          {/if}
        <!-- Settings section -->
        <div class="pt-4">
          <h3 class="px-3 text-xs font-semibold nes-text is-disabled uppercase tracking-wider">⚙️ System</h3>
          <div class="mt-2 space-y-1">
            {#each Array.isArray(settings) ? settings : [] as item}
              {@const IconComponent = item.icon}
              <a
                href={item.href}
                class={cn(
                  'group flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200',
                  item.current
                    ? 'bg-console-primary text-console-bg shadow-nier-glow'
                    : 'text-muted-foreground hover:text-foreground hover:bg-nier-surface-light'
                )}
                onclick={closeSidebar}
                title={item.name}
              >
                <IconComponent
                  class={cn(
                    'h-5 w-5 flex-shrink-0',
                    item.current ? 'text-console-bg' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                <span class="flex-1 min-w-0 truncate">{item.name}</span>
              </a>
            {/each}
          </div>
        </div>
      </div>
    </nav>
    <!-- Status indicator -->
    <div class="p-4 border-t border-nier-gray">
      <div class="flex items-center gap-3 p-3 bg-nier-surface-light rounded-md">
        <div class="w-3 h-3 bg-console-primary rounded-full animate-nier-pulse"></div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-foreground">🎮 Console Status</p>
          <p class="text-xs nes-text is-disabled truncate">
            {theme?.toUpperCase()} mode - All systems online
          </p>
        </div>
        <div class="text-xs bg-console-primary text-console-bg px-2 py-1 rounded font-mono">PWR</div>
      </div>
    </div>
  </div>
</aside>
<style>
  /* @unocss-include */
  /* Gaming console aesthetic with console variable support */
  aside {
    background: var(--console-gradient-sidebar, linear-gradient(180deg, #0f0f23, #1a1a2e));
    border-right: 2px solid var(--console-primary, #00aa00);
  }
  .nier-glow {
    box-shadow: 0 0 10px var(--console-primary, rgba(0, 170, 0, 0.3));
  }
  .bg-crimson-gradient {
    background: var(--console-primary, #00aa00);
  }
  .bg-console-primary {
    background: var(--console-primary, #00aa00);
  }
  .text-console-bg {
    color: var(--console-bg, #0f0f23);
  }
  .text-console-error {
    color: var(--console-error, #ff5555);
  }
  .bg-console-error {
    background: var(--console-error, #ff5555);
  }
  /* Gaming-themed animations */
  @keyframes nier-pulse {
    0%,
    100% {
      opacity: 1;
      box-shadow: 0 0 5px var(--console-primary, #00aa00);
    }
    50% {
      opacity: 0.6;
      box-shadow: 0 0 10px var(--console-primary, #00aa00);
    }
  }
  .animate-nier-pulse {
    animation: nier-pulse 2s infinite;
  }
  /* Console-themed scrollbar */
  nav::-webkit-scrollbar {
    width: 4px;
  }
  nav::-webkit-scrollbar-track {
    background: transparent;
  }
  nav::-webkit-scrollbar-thumb {
    background: var(--console-primary, #00aa00);
    border-radius: 2px;
  }
  /* Gaming button styles */
  .nes-btn {
    background: var(--console-primary, #00aa00);
    color: var(--console-bg, #0f0f23);
    border: 2px solid var(--console-primary, #00aa00);
  }
  .nes-btn:hover {
    background: var(--console-bg, #0f0f23);
    color: var(--console-primary, #00aa00);
  }
  /* Console theme badges */
  .console-badge {
    background: var(--console-primary, #00aa00);
    color: var(--console-bg, #0f0f23);
    font-family: 'Courier New', monospace;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  /* Responsive adjustments for gaming theme */
  @media (max-width: 768px) {
    .sidebar {
      width: 100%;
      max-width: 320px;
    }
  }
  @media (min-width: 1024px) {
    aside {
      position: relative;
      transform: none;
      transition: width: 0.3s ease;
    }
    aside:not(.open) {
      width: 80px;
    }
    aside:not(.open) .truncate-on-collapse {
      opacity: 0;
      pointer-events: none;
    }
  }
</style>
