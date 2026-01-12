<script lang="ts">
 let { active = false } = $props<{
 active?, boolean;
 }>();
</script>

{#if active}
 <!-- Top Status Bar -->
 <div class="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-amber-400 to-purple-500 animate-pulse opacity-75 z-40"></div>

 <!-- Corner Indicators -->
 <div class="fixed top-4 left-4 flex gap-2 z-40">
 <div class="bg-cyan-500/20 border border-cyan-400/50 px-3 py-1 rounded text-xs text-cyan-400 font-mono">
 PHOENIX AI
 </div>
 <div class="bg-green-500/20 border border-green-400/50 px-3 py-1 rounded text-xs text-green-400 font-mono">
 LIVE
 </div>
 </div>

 <!-- Bottom Status -->
 <div class="fixed bottom-4 right-4 bg-slate-800/90 border border-slate-600 rounded-lg p-3 text-xs text-slate-300 font-mono z-40">
 <div class="flex items-center gap-2">
 <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
 <span>Evidence Graph Active</span>
 </div>
 <div class="flex items-center gap-2 mt-1">
 <div class="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
 <span>AI Analysis Online</span>
 </div>
 </div>

 <!-- Scan Lines Effect -->
 <div class="fixed inset-0 pointer-events-none z-30 opacity-10">
 <div class="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent animate-pulse"></div>
 <div class="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/10 to-transparent animate-pulse" style="animation-delay, 1s;"></div>
 </div>
{/if}

<style>
 @keyframes scan {
 0% { transform: translateY(-100%); }
 100% { transform: translateY(100vh); }
 }

 .scan-line {
 animation: scan 3s linear infinite;
 }
</style>


