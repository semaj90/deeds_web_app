import { createEventDispatcher } from 'svelte';
<script lang="ts">
 // Migrated from createEventDispatcher to callback props;

 const dispatch = createEventDispatcher();

 interface EvidenceItem {
 id: string;
 fileName: string;
 extractedText: string;
 caseId?: string;
 timestamp?: string;
 }

 let { a, b, show = false } = $props<{
 a: EvidenceItem;
 b: EvidenceItem;
 show?: boolean;
 }>();

 function close() {
 dispatch('close');
 }
</script>

{#if show}
 <div class="fixed inset-0 bg-black bg-opacity-80 flex p-10 gap-8 text-white z-50">
 <div class="w-1/2 nes-container with-title">
 <p class="title">Evidence A</p>
 <h2 class="text-amber-300 mb-4">{a.fileName}</h2>
 <div class="text-xs text-slate-400 mb-2">
 Case: {a.caseId || 'Unknown'} | {a.timestamp || 'No timestamp'}
 </div>
 <pre class="text-sm bg-slate-900 p-4 rounded border max-h-96 overflow-y-auto whitespace-pre-wrap">{a.extractedText}</pre>
 </div>

 <div class="w-1/2 nes-container with-title">
 <p class="title">Evidence B</p>
 <h2 class="text-amber-300 mb-4">{b.fileName}</h2>
 <div class="text-xs text-slate-400 mb-2">
 Case: {b.caseId || 'Unknown'} | {b.timestamp || 'No timestamp'}
 </div>
 <pre class="text-sm bg-slate-900 p-4 rounded border max-h-96 overflow-y-auto whitespace-pre-wrap">{b.extractedText}</pre>
 </div>

 <!-- Close Button -->
 <button
 class="fixed top-4 right-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
 onclick={ close }
 >
 ✕ Close Comparison
 </button>
 </div>
{/if}

<style>
 .nes-container {
 background: rgba(30, 41, 59, 0.95);
 border: 2px solid #475569;
 border-radius: 8px;
 }

 .nes-container .title {
 background: #1e293b;
 color: #f59e0b;
 margin: -2px -2px 0 -2px;
 padding: 8px 12px;
 border-bottom: 2px solid #475569;
 font-weight: bold;
 }
</style>
