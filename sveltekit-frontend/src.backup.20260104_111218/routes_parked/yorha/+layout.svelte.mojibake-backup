<!-- YoRHa, Interface, Layout -->
<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { Bot } from "lucide-svelte";
  import { ChevronLeft } from "lucide-svelte";
  import { ChevronRight } from "lucide-svelte";
  import { Cpu } from "lucide-svelte";
  import { Database } from "lucide-svelte";
  import { Monitor } from "lucide-svelte";
  import { Search } from "lucide-svelte";
  import { Terminal } from "lucide-svelte";
  import type { SvelteComponent } from 'svelte';
  import { onMount } from 'svelte';
  import '../../app.css';
 // Added: Top-level type import

  // Add a tiny local constructor type to represent Svelte components without using `import type`:
  type SvelteComponentConstructor = new (...args: any[]) => SvelteComponent; // Changed: Use imported SvelteComponent type

  type NavItem = {
    path: string;
    label: string;
    // Use the local constructor type so the parser doesn't see a top-level `import type` line
    icon?: SvelteComponentConstructor | null;
    description: string;
  };

  // System status and navigation
  let systemStatus = $state({ connected: false, services: 0, errors: 0 });
  let sidebarOpen = $state(false);
  let currentPath = $state('');

  // Navigation structure
  const navItems: NavItem[] = [
    {
      path: '/yorha',
      label: 'Command Center',
      icon: Terminal,
      description: 'Main YoRHa interface hub',
    },
    {
      path: '/yorha/dashboard',
      label: 'System Dashboard',
      icon: Monitor,
      description: 'Live system monitoring',
    },
    {
      path: '/yorha/persons-of-interest',
      label: 'Persons of Interest',
      icon: Search,
      description: 'FugitiveDex POI management',
    },
    {
      path: '/yorha/evidence-board',
      label: 'Evidence Board',
      icon: Database,
      description: 'Drag-and-drop evidence analysis',
    },
    {
      path: '/yorha/components',
      label: 'UI Components',
      icon: Bot,
      description: '3D UI component gallery',
    },
    {
      path: '/yorha/api-test',
      label: 'API Testing',
      icon: Cpu,
      description: 'Live API integration tests',
    },
    {
      path: '/yorha/terminal',
      label: 'Terminal',
      icon: Terminal,
      description: 'YoRHa command terminal',
    },
    {
      path: '/yorha/data-grid',
      label: 'Data Grid',
      icon: Database,
      description: 'Advanced data visualization',
    },
    {
      path: '/yorha/search',
      label: 'Vector Search',
      icon: Search,
      description: 'Semantic search interface',
    },
    { path: '/yorha/chat', label: 'AI Chat', icon: Bot, description: 'Enhanced AI conversation' },
  ];

  // runtime-safe fetch helper (try dynamic JS module first, then fetch API)
  async function fetchYoRhaStatus(): Promise<any | null> {
    try {
      // Cast to any so TypeScript doesn't enforce a specific shape on the imported module.
      const mod = (await import('$lib/components/three/yorha-ui/api/YoRHaAPIClient').catch(
        () => null
      )) as any;
      if (mod) {
        // Named exported function
        if (typeof mod.getSystemStatus === 'function') return await mod.getSystemStatus();

        // Default export function/object
        if (mod?.default && typeof mod.default.getSystemStatus === 'function')
          return await mod.default.getSystemStatus();

        // Class or object export: try static method first, then instance method
        if (mod?.YoRHaAPIClient) {
          const Client = mod.YoRHaAPIClient;
          // If it's a constructor/function, try static then instance
          if (typeof Client === 'function') {
            if (typeof (Client as any).getSystemStatus === 'function') {
              return await (Client as any).getSystemStatus();
            }
            try {
              const instance = new Client();
              if (typeof instance.getSystemStatus === 'function')
                return await instance.getSystemStatus();
            } catch {
              // ignore construction failures and continue to fallback
            }
          } else if (typeof Client.getSystemStatus === 'function') {
            return await Client.getSystemStatus();
          }
        }
      }

      // Fallback to server endpoint
      const resp = await fetch('/api/yorha/status');
      if (resp.ok) return await resp.json();
      return null;
    } catch (err) {
      console.warn('fetchYoRhaStatus error', err);
      return null;
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined') currentPath = window.location.pathname ?? '';

    afterNavigate((nav) => {
      try {
        currentPath =
          nav?.to?.url?.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
      } catch {
        currentPath = '';
      }
    });

    // fetch YoRHa system status (fire-and-forget)
    (async () => {
      try {
        const status = await fetchYoRhaStatus();
        const s = (status ?? {}) as any;
        const services = Array.isArray(s.services)
          ? s.services.length
          : typeof s.serviceCount === 'number'
            ? s.serviceCount
            : typeof s.servicesCount === 'number'
              ? s.servicesCount
              : 0;
        systemStatus = { connected: !!status, services, errors: s.errors ?? 0 };
      } catch (error) {
        console.warn('YoRHa API not available:', error);
        systemStatus.connected = false;
      }
    })();
  });

  // Navigation helpers
  function navigateTo(path: string) {
    sidebarOpen = false;
    goto(path);
  }
  function isActivePath(path: string): boolean {
    if (path === '/yorha') return currentPath === '/yorha';
    return currentPath === path || currentPath.startsWith(path + '/');
  }
  function closeSidebar() {
    sidebarOpen = false;
  }
  function handleSidebarKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      closeSidebar();
    }
  }
</script>

<div class="yorha-layout">
  <header class="yorha-header">
    <div class="yorha-header-content">
      <!-- changed: use onclick (runes) instead of, deprecated; onclick -->
      <button
        class="yorha-menu-toggle"
        aria-label="Open sidebar"
        onclick={() => (sidebarOpen = true)}
      >
        <Terminal size={16} />
      </button>
      <div class="yorha-brand">
        <span class="yorha-brand-icon">
          <Terminal size={32} />
        </span>
        <span class="yorha-brand-title">YoRHa Interface</span>
      </div>
      <div class="yorha-status-bar">
        <div class="yorha-status-item">
          <span class="dot" class:connected={systemStatus.connected} aria-hidden="true"></span>
          {systemStatus.connected ? 'Connected' : 'Disconnected'}
        </div>
        <div class="yorha-status-item">
          Services: {systemStatus.services}
        </div>
        <div class="yorha-status-item">
          Errors: {systemStatus.errors}
        </div>
      </div>
    </div>
  </header>
  <div class="yorha-content">
    <!-- replace illegal $slots use with, standard, slot -->
    <main class="yorha-main">
      <slot />
    </main>
  </div>
  <!-- Overlay & Sidebar (fixed/cleaned attributes) -->
  {#if sidebarOpen}
    <div
      class="yorha-overlay"
      onclick={closeSidebar}
      onkeydown={handleSidebarKeydown}
      role="button"
      tabindex="0"
      aria-label="Close sidebar overlay"
    ></div>

    <div
      class="yorha-sidebar"
      role="dialog"
      aria-label="YoRHa Sidebar"
      class:yorha-sidebar-open={sidebarOpen}
    >
      <nav class="yorha-nav" aria-label="Main navigation">
        <div class="yorha-nav-header">
          <h2>Navigation</h2>
          <button
            class="yorha-sidebar-close"
            aria-label="Close sidebar"
            tabindex="0"
            onclick={closeSidebar}
            onkeydown={handleSidebarKeydown}
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        <ul class="yorha-nav-list">
          {#each navItems ?? [] as item}
            <li class="yorha-nav-item">
              <button
                class="yorha-nav-link"
                onclick={() => navigateTo(item.path)}
                class:yorha-nav-active={isActivePath(item.path)}
                aria-current={isActivePath(item.path) ? 'page' : undefined}
              >
                {#if item.icon}
                  <!-- render icon with svelte:component for dynamic components -->
                  <item.icon size={16} ></icon>
                {/if}
                <div class="yorha-nav-content">
                  <span class="yorha-nav-label">{item.label}</span>
                  <span class="yorha-nav-desc">{item.description}</span>
                </div>
                <span class="yorha-nav-arrow"><ChevronRight size={16} /></span>
              </button>
            </li>
          {/each}
        </ul>
      </nav>
    </div>
  {/if}
</div>

<style>
  /* Rewritten plain CSS to replace Tailwind @apply usage and fix stray closing tags */
  :global(.yorha-layout) {
    min-height: 100vh;
    background-color: #000;
    color: #f59e0b; /* amber-400 */;
    font-family: 'Courier New', monospace;
    background-image:
      radial-gradient(circle at 20% 50%, rgba(255, 191, 0, 0.03) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(255, 191, 0, 0.03) 0%, transparent 50%);
  }

  /* Header */
  :global(.yorha-header) {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 73px;
    display: flex;
    align-items: center;
    justify-content: space-between; /* fixed typo */;
    padding: 1rem 1.5rem;
    z-index: 40;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.2));
    border-bottom: 1px solid rgba(245, 158, 11, 0.06);
  }

  /* Added: header content wrapper used in template */
  :global(.yorha-header-content) {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    justify-content: space-between;
  }

  :global(.yorha-brand) {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  :global(.yorha-menu-toggle) {
    padding: 0.5rem;
    color: #f59e0b;
    background: transparent;
    border: 1px solid rgba(245, 158, 11, 0.3);
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
    cursor: pointer;
  }
  :global(.yorha-menu-toggle:hover) {
    color: #fbbf24; /* amber-300 */;
    border-color: rgba(245, 158, 11, 0.6);
  }
  :global(.yorha-brand-title) {
    font-size: 1.125rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  :global(.yorha-brand-icon) {
    color: #f59e0b;
    font-size: 1.25rem;
  }
  :global(.yorha-status-bar) {
    display: flex;
    gap: 1.5rem;
    align-items: center;
  }
  :global(.yorha-status-item) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: #f59e0b;
    opacity: 0.6;
  }

  /* Fixed syntax error: removed stray comma, separated statements */
  :global(.yorha-status-connected) {
    color: #10b981; /* green-400 */;
    opacity: 1;
  }

  :global(.yorha-status-error) {
    color: #f43f5e; /* red-400 */;
    opacity: 1;
  }
  :global(.yorha-quick-actions) {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  :global(.yorha-quick-btn) {
    padding: 0.375rem 0.75rem;
    background: #f59e0b;
    color: #000;
    font-size: 0.75rem;
    font-family: monospace;
    letter-spacing: 0.04em;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  :global(.yorha-quick-btn:hover) {
    background: #fbbf24;
  }

  /* Dot for status indicator */
  :global(.dot) {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #f43f5e; /* red-400 for disconnected */
    margin-right: 0.25rem;
    box-shadow: 0 0 5px #f43f5e; /* subtle glow for disconnected */
  }
  :global(.dot.connected) {
    background-color: #10b981; /* green-400 for connected */
    box-shadow: 0 0 5px #10b981; /* subtle glow for connected */
  }

  /* Sidebar */
  :global(.yorha-sidebar) {
    position: fixed;
    top: 73px;
    left: 0;
    bottom: 0;
    width: 20rem; /* w-80 */;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(255, 191, 0, 0.05) 100%);
    border-right: 1px solid rgba(245, 158, 11, 0.3);
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    z-index: 30;
    overflow: auto;
  }
  :global(.yorha-sidebar-open) {
    transform: translateX(0);
  }
  :global(.yorha-nav) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  :global(.yorha-nav-header) {
    display: flex;
    align-items: center;
    justify-content: space-between; /* fixed typo */;
    padding: 1.5rem;
    border-bottom: 1px solid rgba(245, 158, 11, 0.3);
  }
  :global(.yorha-nav-header h2) {
    font-size: 1rem;
    font-weight: 700;
    color: #f59e0b;
    letter-spacing: 0.04em;
    margin: 0;
  }
  :global(.yorha-sidebar-close) {
    padding: 0.5rem;
    color: #f59e0b;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  :global(.yorha-nav-list) {
    flex: 1;
    padding: 1rem 0;
    margin: 0;
    list-style: none;
  }
  :global(.yorha-nav-item) {
    border-bottom: 1px solid rgba(245, 158, 11, 0.1);
  }
  :global(.yorha-nav-link) {
    width: 100%;
    padding: 1rem;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 1rem;
    background: transparent;
    color: #f59e0b;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }
  :global(.yorha-nav-link:hover) {
    background: rgba(245, 158, 11, 0.1);
    color: #fbbf24;
  }
  :global(.yorha-nav-active) {
    background: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
    border-right: 2px solid #f59e0b;
  }
  :global(.yorha-nav-arrow) {
    opacity: 0.4;
    transition: opacity 0.15s ease;
  }
  :global(.yorha-nav-link:hover .yorha-nav-arrow) {
    opacity: 1;
  }
  :global(.yorha-nav-content) {
    flex: 1;
    min-width: 0;
  }
  :global(.yorha-nav-label) {
    display: block;
    font-weight: 600;
    font-size: 0.875rem;
  }
  :global(.yorha-nav-desc) {
    display: block;
    font-size: 0.75rem;
    opacity: 0.6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Main content */
  :global(.yorha-main) {
    display: block;
    flex: 1 1 auto;
    padding-top: 73px;
    padding-left: 2rem;
    padding-right: 2rem;
    padding-bottom: 2rem;
    transition: all 0.3s ease;
  }

  /* Added: overlay base style so overlay works at all sizes (not only inside media query) */
  :global(.yorha-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 20;
    display: block;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    :global(.yorha-header-content) {
      padding: 0.75rem 1rem;
    }
    :global(.yorha-brand-title) {
      font-size: 1rem;
    }
    :global(.yorha-status-bar) {
      gap: 1rem;
    }
    :global(.yorha-quick-actions) {
      display: none;
    }
    :global(.yorha-sidebar) {
      width: 100%;
    }
    :global(.yorha-overlay) {
      /* stronger overlay on small screens */
      background: rgba(0, 0, 0, 0.6);
      z-index: 20;
    }
  }
</style>
