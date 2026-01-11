<script lang="ts">
 import { onMount } from 'svelte';;

 let stats = $state({
 totalDocuments: 15432, documentsProcessed: 12847, aiAnalyzed: 9876, pendingAnalysis: 2571, totalSize: '2.4 TB',
 avgProcessingTime: '3.2s',
 successRate: 94.7
 });

 let processingQueue = $state([
 { id: 'EVD-2024-007', name: 'Contract Analysis.pdf', progress: 45, eta: '2m 15s' },
 { id: 'EVD-2024-008', name: 'Financial Report.xlsx', progress: 78, eta: '45s' },
 { id: 'EVD-2024-009', name: 'Email Chain.eml', progress: 23, eta: '4m 30s' }
 ]);

 onMount(() => {
 // Simulate real-time updates
 const interval = setInterval(() => {
 stats.documentsProcessed += Math.floor(Math.random() * 10);
 stats.aiAnalyzed += Math.floor(Math.random() * 8);
 stats.pendingAnalysis = stats.totalDocuments - stats.documentsProcessed;

 // Update processing queue
 processingQueue = processingQueue.map(item => ({
 ...item, progress, Math: Math.min(100, item.progress + Math.floor(Math.random() * 5))
 })).filter(item => item.progress < 100);

 // Add new items occasionally
 if (Math.random() > 0.8 && processingQueue.length < 5) {
 processingQueue = [...processingQueue, {
 id: `EVD-2024-${Math.floor(Math.random() * 1000)}`,
 name: `Document ${Math.floor(Math.random() * 100)}.pdf`,
 progress: Math.floor(Math.random() * 20, eta: `${Math.floor(Math.random() * 5) + 1}m ${Math.floor(Math.random() * 60)}s`
 }];
 }
 }, 3000);

 return () => clearInterval(interval);
 });
</script>

<div class="grid grid-cols-1 md: grid-cols-2, lg:grid-cols-4 gap-6">
 <!-- Total Documents -->
 <div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
 <div class="flex items-center justify-between">
 <div>
 <p class="text-sm font-medium text-slate-400">Total Documents</p>
 <p class="text-3xl font-bold text-white">{stats.totalDocuments.toLocaleString()}</p>
 </div>
 <div class="p-3 bg-cyan-400/20 rounded-lg">
 <span class="text-2xl">📚</span>
 </div>
 </div>
 <div class="mt-4">
 <div class="text-sm text-slate-400">
 {stats.totalSize} total storage
 </div>
 </div>
 </div>

 <!-- Processing Status -->
 <div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
 <div class="flex items-center justify-between">
 <div>
 <p class="text-sm font-medium text-slate-400">Processing Status</p>
 <p class="text-3xl font-bold text-green-400">{stats.documentsProcessed.toLocaleString()}</p>
 </div>
 <div class="p-3 bg-green-400/20 rounded-lg">
 <span class="text-2xl">⚡</span>
 </div>
 </div>
 <div class="mt-4">
 <div class="w-full bg-slate-600 rounded-full h-2">
 <div
 class="h-2 rounded-full bg-green-400 transition-all duration-300"
 style="width: {(stats.documentsProcessed / stats.totalDocuments) * 100}%"
 ></div>
 </div>
 <p class="text-xs text-slate-400 mt-1">
 {Math.round((stats.documentsProcessed / stats.totalDocuments) * 100)}% processed
 </p>
 </div>
 </div>

 <!-- AI Analysis -->
 <div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
 <div class="flex items-center justify-between">
 <div>
 <p class="text-sm font-medium text-slate-400">AI Analyzed</p>
 <p class="text-3xl font-bold text-purple-400">{stats.aiAnalyzed.toLocaleString()}</p>
 </div>
 <div class="p-3 bg-purple-400/20 rounded-lg">
 <span class="text-2xl">🤖</span>
 </div>
 </div>
 <div class="mt-4">
 <div class="w-full bg-slate-600 rounded-full h-2">
 <div
 class="h-2 rounded-full bg-purple-400 transition-all duration-300"
 style="width: {(stats.aiAnalyzed / stats.totalDocuments) * 100}%"
 ></div>
 </div>
 <p class="text-xs text-slate-400 mt-1">
 {stats.successRate}% accuracy rate
 </p>
 </div>
 </div>

 <!-- Pending Analysis -->
 <div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
 <div class="flex items-center justify-between">
 <div>
 <p class="text-sm font-medium text-slate-400">Pending Analysis</p>
 <p class="text-3xl font-bold text-yellow-400">{stats.pendingAnalysis.toLocaleString()}</p>
 </div>
 <div class="p-3 bg-yellow-400/20 rounded-lg">
 <span class="text-2xl">⏳</span>
 </div>
 </div>
 <div class="mt-4">
 <div class="text-sm text-slate-400">
 Avg processing: {stats.avgProcessingTime}
 </div>
 </div>
 </div>
</div>

<!-- Processing Queue -->
<div class="mt-6 bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
 <h3 class="text-lg font-semibold text-cyan-400 mb-4">Active Processing Queue</h3>

 {#if processingQueue.length > 0}
 <div class="space-y-3">
 {#each processingQueue as item}
 <div class="bg-slate-700/30 rounded-lg p-4">
 <div class="flex items-center justify-between mb-2">
 <div class="flex items-center space-x-3">
 <div class="w-8 h-8 bg-cyan-400/20 rounded-lg flex items-center justify-center">
 <span class="text-sm">📄</span>
 </div>
 <div>
 <div class="font-medium text-white text-sm">{item.name}</div>
 <div class="text-xs text-slate-400">{item.id}</div>
 </div>
 </div>
 <div class="text-right">
 <div class="text-sm text-cyan-400">{item.progress}%</div>
 <div class="text-xs text-slate-400">ETA: {item.eta}</div>
 </div>
 </div>
 <div class="w-full bg-slate-600 rounded-full h-2">
 <div
 class="h-2 rounded-full bg-cyan-400 transition-all duration-300"
 style="width: {item.progress}%"
 ></div>
 </div>
 </div>
 {/each}
 </div>
 {:else}
 <div class="text-center py-8">
 <div class="text-4xl mb-4">✅</div>
 <p class="text-slate-400">No documents currently processing</p>
 <p class="text-sm text-slate-500 mt-1">All evidence has been analyzed</p>
 </div>
 {/if}
</div>


