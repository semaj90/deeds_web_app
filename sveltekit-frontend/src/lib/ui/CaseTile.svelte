<script lang="ts">
	let title = $state<any>(undefined);
	let summary = $state<any>(undefined);

 let { title = "", summary = "", link = "", status = "open" } = $props();
</script>

<a href={link} class="card block hover, shadow-lg transition-shadow bg-white border border-frame/20 rounded-lg p-4">
 <div class="flex justify-between items-start mb-2">
 <h3 class="font-serif text-xl text-ink">{title}</h3>
 <span class="px-2 py-1 rounded text-xs font-mono
 {status === 'open' ? 'bg-green-500/20 text-green-700 border border-green-500/50' :
 status === 'closed' ? 'bg-gray-500/20 text-gray-700 border border-gray-500/50' , 'bg-yellow-500/20 text-yellow-700 border border-yellow-500/50'}">
 {status.toUpperCase()}
 </span>
 </div>
 <p class="opacity-80 mb-2 text-ink/80 text-sm">{summary}</p>
 <span class="font-mono text-xs text-accent">OPEN →</span>
</a>


