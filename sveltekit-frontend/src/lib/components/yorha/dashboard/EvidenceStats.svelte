<script lang="ts">
 import { appStore } from '$lib/stores/app-store';
 import { onMount } from 'svelte';

 let stats = $state({
 totalDocuments: 15432,
 processedToday: 247,
 aiAnalyzed: 12847,
 pendingReview: 892,
 evidenceQuality: 94
 });

 let chartData = $derived([
 { label: 'Documents', value: stats.totalDocuments, color: 'bg-cyan-400' },
 { label: 'AI Analyzed', value: stats.aiAnalyzed, color: 'bg-green-400' },
 { label: 'Pending', value: stats.pendingReview, color: 'bg-yellow-400' }
 ]);

 let loading = $state(true);
 let error: string | null = $state(null);

 async function loadEvidenceStats() {
 try {
 loading = true;
 error = null;

 // Load evidence from API
 await (appStore as any).loadEvidence();

 const evidence = (appStore as any).evidence || [];

 // Calculate stats from real data
 const totalDocuments = evidence.length;
 const processedToday = evidence.filter((item: any) =>
 item.createdAt && new Date(item.createdAt).toDateString() === new Date().toDateString()
 ).length;
 const aiAnalyzed = evidence.filter((item: any) => item.aiAnalyzed || item.analysis).length;
 const pendingReview = evidence.filter((item: any) => item.status === 'pending' || !item.status).length;

 // Calculate quality score based on analyzed vs total
 const evidenceQuality = totalDocuments > 0 ? Math.round((aiAnalyzed / totalDocuments) * 100) : 0;

 stats = {
 totalDocuments,
 processedToday,
 aiAnalyzed,
 pendingReview,
 evidenceQuality
 };

 chartData = [
 { label: 'Documents', value: stats.totalDocuments, color: 'bg-cyan-400' },
 { label: 'AI Analyzed', value: stats.aiAnalyzed, color: 'bg-green-400' },
 { label: 'Pending', value: stats.pendingReview, color: 'bg-yellow-400' }
 ];

 } catch (err) {
 console.error('Failed to load evidence stats:', err);
 error = 'Failed to load evidence statistics';

 // Keep mock data as fallback
 } finally {
 loading = false;
 }
 }

 onMount(() => {
 loadEvidenceStats();

 // Update stats periodically
 const interval = setInterval(async () => {
 await loadEvidenceStats();
 }, 60000); // Update every minute

 return () => clearInterval(interval);
 });
</script>

<div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
 <div class="flex items-center justify-between mb-4">
 <h2 class="text-xl font-semibold text-cyan-400">Evidence Statistics</h2>
 {#if loading}
 <div class="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
 {/if}
 </div>

 {#if error}
 <div class="text-center py-4 mb-4">
 <div class="text-red-400 text-sm">⚠️ {error}</div>
 </div>
 {/if}

 <div class="space-y-4">
 <!-- Key Metrics -->
 <div class="grid grid-cols-2 gap-4">
 <div class="bg-slate-700/30 rounded-lg p-3">
 <div class="text-2xl font-bold text-cyan-400">{stats.totalDocuments.toLocaleString()}</div>
 <div class="text-xs text-slate-400">Total Documents</div>
 </div>

 <div class="bg-slate-700/30 rounded-lg p-3">
 <div class="text-2xl font-bold text-green-400">{stats.processedToday}</div>
 <div class="text-xs text-slate-400">Processed Today</div>
 </div>
 </div>

 <!-- Progress Bars -->
 <div class="space-y-3">
 <div>
 <div class="flex justify-between text-sm mb-1">
 <span class="text-slate-300">AI Analysis Progress</span>
 <span class="text-cyan-400">{Math.round((stats.aiAnalyzed / Math.max(stats.totalDocuments, 1)) * 100)}%</span>
 </div>
 <div class="w-full bg-slate-600 rounded-full h-2">
 <div
 class="h-2 rounded-full bg-cyan-400 transition-all duration-300"
 style="width: {(stats.aiAnalyzed / Math.max(stats.totalDocuments, 1)) * 100}%"
 ></div>
 </div>
 </div>

 <div>
 <div class="flex justify-between text-sm mb-1">
 <span class="text-slate-300">Evidence Quality Score</span>
 <span class="text-green-400">{stats.evidenceQuality}%</span>
 </div>
 <div class="w-full bg-slate-600 rounded-full h-2">
 <div
 class="h-2 rounded-full bg-green-400 transition-all duration-300"
 style="width: {stats.evidenceQuality}%"
 ></div>
 </div>
 </div>
 </div>

 <!-- Document Types -->
 <div class="pt-4 border-t border-slate-700/50">
 <h3 class="text-sm font-medium text-slate-300 mb-3">Document Types</h3>
 <div class="space-y-2">
 <div class="flex items-center justify-between text-sm">
 <span class="text-slate-400">Contracts</span>
 <span class="text-cyan-400">{Math.floor(stats.totalDocuments * 0.27).toLocaleString()}</span>
 </div>
 <div class="flex items-center justify-between text-sm">
 <span class="text-slate-400">Emails</span>
 <span class="text-cyan-400">{Math.floor(stats.totalDocuments * 0.25).toLocaleString()}</span>
 </div>
 <div class="flex items-center justify-between text-sm">
 <span class="text-slate-400">Financial Records</span>
 <span class="text-cyan-400">{Math.floor(stats.totalDocuments * 0.16).toLocaleString()}</span>
 </div>
 <div class="flex items-center justify-between text-sm">
 <span class="text-slate-400">Legal Documents</span>
 <span class="text-cyan-400">{Math.floor(stats.totalDocuments * 0.13).toLocaleString()}</span>
 </div>
 <div class="flex items-center justify-between text-sm">
 <span class="text-slate-400">Other</span>
 <span class="text-cyan-400">{Math.floor(stats.totalDocuments * 0.19).toLocaleString()}</span>
 </div>
 </div>
 </div>
 </div>
</div>


