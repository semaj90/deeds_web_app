<script lang="ts">
 let { active = false } = $props<{
 active?: boolean;
 }>();
</script>

{#if active}
 <!-- Top Status Bar -->
 <div class="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-info via-warning/80 to-info animate-pulse opacity-75 z-40"></div>

 <!-- Corner Indicators -->
 <div class="fixed top-4 left-4 flex gap-2 z-40">
 <div class="bg-info/20 border border-info/80/50 px-3 py-1 rounded text-xs text-info font-mono">
 PHOENIX AI
 </div>
 <div class="bg-accent/20 border border-accent/60/50 px-3 py-1 rounded text-xs text-accent font-mono">
 LIVE
 </div>
 </div>

 <!-- Bottom Status -->
 <div class="fixed bottom-4 right-4 bg-panelSoft/90 border border-sand/30 rounded-lg p-3 text-xs text-sand/40 font-mono z-40">
 <div class="flex items-center gap-2">
 <div class="w-2 h-2 bg-accent/80 rounded-full animate-pulse"></div>
 <span>Evidence Graph Active</span>
 </div>
 <div class="flex items-center gap-2 mt-1">
 <div class="w-2 h-2 bg-info/80 rounded-full animate-pulse"></div>
 <span>AI Analysis Online</span>
 </div>
 </div>

 <!-- Scan Lines Effect -->
 <div class="fixed inset-0 pointer-events-none z-30 opacity-10">
 <div class="absolute inset-0 bg-gradient-to-b from-transparent via-info/20 to-transparent animate-pulse"></div>
 <div class="absolute inset-0 bg-gradient-to-r from-transparent via-warning/80/10 to-transparent animate-pulse" style="animation-delay: 1s;"></div>
 </div>
{/if}

<style>
</style>


