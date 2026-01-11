<script lang="ts">
	let header = $state<any>(undefined);
	let cell = $state<any>(undefined);

 let { headers = [], data = [] } = $props();
</script>

<div class="overflow-x-auto">
 <table class="w-full border-collapse border border-frame/20 bg-white rounded-lg overflow-hidden">
 {#if headers.length > 0}
 <thead class="bg-ink/5">
 <tr>
 {#each headers as header}
 <th class="border border-frame/20 px-4 py-3 text-left font-mono text-sm text-ink">
 {header}
 </th>
 {/each}
 </tr>
 </thead>
 {/if}
 <tbody>
 {#each data as row}
 <tr class="hover:bg-frame/5 transition-colors">
 {#each row as cell}
 <td class="border border-frame/20 px-4 py-3 font-serif text-sm text-ink/80">
 {cell}
 </td>
 {/each}
 </tr>
 {/each}
 </tbody>
 </table>
</div>


