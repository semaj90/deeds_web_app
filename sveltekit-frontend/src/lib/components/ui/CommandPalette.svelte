<script lang="ts">
  import type { Case } from '$lib/types';
  import Search from '@lucide/svelte/icons/search';
  import File from '@lucide/svelte/icons/file';
  import Briefcase from '@lucide/svelte/icons/briefcase';
  import UserIcon from '@lucide/svelte/icons/user';
  import Settings from '@lucide/svelte/icons/settings';
  import Command from '@lucide/svelte/icons/command';
  import { cn } from '$lib/utils';

  interface Props {
    open?: boolean;
  }

  let { open = $bindable(false) }: Props = $props();

  // Define the command item type
  interface CommandItem { id: string, title: string;
    description: string;
    icon: unknown;
    category: string;
    href?: string;
    shortcut?: string[];
    action?: () => void;
  }

  let searchInput: HTMLInputElement;
  let searchQuery = $state<string>('');
  let selectedIndex = $state<number>(0);

  const allItems: CommandItem[] = [
    // Navigation
    {
      id: 'nav-dashboard',
      title: 'Dashboard',
      description: 'Overview of cases and evidence',
      icon: Search,
      category: 'Navigation',
      href: '/',
      shortcut: ['⌘', 'H']
    },
    {
      id: 'nav-evidence',
      title: 'Evidence Management',
      description: 'Upload and analyze evidence',
      icon: File,
      category: 'Navigation',
      href: '/evidence',
      shortcut: ['⌘', 'E']
    },
    {
      id: 'nav-cases',
      title: 'Case Management',
      description: 'Manage legal cases and documents',
      icon: Briefcase,
      category: 'Navigation',
      href: '/cases',
      shortcut: ['⌘', 'C']
    },
    // Actions
    {
      id: 'action-new-case',
      title: 'Create New Case',
      description: 'Start a new legal case',
      icon: Briefcase,
      category: 'Actions',
      action: () => console.log('Create new case'),
      shortcut: ['⌘', 'N']
    },
    {
      id: 'action-upload-evidence',
      title: 'Upload Evidence',
      description: 'Add new evidence to a case',
      icon: File,
      category: 'Actions',
      action: () => console.log('Upload evidence'),
      shortcut: ['⌘', 'U']
    },
    // Settings
    {
      id: 'settings-profile',
      title: 'Profile Settings',
      description: 'Manage your user profile',
      icon: UserIcon,
      category: 'Settings',
      href: '/profile'
    },
    {
      id: 'settings-system',
      title: 'System Settings',
      description: 'Configure system preferences',
      icon: Settings,
      category: 'Settings',
      href: '/settings'
    }
  ];

  let filteredItems = $derived(
    searchQuery
      ? allItems.filter(
          item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : allItems
  );

  $effect(() => {
    if (open && searchInput) {
      searchInput.focus();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filteredItems.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          selectItem(filteredItems[selectedIndex]);
        }
        break;
    }
  }

  function selectItem(item: CommandItem) {
    if (item.href) {
      window.location.href = item.href;
    } else if (item.action) {
      item.action();
    }
    close();
  }

  function close() {
    open = false;
  }

  $effect(() => {
    if (filteredItems.length > 0 && selectedIndex >= filteredItems.length) {
      selectedIndex = 0;
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/50"
    onclick={close}
    role="button"
    tabindex="0"
    onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && close()}
  >
    <!-- Command palette -->
    <div class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl">
      <div
        class="bg-nier-surface border border-nier-gray rounded-lg shadow-2xl"
        onclick={(e) => e.stopPropagation()}
        role="dialog"
        tabindex="0"
      >
        <!-- Search input -->
        <div class="flex items-center gap-3 px-4 border-b border-nier-gray">
          <Search class="h-5 w-5 text-muted-foreground" />
          <input
            bind:this={searchInput}
            bind:value={searchQuery}
            type="text"
            placeholder="Search commands, cases, evidence..."
            class="flex-1 bg-transparent border-none outline-none py-4 text-foreground placeholder:text-muted-foreground"
            oninput={() => (selectedIndex = 0)}
          />
          <div class="flex items-center gap-1 text-xs text-muted-foreground">
            <kbd class="px-1.5 py-0.5 bg-nier-surface-light rounded border border-nier-gray">
              <Command class="h-3 w-3" />
            </kbd>
            <kbd class="px-1.5 py-0.5 bg-nier-surface-light rounded border border-nier-gray">K</kbd>
          </div>
        </div>

        <!-- Results -->
        <div class="max-h-96 overflow-auto">
          {#if filteredItems.length > 0}
            {#each Object.entries(
              filteredItems.reduce((acc: Record<string, CommandItem[]>, item) => {
                if (!acc[item.category]) acc[item.category] = [];
                acc[item.category].push(item);
                return acc;
              }, {})
            ) as [category, items]}
              <div class="px-2 py-2">
                <h3 class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {category}
                </h3>
                {#each items as item}
                  {@const globalIndex = filteredItems.indexOf(item)}
                  <button
                    class={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-left rounded-md transition-all duration-150',
                      globalIndex === selectedIndex
                        ? 'bg-harvard-crimson text-white shadow-nier-glow'
                        : 'hover:bg-nier-surface-light text-foreground'
                    )}
                    onclick={() => selectItem(item)}
                    onmouseenter={() => (selectedIndex = globalIndex)}
                  >
                    <div class="flex items-start gap-3">
                      <svelte:component
                        this={item.icon}
                        class={cn(
                          'h-4 w-4 mt-0.5',
                          globalIndex === selectedIndex ? 'text-white' : 'text-muted-foreground'
                        )}
                      />
                      <div>
                        <div
                          class={cn(
                            'text-sm font-medium',
                            globalIndex === selectedIndex ? 'text-white' : 'text-foreground'
                          )}
                        >
                          {item.title}
                        </div>
                        <div
                          class={cn(
                            'text-xs',
                            globalIndex === selectedIndex ? 'text-white/70' : 'text-muted-foreground'
                          )}
                        >
                          {item.description}
                        </div>
                      </div>
                    </div>
                    {#if item.shortcut}
                      <div class="flex items-center gap-1">
                        {#each Array.isArray(item.shortcut) ? item.shortcut : [] as key}
                          <kbd
                            class={cn(
                              'px-1.5 py-0.5 text-xs rounded border',
                              globalIndex === selectedIndex
                                ? 'bg-white/20 text-white border-white/30'
                                : 'bg-nier-surface-light text-muted-foreground border-nier-gray'
                            )}
                          >
                            {key}
                          </kbd>
                        {/each}
                      </div>
                    {/if}
                  </button>
                {/each}
              </div>
            {/each}
          {:else}
            <div class="px-4 py-8 text-center text-muted-foreground">
              <Search class="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p class="text-sm">No results found for "{searchQuery}"</p>
              <p class="text-xs mt-1">Try searching for cases, evidence, or commands</p>
            </div>
          {/if}
        </div>

        <!-- Footer -->
        <div class="border-t border-nier-gray px-4 py-2">
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-1">
                <kbd class="px-1 py-0.5 bg-nier-surface-light rounded border border-nier-gray">↑</kbd>
                <kbd class="px-1 py-0.5 bg-nier-surface-light rounded border border-nier-gray">↓</kbd>
                <span class="ml-1">Navigate</span>
              </div>
              <div class="flex items-center gap-1">
                <kbd class="px-1 py-0.5 bg-nier-surface-light rounded border border-nier-gray">↵</kbd>
                <span class="ml-1">Select</span>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <kbd class="px-1 py-0.5 bg-nier-surface-light rounded border border-nier-gray">esc</kbd>
              <span class="ml-1">Close</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* @unocss-include */
  .nier-border-glow {
    position: relative;
    box-shadow: 0 0 30px rgba(165, 28, 48, 0.3);
  }

  .nier-border-glow::before { content: '';
		position: absolute;
    inset: -1px;
    padding: 1px;
    background: linear-gradient(45deg, var(--color-accent-crimson), transparent, var(--color-accent-gold));
    border-radius: inherit;
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask-composite: exclude;
    opacity: 0.4;
  }
</style>
