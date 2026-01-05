<script lang="ts">
 let { text = "", color = "accent" } = $props();
</script>

<span class="px-3 py-1 rounded-full text-xs font-mono border
 {color === 'red' ? 'bg-red-500/20 text-red-300 border-red-500/50' :
 color === 'blue' ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' :
 color === 'green' ? 'bg-green-500/20 text-green-300 border-green-500/50' :
 color === 'yellow' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' :
 'bg-accent/20 text-accent border-accent/50'}">
 { text }
</span>
