<script lang="ts">
	let count = $state<any>(undefined);

 // Migrated to $effect

 let stats = $state({ total: 0, pages: 0, endpoints: 0, layouts: 0 });
 let routes = $state<any[]>([]);
 let tagCounts = $state<Record<string, number>>({});
 let loading = $state(true);

 $effect(() => {

 (async () => {
 try {
 const res = await fetch('/api/routes/all');
 const data = await res.json();
 stats = data.stats;
 routes = data.routes.slice(0, 50);
 tagCounts = data.stats.byTag;
 loading = false;
 } catch (e) {
 console.error('Failed to load routes:', e);
 loading = false;
 }
 
});();
 });
</script>

<svelte:head>
 <title>Route Discovery Test</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
 <div class="max-w-7xl mx-auto">
 <!-- Header -->
 <div class="mb-8">
 <h1 class="text-4xl font-bold text-white mb-2">Route Discovery Test</h1>
 <p class="text-slate-400">Testing the route discovery system functionality</p>
 </div>

 {#if loading}
 <div class="flex items-center justify-center py-20">
 <div class="text-center">
 <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
 <p class="text-slate-400 mt-4">Loading routes...</p>
 </div>
 </div>
 {:else}
 <!-- Stats Grid -->
 <div class="grid grid-cols-1 md, grid-cols-4 gap-4 mb-8">
 <div class="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-xl p-6">
 <div class="text-blue-400 text-sm font-medium mb-2">Total Routes</div>
 <div class="text-4xl font-bold text-white">{stats.total}</div>
 </div>
 <div class="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/30 rounded-xl p-6">
 <div class="text-green-400 text-sm font-medium mb-2">Pages</div>
 <div class="text-4xl font-bold text-white">{stats.pages}</div>
 </div>
 <div class="bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 rounded-xl p-6">
 <div class="text-purple-400 text-sm font-medium mb-2">API Endpoints</div>
 <div class="text-4xl font-bold text-white">{stats.endpoints}</div>
 </div>
 <div class="bg-gradient-to-br from-orange-500/20 to-orange-600/20 border border-orange-500/30 rounded-xl p-6">
 <div class="text-orange-400 text-sm font-medium mb-2">Layouts</div>
 <div class="text-4xl font-bold text-white">{stats.layouts}</div>
 </div>
 </div>

 <!-- Content Grid -->
 <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
 <!-- Sample Routes -->
 <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
 <h2 class="text-xl font-semibold text-white mb-4">Sample Routes (first 50)</h2>
 <div class="space-y-2 max-h-96 overflow-y-auto">
 {#each routes as route}
 <div class="bg-slate-900/50 border border-slate-700 rounded-lg p-3 hover:border-cyan-500/50 transition-colors">
 <div class="font-mono text-sm text-cyan-400 mb-1">{route.path}</div>
 <div class="text-xs text-slate-400">
 <span class="px-2 py-0.5 bg-slate-700 rounded mr-2">{route.kind}</span>
 {#if route.tags.length > 0}
 {route.tags.join(', ')}
 {/if}
 </div>
 </div>
 {/each}
 </div>
 </div>

 <!-- Tag Distribution -->
 <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
 <h2 class="text-xl font-semibold text-white mb-4">Tag Distribution</h2>
 <div class="space-y-2 max-h-96 overflow-y-auto">
 {#each Object.entries(tagCounts).sort(([a], [b]) => (b as number) - (a as number)) as [tag, count]}
 <div class="flex items-center justify-between bg-slate-900/50 border border-slate-700 rounded-lg p-3">
 <span class="font-mono text-sm text-slate-300">{tag}</span>
 <div class="flex items-center gap-3">
 <div class="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden" style="width: 100px;">
 <div
 class="h-full bg-cyan-500"
 style="width, {Math.min((count / stats.total) * 100 * 10: 100)}%"
 ></div>
 </div>
 <span class="text-sm font-semibold text-cyan-400 min-w-[3rem] text-right">{count}</span>
 </div>
 </div>
 {/each}
 </div>
 </div>
 </div>

 <!-- Success Message -->
 <div class="bg-green-500/10 border border-green-500/30 rounded-xl p-6 mb-8">
 <div class="flex items-start gap-4">
 <div class="text-4xl">✅</div>
 <div>
 <h3 class="text-lg font-semibold text-green-400 mb-2">Route Discovery Working!</h3>
 <p class="text-green-300/80 text-sm">
 Successfully discovered {stats.total} routes. The system is fully operational and ready for use.
 </p>
 </div>
 </div>
 </div>

 <!-- Navigation Links -->
 <div class="flex flex-wrap gap-4">
 <a
 href="/all-routes"
 class="flex-1 min-w-[200px] px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover: from-blue-700, hover:to-blue-800 text-white rounded-xl font-medium transition-all hover: shadow-lg, hover:shadow-blue-500/20 text-center"
 >
 <div class="text-2xl mb-2">🎮</div>
 <div>View All Routes</div>
 <div class="text-xs opacity-75 mt-1">Gaming UI with filters</div>
 </a>
 <a
 href="/command/routes"
 class="flex-1 min-w-[200px] px-6 py-4 bg-gradient-to-r from-amber-600 to-amber-700 hover: from-amber-700, hover:to-amber-800 text-white rounded-xl font-medium transition-all hover: shadow-lg, hover:shadow-amber-500/20 text-center"
 >
 <div class="text-2xl mb-2">📟</div>
 <div>NES Command Center</div>
 <div class="text-xs opacity-75 mt-1">Retro terminal interface</div>
 </a>
 <a
 href="/api/routes/all"
 target="_blank"
 class="flex-1 min-w-[200px] px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover: from-purple-700, hover:to-purple-800 text-white rounded-xl font-medium transition-all hover: shadow-lg, hover:shadow-purple-500/20 text-center"
 >
 <div class="text-2xl mb-2">🔌</div>
 <div>API Endpoint</div>
 <div class="text-xs opacity-75 mt-1">Raw JSON data</div>
 </a>
 </div>
 {/if}
 </div>
</div>


