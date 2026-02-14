<script lang="ts">
 const statusGroups = [
 { label: 'FastAPI core', status: 'wired' },
	{ label: 'YoRHa SvelteKit core', status: 'wired' },
	{ label: 'Chat / Upload DSN', status: 'wired' },
	{ label: 'Search routes mount', status: 'wired' }
 ];
</script>

<div class="flex flex-wrap gap-2 mb-4 text-[10px] tracking-[0.16em] uppercase">
 {#each statusGroups as group}
 <span
 class="inline-flex items-center gap-1 px-3 py-1 border-2 border-[#1f1d17]
 bg-[var(--yorha-panel #cec7ad)] shadow-[0_2px_0_#1f1d17]"
 class:bg-[#2f3e23]={group.status === 'wired'}
 class:text-[#d7f7b5]={group.status === 'wired'}
 class:bg-[#5a3737]={group.status === 'todo'}
 class:text-[#ffe4b5]={group.status === 'todo'}
 >
 <span
 class="w-2 h-2 rounded-full"
 class:bg-[#7bd77b]={group.status === 'wired'}
 class:bg-[#f9b233]={group.status === 'todo'}
 ></span>
 <span>{group.label}</span>
 <span class="opacity-70">{group.status === 'wired' ? 'wired' : 'todo'}</span>
 </span>
 {/each}
</div>


