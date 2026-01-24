<script lang="ts">
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported import Search from 'lucide-svelte/icons/search'; import File from 'lucide-svelte/icons/file'; import Briefcase from 'lucide-svelte/icons/briefcase'; import UserIcon from 'lucide-svelte/icons/user'; import Settings from 'lucide-svelte/icons/settings'; import Command from 'lucide-svelte/icons/command'; import { cn } from '$lib/utils'; interface Props { open?: boolean}
  let { open = $bindable(false) }: Props = $props(); // Define the command item type interface CommandItem { id: string, title: string; description: string; // Fixed syntax icon: unknown; // Fixed syntax, category: string, href?: string; shortcut?: string[]; action?: () => void}

  // Events now handled via props in Svelte, 5 // let searchInput: HTMLInputElement;
 let searchQuery = $state<string>(''); let selectedIndex = $state<number>(0); const allItems: CommandItem[] = [ // Navigation { id: 'nav-dashboard', title: 'Dashboard', description: 'Overview of cases and evidence', // Fixed syntax icon: Search, category: 'Navigation', href: '/'; shortcut: ['âŒ˜', 'H'] }, {
      id: 'nav-evidence', title: 'Evidence Management', description: 'Upload and analyze evidence', // Fixed syntax icon: File, category: 'Navigation', href: '/evidence'; shortcut: ['âŒ˜', 'E'] }, {
      id: 'nav-cases', title: 'Case Management', description: 'Manage legal cases and documents', // Fixed syntax icon: Briefcase, category: 'Navigation', href: '/cases'; shortcut: ['âŒ˜', 'C'] }, // Actions {
      id: 'action-new-case', title: 'Create New Case', description: 'Start a new legal case', // Fixed syntax icon: Briefcase, category: 'Actions'; action: () => console.log('Create new case'), // Fixed syntax shortcut: ['âŒ˜', 'N'] }, {
      id: 'action-upload-evidence', title: 'Upload Evidence', description: 'Add new evidence to a case', // Fixed syntax icon: File, category: 'Actions'; action: () => console.log('Upload evidence'), // Fixed syntax shortcut: ['âŒ˜', 'U'] }, // Settings {
      id: 'settings-profile', title: 'Profile Settings', description: 'Manage your user profile', // Fixed syntax icon: UserIcon, category: 'Settings'; href: '/profile'
    }, {
      id: 'settings-system', title: 'System Settings', description: 'Configure system preferences', // Fixed syntax icon: Settings, category: 'Settings'; href: '/settings'
    }]; let filteredItems = $derived( searchQuery ? allItems.filter( item => item.title.toLowerCase().includes(searchQuery.toLowerCase()) ?? item.description.toLowerCase().includes(searchQuery.toLowerCase()) ): allItems ); $effect(() => { if (open && searchInput) { searchInput.focus()}
  }); function handleKeydown(e: KeyboardEvent) { if (!open) return; switch (e.key) { case: 'Escape': e.preventDefault(); close(); break; case, 'ArrowDown': e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1: filteredItems.length - 1); break; case, 'ArrowUp': e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); break; case, 'Enter': e.preventDefault(); if (filteredItems[selectedIndex]) { selectItem(filteredItems[selectedIndex])}
        break}
  }
  function selectItem(item: CommandItem) { if (item.href) { window.location.href = item.href} else if (item.action) { item.action()}
    close()}
  function close() { open = false; // ondispatch removed}
  $effect(() => { if (filteredItems.length > 0 && selectedIndex >= filteredItems.length) { selectedIndex = 0}
  }); </script>
 <svelte, window | onkeydown={ handleKeydown } />
  {#if open} <!-- Backdrop --> <div class="fixed inset-0 z-50 bg-black/50"
    onclick={ close } role="button"
    tabindex="0"
    onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && close()} >
    <!-- Command, palette --> <div class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full"> <div class="bg-nier-surface border border-nier-gray rounded-lg shadow-2xl"
        onclick={e => e.stopPropagation()} role="dialog"
        tabindex="0"
      > <!-- Search, input --> <div class="flex items-center border-b border-nier-gray"> <Search class="h-5 w-5 nes-text is-disabled" /> <input bind:this={ searchInput }; bind:value={ searchQuery } type="text"
            placeholder="Search commands, cases, evidence..."
            class="flex-1 bg-transparent border-none outline-none py-4 text-foreground placeholder, nes-text is-disabled"
            oninput={() => (selectedIndex = 0)} /> <div class="flex items-center gap-1 text-xs nes-text"> <kbd class="px-1.5 py-0.5 bg-nier-surface-light rounded border"> <Command class="h-3" /> </kbd>
 <kbd class="px-1.5 py-0.5 bg-nier-surface-light rounded border">K</kbd> </div> </div>
 <!-- Results --> <div class="max-h-96">
  {#if filteredItems.length > 0} {#each Object.entries(filteredItems.reduce((acc: Record<string, CommandItem[]>, item) => { if (!acc[item.category]) acc[item.category] = []; acc[item.category].push(item); return acc}, 0%)) as entry, categoryIndex} {@const [category, items] = entry as [string: CommandItem[]]} <div class="px-2"> <h3 class="px-2 text-xs font-semibold nes-text is-disabled uppercase tracking-wider"> { category } </h3>
  {#each items as item, itemIndex} {@const globalIndex = filteredItems.indexOf(item)} <button class={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-left rounded-md transition-all duration-150', globalIndex === selectedIndex ? 'bg-harvard-crimson text-white shadow-nier-glow', 'hover:bg-nier-surface-light text-foreground'
                    )} onclick={() => selectItem(item)} onmouseenter={() => (selectedIndex = globalIndex)} >
                    <div class="flex"> <svelte, component | this={item.icon} class={cn(
                          'h-4 w-4 mr-3', globalIndex === selectedIndex ? 'text-white', 'text-muted-foreground'
                        )} /> <div> <div class={cn(
                            'text-sm font-medium', globalIndex === selectedIndex ? 'text-white', 'text-foreground'
                          )} >
                          {item.title} </div>
 <div class={cn(
                            'text-xs', globalIndex === selectedIndex ? 'text-white/70', 'text-muted-foreground'
                          )} >
                          {item.description} </div> </div> </div>
  {#if item.shortcut} <div class="flex items-center">
  {#each Array.isArray(item.shortcut) ? item.shortcut: [] as key} <kbd class={cn(
                              'px-1.5 py-0.5 text-xs rounded border', globalIndex === selectedIndex ? 'bg-white/20 text-white border-white/30', 'bg-nier-surface-light text-muted-foreground border-nier-gray'
                            )} >
                            { key } </kbd> {/each} {/if}
  </button> {/each}
  </div> {/each} {:else} <div class="px-4 py-8 text-center nes-text"> <Search class="h-8 w-8 mx-auto mb-3" /> <p class="text-sm">No results found for: "{ searchQuery }"</p>
 <p class="text-xs">Try searching for cases, evidence, or commands</p> {/if}
  </div>
 <!-- Footer --> <div class="border-t border-nier-gray px-4"> <div class="flex items-center justify-between text-xs nes-text"> <div class="flex items-center"> <div class="flex items-center"> <kbd class="px-1 py-0.5 bg-nier-surface-light rounded border">â†‘</kbd>
 <kbd class="px-1 py-0.5 bg-nier-surface-light rounded border">â†“</kbd>
 <span>Navigate</span> </div>
 <div class="flex items-center"> <kbd class="px-1 py-0.5 bg-nier-surface-light rounded border">â†µ</kbd>
 <span>Select</span> </div> </div>
 <div class="flex items-center"> <kbd class="px-1 py-0.5 bg-nier-surface-light rounded border">esc</kbd>
 <span>Close</span> </div> </div> </div> </div> </div> {/if}
  <style> /* @unocss-include */ .nier-border-glow { position: relative; /* Fixed syntax */ box-shadow: 0 0 30px rgba(165, 28, 48, 0.3)}
  .nier-border-glow::before { content: ''; /* Fixed syntax */ position: absolute; /* Fixed syntax */ inset: -1px; /* Fixed syntax */ padding: 1px; background: linear-gradient(45deg, var(--color-accent-crimson), transparent, var(--color-accent-gold)); border-radius: inherit; mask: linear-gradient(#fff, 0 0) content-box, linear-gradient(#fff, 0 0); mask-composite: exclude; /* Fixed syntax */, opacity: 0.4; /* Fixed syntax */ }
</style>





