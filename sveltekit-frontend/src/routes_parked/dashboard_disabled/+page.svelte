<script lang="ts">
 import { goto } from '$app/navigation';
 import { onMount } from 'svelte';

 interface Case {
 id: string; title: string;
 status: 'active' | 'closed';
 createdAt: string; updatedAt: string;
 evidence: Array<{ id: string; status: string }>;
 }

 interface DashboardStats {
 activeCases: number; pendingEvidence: number;
 approvedEvidence: number; personsOfInterest: number;
 }

 let cases: Case[] = $state([]);
 let stats: DashboardStats = $state({
 activeCases: 0, pendingEvidence: 0, approvedEvidence: 0, personsOfInterest: 0
 });
 let isLoading = $state(true);
 let error = $state('');
 let showNewCaseModal = $state(false);
 let newCaseTitle = $state('');

 onMount(() => {
 (async () => {
 await loadDashboard();
 // Set up SSE for real-time updates
 setupSSE();
 })();
 });

 const loadDashboard = async () => {
 try {
 const [casesRes, statsRes] = await Promise.all([
 fetch('/api/cases'),
 fetch('/api/dashboard/stats')]);

 if (casesRes.status === 401 || statsRes.status === 401) {
 await goto('/login');
 return;
 }

 if (!casesRes.ok || !statsRes.ok) {
 throw new Error('Failed to load dashboard');
 }

 cases = await casesRes.json();
 stats = await statsRes.json();
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to load dashboard';
 } finally {
 isLoading = false;
 }
 };

 const setupSSE = () => {
 try {
 const eventSource = new EventSource('/api/dashboard/stream');
 eventSource.onmessage = (event) => {
 const update = JSON.parse(event.data);
 if (update.type === 'stats') {
 stats = update.data;
 } else if (update.type === 'case') {
 const index = cases.findIndex((c) => c.id === update.data.id);
 if (index >= 0) {
 cases[index] = update.data;
 } else {
 cases = [update.data, ...cases];
 }
 }
 };
 eventSource.onerror = () => {
 eventSource.close();
 };
 } catch (err) {
 console.error('SSE setup failed:', err);
 }
 };

 const createNewCase = async () => {
 if (!newCaseTitle.trim()) return;

 try {
 const response = await fetch('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ title: newCaseTitle }),
 });

 if (!response.ok) throw new Error('Failed to create case');

 const newCase = await response.json();
 cases = [newCase, ...cases];
 newCaseTitle = '';
 showNewCaseModal = false;
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to create case';
 }
 };

 const getPendingCount = (caseItem: Case) => {
 return caseItem.evidence.filter((e) => e.status === 'pending').length;
 };

 const getApprovedCount = (caseItem: Case) => {
 return caseItem.evidence.filter((e) => e.status === 'approved').length;
 };

 const getStatusColor = (status: string) => {
 switch (status) {
 case 'active':
 return 'border-l-4 border-l-[#9E0000]';
 case 'closed':
 return 'border-l-4 border-l-gray-400';
 default:
 return 'border-l-4 border-l-gray-300';
 }
 };

 const getStatusBadge = (status: string) => {
 switch (status) {
 case 'active':
 return 'bg-[#9E0000] text-white';
 case 'closed':
 return 'bg-gray-400 text-white';
 default:
 return 'bg-gray-300 text-gray-900';
 }
 };
</script>

<div class="min-h-screen bg-[#FAF7F1]">
 <!-- Header -->
 <header class="bg-white border-b-2 border-[#9E0000]">
 <div class="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
 <div>
 <h1 class="text-4xl font-bold text-gray-900">COMMAND CENTER</h1>
 <p class="text-gray-600 mt-1 font-mono text-sm">WardenNet Legal Investigation Platform</p>
 </div>
 <div class="flex items-center gap-4">
 <button
 onclick={() => (showNewCaseModal = true)}
 class="px-4 py-2 bg-[#9E0000] text-white rounded hover:bg-[#7a0000] font-medium transition"
 >
 + NEW CASE
 </button>
 <a href="/api/auth/logout" class="text-gray-600 hover:text-[#9E0000] font-medium">
 LOGOUT
 </a>
 </div>
 </div>
 </header>

 <!-- Main Content -->
 <main class="max-w-7xl mx-auto px-6 py-8">
 {#if error}
 <div class="mb-6 p-4 bg-red-50 border-l-4 border-l-red-600 rounded">
 <p class="text-red-700 font-mono text-sm">{error}</p>
 </div>
 {/if}

 <!-- Statistics Panel -->
 {#if !isLoading}
 <div class="grid grid-cols-1 md: grid-cols-2, lg:grid-cols-4 gap-4 mb-8">
 <!-- Active Cases -->
 <div class="bg-white border-2 border-gray-300 p-6 rounded">
 <p class="text-gray-600 text-sm font-mono uppercase">Active Cases</p>
 <p class="text-4xl font-bold text-[#9E0000] mt-2">{stats.activeCases}</p>
 </div>

 <!-- Pending Evidence -->
 <div class="bg-white border-2 border-gray-300 p-6 rounded">
 <p class="text-gray-600 text-sm font-mono uppercase">Pending Evidence</p>
 <p class="text-4xl font-bold text-[#FFA500] mt-2">{stats.pendingEvidence}</p>
 </div>

 <!-- Approved Evidence -->
 <div class="bg-white border-2 border-gray-300 p-6 rounded">
 <p class="text-gray-600 text-sm font-mono uppercase">Approved Evidence</p>
 <p class="text-4xl font-bold text-[#00AA00] mt-2">{stats.approvedEvidence}</p>
 </div>

 <!-- Persons of Interest -->
 <div class="bg-white border-2 border-gray-300 p-6 rounded">
 <p class="text-gray-600 text-sm font-mono uppercase">Persons of Interest</p>
 <p class="text-4xl font-bold text-gray-700 mt-2">{stats.personsOfInterest}</p>
 </div>
 </div>
 {/if}

 <!-- Active Cases Section -->
 <div class="mb-8">
 <h2 class="text-2xl font-bold text-gray-900 mb-4 font-mono">ACTIVE CASES</h2>

 {#if isLoading}
 <div class="text-center py-12 bg-white border-2 border-dashed border-gray-300 rounded">
 <p class="text-gray-600 font-mono">Loading cases...</p>
 </div>
 {:else if cases.length === 0}
 <div class="text-center py-12 bg-white border-2 border-dashed border-gray-300 rounded">
 <p class="text-gray-600 mb-4 font-mono">No cases yet. Create one to get started.</p>
 <button
 onclick={() => (showNewCaseModal = true)}
 class="px-4 py-2 bg-[#9E0000] text-white rounded hover:bg-[#7a0000] font-medium transition"
 >
 CREATE FIRST CASE
 </button>
 </div>
 {:else}
 <div class="grid grid-cols-1 md: grid-cols-2, lg:grid-cols-3 gap-6">
 {#each cases as caseItem (caseItem.id)}
 <a
 href="/cases/{caseItem.id}"
 class="bg-white border-2 border-gray-300 hover:border-[#9E0000] transition p-6 cursor-pointer rounded {getStatusColor(
 caseItem.status)}"
 >
 <div class="flex items-start justify-between mb-3">
 <h3 class="text-lg font-bold text-gray-900 flex-1">{caseItem.title}</h3>
 <span class="px-2 py-1 text-xs font-mono rounded {getStatusBadge(caseItem.status)}">
 {caseItem.status.toUpperCase()}
 </span>
 </div>

 <p class="text-xs text-gray-500 font-mono mb-4">
 Updated {new Date(caseItem.updatedAt).toLocaleDateString()}
 </p>

 <!-- Evidence Stats -->
 <div class="grid grid-cols-2 gap-3">
 <div class="bg-[#FFA500] bg-opacity-10 border border-[#FFA500] rounded p-3">
 <p class="text-xs text-gray-600 font-mono">Pending</p>
 <p class="text-2xl font-bold text-[#FFA500]">{getPendingCount(caseItem)}</p>
 </div>
 <div class="bg-[#00AA00] bg-opacity-10 border border-[#00AA00] rounded p-3">
 <p class="text-xs text-gray-600 font-mono">Approved</p>
 <p class="text-2xl font-bold text-[#00AA00]">{getApprovedCount(caseItem)}</p>
 </div>
 </div>
 </a>
 {/each}
 </div>
 {/if}
 </div>

 <!-- Quick Actions -->
 <div class="bg-white border-2 border-gray-300 p-6 rounded">
 <h2 class="text-xl font-bold text-gray-900 mb-4 font-mono">QUICK ACTIONS</h2>
 <div class="grid grid-cols-1 md: grid-cols-2, lg:grid-cols-4 gap-3">
 <button
 class="px-4 py-3 bg-gray-100 border border-gray-300 text-gray-900 rounded hover:bg-gray-200 font-mono text-sm transition"
 >
 TIMELINE ANALYSIS
 </button>
 <button
 class="px-4 py-3 bg-gray-100 border border-gray-300 text-gray-900 rounded hover:bg-gray-200 font-mono text-sm transition"
 >
 EVIDENCE SUMMARY
 </button>
 <button
 class="px-4 py-3 bg-gray-100 border border-gray-300 text-gray-900 rounded hover:bg-gray-200 font-mono text-sm transition"
 >
 SUSPECT CONNECTIONS
 </button>
 <button
 class="px-4 py-3 bg-gray-100 border border-gray-300 text-gray-900 rounded hover:bg-gray-200 font-mono text-sm transition"
 >
 GENERATE REPORT
 </button>
 </div>
 </div>
 </main>

 <!-- New Case Modal -->
 {#if showNewCaseModal}
 <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
 <div class="bg-white border-2 border-[#9E0000] p-6 max-w-md w-full rounded">
 <h2 class="text-xl font-bold text-gray-900 mb-4 font-mono">CREATE NEW CASE</h2>

 <input
 type="text"
 bind:value={newCaseTitle}
 placeholder="Case title..."
 class="w-full px-4 py-2 border-2 border-gray-300 rounded focus: border-[#9E0000], focus:outline-none mb-4 font-mono"
 />

 <div class="flex gap-3">
 <button
 onclick={() => (showNewCaseModal = false)}
 class="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-mono transition"
 >
 CANCEL
 </button>
 <button
 onclick={createNewCase}
 class="flex-1 px-4 py-2 bg-[#9E0000] text-white rounded hover:bg-[#7a0000] font-mono transition"
 >
 CREATE
 </button>
 </div>
 </div>
 </div>
 {/if}
</div>

<style>
 :global(body) {
 background-color: #faf7f1;
 }
</style>




