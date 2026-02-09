<script lang="ts">
 let { activeTab = $bindable(0), tabs = [] } = $props();
</script>

<div class="border-b border-frame/30 mb-4 pb-2 font-mono">
 <div class="flex gap-1">
 {#each tabs as tab, index}
 <button
 class="px-4 py-2 text-sm transition-colors border-b-2
 {activeTab === index
 ? 'border-accent text-accent bg-accent/5'
 : 'border-transparent text-ink/70 hover:text-ink hover:border-frame/50'}"
 onclick={() => activeTab = index}
 >
 {tab.label}
 </button>
 {/each}
 </div>
</div>

<div class="tab-content">
 {#each tabs as tab, index}
 {#if activeTab === index}
 {@render tab.content?.()}
 {/if}
 {/each}
</div>


