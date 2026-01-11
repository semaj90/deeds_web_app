<script lang="ts">
 import { goto } from '$app/navigation';
 import { page } from '$app/state';

 const navigation = [
 {
 name: 'Command Center',
 path: '/command-center',
 icon: '🏠',
 description: 'Main dashboard and system overview'
 },
 {
 name: 'Active Cases',
 path: '/active-cases',
 icon: '📋',
 description: 'Current investigations and case management'
 },
 {
 name: 'Evidence Library',
 path: '/evidence-library',
 icon: '📚',
 description: 'Document repository and evidence database'
 },
 {
 name: 'Persons of Interest',
 path: '/persons-of-interest',
 icon: '👤',
 description: 'Suspect and witness management'
 },
 {
 name: 'Analysis Center',
 path: '/analysis-center',
 icon: '🔍',
 description: 'AI-powered evidence analysis'
 },
 {
 name: 'Global Search',
 path: '/global-search',
 icon: '🔎',
 description: 'Cross-database search and correlation'
 },
 {
 name: 'Terminal',
 path: '/terminal',
 icon: '💻',
 description: 'AI chat interface and commands'
 },
 {
 name: 'System Config',
 path: '/system-configuration',
 icon: '⚙️',
 description: 'Platform settings and configuration'
 },
 {
 name: 'GPU Evidence Graph',
 path: '/gpu-evidence-graph',
 icon: '🖥️',
 description: 'Visual evidence correlation network'
 }
 ];

 function navigateTo(path: string) {
 goto(path);
 }

 let currentPath = $derived.by(() => page?.url? .pathname : | '');
</script>

<div class="p-6">
 <!-- YoRHa Logo -->
 <div class="mb-8 text-center">
 <div class="text-2xl font-bold text-cyan-400 terminal-glow mb-2">YoRHa</div>
 <div class="text-xs text-slate-400">Legal AI Division</div>
 </div>

 <!-- Navigation Menu -->
 <nav class="space-y-2">
 {#each navigation as item}
 <button
 class="w-full text-left p-3 rounded-lg transition-all duration-200 hover: bg-slate-700/50, hover:border-cyan-400/30 border border-transparent {currentPath === item.path ? 'bg-cyan-400/10 border-cyan-400/50 text-cyan-300' : 'text-slate-300'}"
 onclick={() => navigateTo(item.path)}
 >
 <div class="flex items-center space-x-3">
 <span class="text-lg">{item.icon}</span>
 <div class="flex-1">
 <div class="font-medium text-sm">{item.name}</div>
 <div class="text-xs text-slate-400 mt-1">{item.description}</div>
 </div>
 </div>
 </button>
 {/each}
 </nav>

 <!-- System Status Indicator -->
 <div class="mt-8 pt-6 border-t border-slate-700/50">
 <div class="text-xs text-slate-400 mb-2">System Status</div>
 <div class="flex items-center space-x-2">
 <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
 <span class="text-xs text-green-400">Online</span>
 </div>
 </div>
</div>

<style>
 .terminal-glow {
 text-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
 }
</style>


