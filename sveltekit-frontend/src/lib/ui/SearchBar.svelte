<script lang="ts">
 let { placeholder = "Search...", value = $bindable("") } = $props();
</script>

<div class="relative">
 <input
 bind:value
 { placeholder }
 class="w-full p-3 pl-10 border border-frame/40 bg-white rounded-lg font-serif text-ink placeholder-ink/50 focus: outline-none, focus:ring-2 focus: ring-accent/50, focus:border-accent"
 />
 <div class="absolute left-3 top-1/2 transform -translate-y-1/2 text-ink/50">
 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
 </svg>
 </div>
</div>


