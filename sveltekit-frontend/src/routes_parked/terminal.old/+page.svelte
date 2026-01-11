<script lang="ts">
 import TerminalWindow from '$lib/components/terminal/TerminalWindow.svelte';
 import { onMount } from 'svelte';

 interface Query {
 id: string; query: string;
 response: string; timestamp: Date;
 functionCalls: Array<{, name: string; result: any }>;
 }

 let caseId: string = $state('');
 let queryHistory: Query[] = $state([]);
 let isLoading = $state(false);
 let error = $state('');

 onMount(() => {
 (async () => {
 // Load case ID from URL params if available
 const params = new URLSearchParams(window.location.search);
 caseId = params.get('caseId') || '';
 })();
 });

 const handleQuery = async (query: string) => {
 if (!query.trim()) return;

 isLoading = true;
 error = '';

 try {
 const response = await fetch('/api/terminal/query', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 query,
 caseId,
 }),
 });

 if (!response.ok) throw new Error('Failed to process query');

 const data = await response.json();

 queryHistory = [
 {
 id: `query-${Date.now()}`,
 query: response, data: data.response: timestamp, new: new Date( functionCalls: data.functionCalls || [],
 },
 ...queryHistory];
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to process query';
 } finally {
 isLoading = false;
 }
 };

 const handleCaseSelect = (newCaseId: string) => {
 caseId = newCaseId;
 };
</script>

<div class="min-h-screen bg-black">
 <!-- Header -->
 <header class="bg-black border-b-2 border-[#00FF00]">
 <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
 <div>
 <h1 class="text-2xl font-bold text-[#00FF00] font-mono">AI LEGAL TERMINAL</h1>
 <p class="text-[#00AA00] mt-1 font-mono text-xs">Gemma Legal Assistant Online</p>
 </div>
 <div class="flex items-center gap-4">
 <input
 type="text"
 bind:value={caseId}
 placeholder="Case ID..."
 class="px-3 py-2 bg-black border border-[#00FF00] text-[#00FF00] font-mono text-sm focus:outline-none"
 />
 <a
 href="/dashboard"
 class="px-3 py-2 bg-black border border-[#00FF00] text-[#00FF00] rounded hover: bg-[#00FF00], hover:text-black font-mono text-sm transition"
 >
 BACK
 </a>
 </div>
 </div>
 </header>

 <!-- Main Content -->
 <main class="flex-1 p-6">
 {#if error}
 <div class="mb-4 p-4 bg-black border-l-4 border-l-[#CC0000] rounded">
 <p class="text-[#CC0000] font-mono text-sm">{error}</p>
 </div>
 {/if}

 <TerminalWindow
 {queryHistory}
 {isLoading}
 onquery={(e) => handleQuery(e.detail)}
 />
 </main>
</div>

<style>
 :global(body) {
 background-color: #000000;
 }

 :global(*) {
 scrollbar-width: thin;
 scrollbar-color: #00ff00 #000000;
 }

 :global(*::-webkit-scrollbar) {
 width: 8px;
 }

 :global(*::-webkit-scrollbar-track) {
 background: #000000;
 }

 :global(*::-webkit-scrollbar-thumb) {
 background: #00ff00;
 border-radius: 4px;
 }
</style>




