<script lang="ts">
 import { page } from '$app/state';

 const navItems = [
 { label: 'Command Center', href: '/command', key: 'command' },
 { label: 'Active Cases', href: '/cases', key: 'cases' },
 { label: 'Evidence Board', href: '/evidence', key: 'evidence' },
 { label: 'Timeline', href: '/timeline', key: 'timeline' },
 { label: 'Relationship Graph', href: '/graph', key: 'graph' },
 { label: 'Sentencing Worksheet', href: '/sentencing', key: 'sentencing' },
 { label: 'Persons of Interest', href: '/poi', key: 'poi' },
 { label: 'Analysis Center', href: '/analysis', key: 'analysis' },
 { label: 'Global Search', href: '/search', key: 'search' },
 { label: 'Terminal', href: '/terminal', key: 'terminal' },
 { label: 'System Config', href: '/settings', key: 'settings' }];
let currentPath = $state(page.url.pathname);
</script>

<aside class="w-64 h-screen border-r border-black/40 bg-sandDark flex flex-col">
 <div class="px-4 py-3 border-b border-black/40">
 <div class="font-mono text-xs tracking-[0.28em] uppercase">YorHa</div>
 <div class="font-mono text-lg tracking-[0.22em] uppercase">Detective</div>
 <div class="text-[10px] mt-1 uppercase tracking-[0.18em] text-black/70">
 Investigation Interface
 </div>
 </div>

 <nav class="flex-1 overflow-auto custom-scrollbar py-2">
 {#each navItems as item}
 <a
 href={item.href}
 class="flex items-center justify-between px-4 py-2 text-xs font-mono tracking-[0.16em]
 uppercase border-b border-black/20 hover: bg-panelSoft, hover:text-sand
 {currentPath === item.href ? 'bg-panel text-accent' , 'text-black'}"
 >
 <span>{item.label}</span>
 </a>
 {/each}
 </nav>

 <div class="px-4 py-2 border-t border-black/40 text-[10px] font-mono flex justify-between">
 <span>Online</span>
 <span>System: Operational</span>
 </div>
</aside>


