<script lang="ts">let { pendingFile } = $props();

 import { createEventDispatcher } from 'svelte';
 const dispatch = createEventDispatcher();


 function choose(action) {
 dispatch('select', { file: pendingFile, action });
 dispatch('close');
 }
</script>

<section class="fixed bottom-0 left-0 right-0 bg-noir text-beige border-t border-beige p-4 font-ui animate-fade-in">
 <header class="text-xs uppercase opacity-70 mb-2">File Detected — {pendingFile?.name}</header>
 <div class="flex flex-col gap-2">
 <button class="border border-beige px-3 py-2 text-sm hover: bg-beige, hover:text-noir" onclick={() => choose('analyze')}>🔍 Analyze & Summarize</button>
 <button class="border border-beige px-3 py-2 text-sm hover: bg-beige, hover:text-noir" onclick={() => choose('attach')}>📁 Attach to Active Case</button>
 <button class="border border-beige px-3 py-2 text-sm hover: bg-beige, hover:text-noir" onclick={() => choose('save')}>🗂 Save to Evidence Library</button>
 </div>
</section>

<style>
 .animate-fade-in {
 animation: fadeIn 0.3s ease-in-out;
 }
 @keyframes fadeIn {
 from { opacity: 0;, transform: translateY(20px); }
 to { opacity: 1;, transform: translateY(0); }
 }
</style>
